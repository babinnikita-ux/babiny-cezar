import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AgentBrowser } from './agent-browser'

/**
 * The task thread (`/tasks/:id`, R3 Step 1.1) in a real browser, against a real cezar serving
 * a run whose transcript is a REAL NDJSON file — `fixtures/thread-run.ndjson`, the verbatim
 * output of an R2 dry run (see fixtures/README.md). The server replays it over the per-run SSE
 * stream exactly as it would for any finished run, so what this spec sees is the full pipe:
 * store → SSE replay → reducer → thread view → Streamdown → the lazy Shiki singleton.
 *
 * Same boot-own-server doctrine as quick-list.e2e.ts: the run store reads `runs.json` once at
 * startup, so the fixture must exist before boot; a terminal (`done`) status keeps `recover()`
 * from touching the run.
 */

const artifactsDir = resolve(import.meta.dirname, '../../../.ai/qa/artifacts_e2e')
const repoRoot = resolve(import.meta.dirname, '../../..')
const sessionId = `e2e-thread-${process.pid}`

/** The run record for the committed transcript — `RunRecord`, the store's zod-checked shape. */
const RUN = {
  id: 'fix-thread',
  title: 'Summarize what this project does. mock:md',
  titleSummary: 'Explain what cezar does',
  workflow: 'quick-task',
  task: 'Summarize what this project does. mock:md',
  runner: 'claude',
  status: 'done',
  createdAt: '2026-07-14T19:42:53.000Z',
  startedAt: '2026-07-14T19:42:53.400Z',
  finishedAt: '2026-07-14T19:42:54.800Z',
  tokensUsed: 1120,
  costUsd: 0.0061,
  archived: false,
  steps: [
    {
      id: 'task',
      name: 'Do the task',
      kind: 'agent',
      status: 'done',
      iterations: 1,
      tokensUsed: 1120,
    },
  ],
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`cezar e2e: the fixture server never answered at ${url}`)
}

let browser: AgentBrowser
let server: ChildProcess
let dataRoot: string
let baseUrl: string

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'cezar-e2e-thread-'))
  mkdirSync(join(dataRoot, '.ai/cezar/runs'), { recursive: true })
  writeFileSync(join(dataRoot, '.ai/cezar/runs.json'), JSON.stringify([RUN], null, 2), 'utf8')
  copyFileSync(
    resolve(import.meta.dirname, 'fixtures/thread-run.ndjson'),
    join(dataRoot, '.ai/cezar/runs', 'fix-thread.ndjson'),
  )

  const port = await freePort()
  baseUrl = `http://localhost:${port}`
  server = spawn(
    process.execPath,
    [join(repoRoot, 'dist/index.js'), 'serve', '--repo', dataRoot, '--port', String(port), '--no-open'],
    { env: { ...process.env, CEZ_DRY_RUN: '1' }, stdio: 'ignore' },
  )
  await waitForHealth(baseUrl)

  browser = AgentBrowser.open(sessionId)
  browser.setViewport(1440, 900)
  browser.goto(`${baseUrl}/tasks/fix-thread`)
  // The thread is async twice over (lazy route chunk, then the SSE replay) — wait for content.
  browser.waitForFunction(`document.querySelectorAll('[data-slot="user-bubble"]').length >= 2`)
}, 120_000)

afterAll(() => {
  browser?.close()
  server?.kill()
  if (dataRoot) rmSync(dataRoot, { recursive: true, force: true })
})

