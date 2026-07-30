import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AgentBrowser, bootProjectId, fixtureServeEnv } from './agent-browser'
import { largeThreadEvents } from './fixtures/make-large-thread'
import record from './fixtures/thread-run.record.json'

const repoRoot = resolve(import.meta.dirname, '../../..')
const artifactsDir = resolve(repoRoot, '.ai/qa/artifacts_e2e')
const sessionId = `e2e-progressive-history-${process.pid}`
const RUN_ID = 'cccccccc-1111-4222-8333-dddddddddddd'
const RUN = {
  ...record,
  id: RUN_ID,
  title: 'Progressively page a very long session',
  titleSummary: 'Progressively page a long session',
  task: 'Inspect a long session without downloading the archive.',
  status: 'running',
  finishedAt: undefined,
  steps: [record.steps[0]],
  pullRequestUrl: undefined,
}

const contextPrefix = [
  {
    type: 'turn.started',
    turnId: 'context-turn',
    stepId: 'task',
  },
  {
    type: 'plan.updated',
    stepId: 'task',
    entries: [{ content: 'Keep the current plan visible', status: 'in_progress' }],
  },
  {
    type: 'item.started',
    stepId: 'task',
    item: {
      kind: 'tool',
      id: 'history-agent',
      name: 'Task',
      toolKind: 'task',
      title: 'Task: watch current history work',
      status: 'running',
    },
  },
]

const events = [...contextPrefix, ...largeThreadEvents(300)].map((event, index) => ({
  ...event,
  seq: index + 1,
  ts: new Date(Date.parse('2026-07-30T00:00:00.000Z') + index * 10).toISOString(),
}))

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolvePort(port))
    })
  })
}

async function waitForHealth(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/v1/health`)).ok) return
    } catch {
      // Server startup is expected to race the first probes.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`cezar e2e: fixture server never answered at ${baseUrl}`)
}

let browser: AgentBrowser
let server: ChildProcess
let dataRoot: string
let baseUrl: string
let bootProject: string

const cursorRequestCount = `performance.getEntriesByType('resource').filter((entry) => {
  const url = new URL(entry.name)
  return url.pathname.endsWith('/runs/${RUN_ID}/history') && url.searchParams.has('cursor')
}).length`

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'cezar-e2e-progressive-history-'))
  mkdirSync(join(dataRoot, '.ai/cezar/runs'), { recursive: true })
  writeFileSync(join(dataRoot, '.ai/cezar/runs.json'), JSON.stringify([RUN], null, 2), 'utf8')
  writeFileSync(
    join(dataRoot, '.ai/cezar/runs', `${RUN_ID}.ndjson`),
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    'utf8',
  )
  const port = await freePort()
  baseUrl = `http://localhost:${port}`
  server = spawn(
    process.execPath,
    [join(repoRoot, 'packages/cezar/dist/index.js'), 'serve', '--repo', dataRoot, '--port', String(port), '--no-open'],
    { env: fixtureServeEnv(dataRoot), stdio: 'ignore' },
  )
  await waitForHealth(baseUrl)
  bootProject = await bootProjectId(baseUrl)
  browser = AgentBrowser.open(sessionId)
  browser.setViewport(1440, 900)
  browser.goto(`${baseUrl}/p/${bootProject}/tasks/${RUN_ID}`)
  browser.waitForFunction(
    `document.querySelector('[data-route="task-thread"]') !== null &&
     document.querySelector('[data-slot="thread-rows"]') !== null`,
  )
}, 120_000)

afterAll(() => {
  browser?.close()
  server?.kill()
  try {
    if (dataRoot) rmSync(dataRoot, { recursive: true, force: true })
  } catch {
    // The killed fixture may still be releasing its transcript file; the OS reaps the temp dir.
  }
})

describe('progressive long-session history', () => {
  it('paints the current tail and docks without requesting an earlier page', () => {
    expect(Number(browser.evaluate(cursorRequestCount))).toBe(0)
    expect(browser.text('[data-slot="plan-dock"]')).toContain('Keep the current plan visible')
    expect(browser.text('[data-slot="agents-dock"]')).toContain('0/1')
    expect(browser.count('[data-slot="thread-row"]')).toBeLessThan(300)
    browser.screenshot(join(artifactsDir, 'progressive-history-tail.png'), { viewport: true })
  })

  it('loads exactly one page from the accessible control and preserves a bounded page count', async () => {
    browser.click('[data-slot="history-boundary"] button')
    browser.waitForFunction(`${cursorRequestCount} === 1`)
    browser.waitForFunction(
      `document.querySelector('[data-slot="history-boundary"]')?.dataset.retainedPages === '2'`,
    )
    expect(Number(browser.evaluate(cursorRequestCount))).toBe(1)
    browser.screenshot(join(artifactsDir, 'progressive-history-earlier-page.png'), { viewport: true })
    // Let the prepend anchor's requestAnimationFrame settle before the next test supplies
    // a genuinely fresh upward gesture.
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  })

  it('consumes one upward intent without cascading while the boundary remains near', async () => {
    browser.evaluate(`(() => {
      const main = document.querySelector('[data-slot="main"]')
      main.scrollTop = 0
      main.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
    })()`)
    browser.waitForFunction(`${cursorRequestCount} === 2`)
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
    expect(Number(browser.evaluate(cursorRequestCount))).toBe(2)
  })

  it('caps retained pages at five and jumps directly back to a fresh tail', () => {
    let page = Number(browser.evaluate(
      `document.querySelector('[data-slot="history-boundary"]')?.dataset.retainedPages`,
    ))
    while (page < 5) {
      page += 1
      browser.click('[data-slot="history-boundary"] button')
      browser.waitForFunction(
        `document.querySelector('[data-slot="history-boundary"]')?.dataset.retainedPages === '${page}'`,
      )
    }
    expect(Number(browser.evaluate(
      `document.querySelector('[data-slot="history-boundary"]')?.dataset.retainedPages`,
    ))).toBe(5)
    browser.evaluate(`document.querySelector('[data-slot="main"]').scrollTop = 0`)
    browser.waitForFunction(`document.querySelector('[data-slot="jump-to-latest"]') !== null`)
    browser.click('[data-slot="jump-to-latest"]')
    browser.waitForFunction(
      `document.querySelector('[data-slot="history-boundary"]')?.dataset.retainedPages === '1'`,
    )
  })
})
