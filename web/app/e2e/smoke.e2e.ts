import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AgentBrowser, readTestEnv } from './agent-browser'

/**
 * R1 smoke test — the real app, a real Chrome, through the agent-browser provider.
 *
 * Scope is deliberately tiny: prove the two shells the server can serve are wired to the
 * right routes and actually render. Feature coverage belongs in the steps that add features;
 * this file must stay fast and boring so a checkpoint failure always means something real.
 *
 * The app shell at `/` is still a placeholder (Step 2.1 landed the route map, not the views),
 * so the assertions here are limited to what honestly exists today: React mounts into #root
 * on the `/` route, and the Tailwind theme resolves its color from the `--background` token.
 */

const artifactsDir = resolve(import.meta.dirname, '../../../.ai/qa/artifacts_e2e')
const runId = `e2e-${process.pid}`

let browser: AgentBrowser
let baseUrl: string

beforeAll(() => {
  baseUrl = readTestEnv().baseUrl
  browser = AgentBrowser.open(runId)
})

afterAll(() => {
  browser?.close()
})

describe('cockpit shell routing', () => {
  it('serves the React cockpit at /', () => {
    browser.goto(baseUrl + '/')

    // React actually mounted — an empty #root would mean the bundle failed to execute,
    // which is the failure a "200 OK" curl check would happily miss.
    expect(browser.evaluate('document.getElementById("root")?.childElementCount ?? 0')).toBeGreaterThan(0)
    // `/` resolves to the tasks overview route (spec's route map).
    expect(browser.text('#root h1')).toBe('Tasks')

    // The token-driven background reaches the DOM: compare the shell's computed color against
    // the value `--background` resolves to, rather than a hardcoded rgb() — this stays true
    // when the palette changes, and fails if the token pipeline breaks.
    const [applied, token] = browser.evaluate(`(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--background)'
      document.body.appendChild(probe)
      const token = getComputedStyle(probe).backgroundColor
      probe.remove()
      const shell = getComputedStyle(document.querySelector('main')).backgroundColor
      return [shell, token]
    })()`) as [string, string]
    expect(token).toMatch(/^rgb/)
    expect(applied).toBe(token)

    // The legacy shell must not be what we just loaded.
    expect(browser.evaluate('document.getElementById("brand") === null')).toBe(true)

    browser.screenshot(`${artifactsDir}/react-shell.png`)
  })

  it('serves the legacy cockpit at /?legacy=1', () => {
    browser.goto(baseUrl + '/?legacy=1')

    // #brand is legacy-only markup from web/index.html — it exists in no React template.
    expect(browser.isVisible('#brand')).toBe(true)
    expect(browser.text('#brand .brand-name')).toBe('cezar')
    expect(browser.evaluate('document.getElementById("root") === null')).toBe(true)

    browser.screenshot(`${artifactsDir}/legacy-shell.png`)
  })
})