describe('task thread', () => {
  it('renders the task and the follow-up as right-aligned user bubbles', () => {
    const bubbles = browser.evaluate(
      `[...document.querySelectorAll('[data-slot="user-bubble"]')].map((el) => el.textContent)`,
    ) as string[]
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]).toContain('Summarize what this project does.')
    expect(bubbles[1]).toBe('Thanks — now list the three main components as bullets.')

    // Right-aligned: the bubble hugs the column's right content edge (within its padding),
    // sits entirely right of the midline, while assistant content starts at the left edge.
    const geometry = browser.evaluate(`(() => {
      const bubble = document.querySelector('[data-slot="user-bubble"]')
      const message = document.querySelector('[data-slot="assistant-message"]')
      const column = bubble.parentElement
      const b = bubble.getBoundingClientRect(), c = column.getBoundingClientRect(), m = message.getBoundingClientRect()
      return { rightGap: c.right - b.right, bubbleLeft: b.left, mid: c.left + c.width / 2, messageLeft: m.left - c.left }
    })()`) as { rightGap: number; bubbleLeft: number; mid: number; messageLeft: number }
    expect(geometry.rightGap).toBeLessThan(40) // only the column padding separates them
    expect(geometry.bubbleLeft).toBeGreaterThan(geometry.mid)
    expect(geometry.messageLeft).toBeLessThan(40)
  })

  it('renders the assistant reply as markdown — heading, table, list, no raw ** anywhere', () => {
    expect(
      browser.evaluate(`document.querySelector('[data-slot="assistant-message"] [data-streamdown="heading-2"]')?.textContent`),
    ).toBe('Markdown fixture')
    expect(browser.count('[data-slot="assistant-message"] [data-streamdown="table"]')).toBe(1)
    expect(browser.count('[data-slot="assistant-message"] [data-streamdown="list-item"]')).toBeGreaterThan(3)
    expect(
      browser.evaluate(`document.querySelector('[data-slot="assistant-message"]').textContent.includes('**')`),
    ).toBe(false)
    // The dedup rule end-to-end: the fixture file carries the v1 `text` twin of this message —
    // exactly one copy renders.
    expect(browser.count('[data-slot="assistant-message"] [data-streamdown="heading-2"]')).toBe(1)
  })

  it('highlights the ts fence through the lazy Shiki singleton, themed by the --syn-* tokens', () => {
    // Highlighting is async (shiki core + grammar are lazy chunks) — wait for a colored token.
    browser.waitForFunction(
      `[...document.querySelectorAll('[data-streamdown="code-block-body"] span')].some((s) => s.style.getPropertyValue('--sdm-c') === 'var(--syn-key)')`,
    )
    const block = browser.evaluate(`(() => {
      const block = document.querySelector('[data-streamdown="code-block"]')
      const keyword = [...block.querySelectorAll('span')].find((s) => s.style.getPropertyValue('--sdm-c') === 'var(--syn-key)')
      return {
        language: block.dataset.language,
        chip: block.querySelector('[data-streamdown="code-block-header"]').textContent,
        copy: block.querySelector('[data-streamdown="code-block-copy-button"]') !== null,
        keywordText: keyword.textContent,
        // Resolved through the real cascade: the token's painted color IS the --syn-key value.
        keywordColor: getComputedStyle(keyword).color,
        synKey: getComputedStyle(document.documentElement).getPropertyValue('--syn-key').trim(),
      }
    })()`) as { language: string; chip: string; copy: boolean; keywordText: string; keywordColor: string; synKey: string }

    expect(block.language).toBe('ts')
    expect(block.chip).toBe('ts')
    expect(block.copy).toBe(true)
    expect(block.keywordText).toBe('const')
    const hexToRgb = (hex: string) =>
      `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`
    expect(block.keywordColor).toBe(hexToRgb(block.synKey))
  })

  it('keeps Shiki out of the main bundle — its chunks load lazily, after the thread route', () => {
    const chunks = browser.evaluate(`performance.getEntriesByType('resource')
      .map((e) => e.name.split('/').pop())
      .filter((n) => /^(core|engine-javascript|typescript)-/.test(n))`) as string[]
    // They loaded (the fence above is highlighted)…
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    // …as their own files, which is what "not in the main bundle" means at runtime.
    expect(chunks.every((n) => !n.startsWith('index-'))).toBe(true)
  })

  it('dims lifecycle lines and shows the closed-session footer for a done run', () => {
    const notes = browser.evaluate(
      `[...document.querySelectorAll('[data-slot="note-line"]')].map((el) => ({ tone: el.dataset.tone, text: el.textContent }))`,
    ) as Array<{ tone: string; text: string }>
    expect(notes.length).toBeGreaterThanOrEqual(3)
    expect(notes.every((n) => n.tone === 'dim')).toBe(true)
    expect(notes.some((n) => n.text.includes('worktree ready'))).toBe(true)

    const footer = browser.evaluate(`(() => {
      const el = document.querySelector('[data-slot="thread-footer"]')
      return { state: el.dataset.state, text: el.textContent }
    })()`) as { state: string; text: string }
    expect(footer.state).toBe('closed')
    expect(footer.text).toBe('Session closed')
  })

  it('shows the auto-summary title and the done pill in the header', () => {
    expect(browser.evaluate(`document.querySelector('[data-route="task-thread"] h1').textContent`)).toBe(
      'Explain what cezar does',
    )
    expect(browser.evaluate(`document.querySelector('[data-slot="pill"]').textContent`)).toBe('done')
    browser.screenshot(`${artifactsDir}/thread-desktop.png`)
  })

  it('an unknown run id lands on the 404-style state with a way home', () => {
    browser.goto(`${baseUrl}/tasks/no-such-run`)
    browser.waitForFunction(`document.querySelector('[data-slot="centered-state"] h1')?.textContent === 'Task not found'`)
    expect(browser.evaluate(`document.querySelector('[data-slot="centered-state"] a[href="/"]').textContent`)).toBe(
      'Back to tasks',
    )
  })

  it('reflows at iPhone width with no horizontal overflow', () => {
    browser.setViewport(390, 844)
    browser.goto(`${baseUrl}/tasks/fix-thread`)
    browser.waitForFunction(`document.querySelectorAll('[data-slot="user-bubble"]').length >= 2`)
    browser.waitForFunction(`document.querySelector('[data-streamdown="code-block"]') !== null`)

    expect(browser.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true)
    // The wide fixture table/code scroll inside their own boxes, not the page.
    expect(
      browser.evaluate(`(() => {
        const main = document.querySelector('[data-slot="main"]')
        return main.scrollWidth <= main.clientWidth
      })()`),
    ).toBe(true)

    browser.screenshot(`${artifactsDir}/thread-mobile.png`)
    browser.setViewport(1440, 900)
  })
})
