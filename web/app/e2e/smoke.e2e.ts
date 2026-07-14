import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AgentBrowser, readTestEnv } from './agent-browser'

/**
 * R1 smoke test — the real app, a real Chrome, through the agent-browser provider.
 *
 * Scope stays deliberately small: prove the shell the server serves is the right one, is wired
 * to the right routes, and actually lays out. Feature coverage belongs to the steps that add
 * features; this file must stay fast and boring so a checkpoint failure always means something real.
 *
 * Since Step 2.3 the `/` route renders the real app shell (sidebar + single scrolling main),
 * so the assertions below are about that shell rather than the old placeholder.
 */

const artifactsDir = resolve(import.meta.dirname, '../../../.ai/qa/artifacts_e2e')
const runId = `e2e-${process.pid}`

const DESKTOP = { width: 1440, height: 900 }
const IPHONE = { width: 390, height: 844 } // iPhone 14/15 CSS pixels

let browser: AgentBrowser
let baseUrl: string

beforeAll(() => {
  baseUrl = readTestEnv().baseUrl
  browser = AgentBrowser.open(runId)
})

afterAll(() => {
  browser?.close()
})

/** Flip the theme the way the pre-paint script does, then let React pick it up on reload.
 *  Driving the storage key (rather than the toggle button) keeps this independent of where the
 *  toggle currently sits in the chrome. The toggle itself is covered by the unit tests. */
function setTheme(theme: 'light' | 'dark'): void {
  browser.evaluate(`localStorage.setItem('cez-theme', ${JSON.stringify(theme)})`)
  browser.goto(baseUrl + '/')
}

describe('cockpit app shell', () => {
  beforeAll(() => {
    browser.setViewport(DESKTOP.width, DESKTOP.height)
  })

  it('serves the React cockpit at /', () => {
    browser.goto(baseUrl + '/')

    // React actually mounted — an empty #root would mean the bundle failed to execute,
    // which is the failure a "200 OK" curl check would happily miss.
    expect(browser.evaluate('document.getElementById("root")?.childElementCount ?? 0')).toBeGreaterThan(0)

    // The token-driven background reaches the DOM: compare the shell's computed color against
    // the value `--background` resolves to, rather than a hardcoded rgb() — this stays true
    // when the palette changes, and fails if the token pipeline breaks.
    const [applied, token] = browser.evaluate(`(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--background)'
      document.body.appendChild(probe)
      const token = getComputedStyle(probe).backgroundColor
      probe.remove()
      const shell = getComputedStyle(document.querySelector('[data-slot="app-shell"]')).backgroundColor
      return [shell, token]
    })()`) as [string, string]
    expect(token).toMatch(/^rgb/)
    expect(applied).toBe(token)

    // The legacy shell must not be what we just loaded.
    expect(browser.evaluate('document.getElementById("brand") === null')).toBe(true)
  })

  it('renders the sidebar brand and the whole nav', () => {
    browser.goto(baseUrl + '/')

    expect(browser.isVisible('[data-slot="sidebar"]')).toBe(true)
    expect(browser.isVisible('[data-slot="brand-tile"]')).toBe(true)
    expect(browser.text('[data-slot="sidebar"] nav')).toContain('Tasks')

    const labels = browser.evaluate(
      `Array.from(document.querySelectorAll('[data-slot="sidebar"] nav a')).map(a => a.textContent.trim())`
    )
    expect(labels).toEqual(['Tasks', 'Inbox', 'Git', 'GitHub', 'Skills', 'Workflows', 'Settings'])

    // The "New task" CTA and its accelerator hint.
    expect(browser.text('[data-slot="sidebar"] a[href="/new"]')).toContain('New task')
    expect(browser.text('[data-slot="sidebar"] a[href="/new"] kbd')).toBe('⌘N')

    // The theme toggle lives in the footer.
    expect(browser.isVisible('[data-slot="sidebar-footer"] [data-slot="theme-toggle"]')).toBe(true)
  })

  it('marks exactly one nav item active, following the route', () => {
    const activeLabel = () =>
      browser.evaluate(
        `Array.from(document.querySelectorAll('[data-slot="sidebar"] nav a[aria-current="page"]')).map(a => a.textContent.trim())`
      )

    browser.goto(baseUrl + '/')
    expect(activeLabel()).toEqual(['Tasks'])

    browser.goto(baseUrl + '/git')
    expect(activeLabel()).toEqual(['Git'])

    // The nested Settings area: the more specific item wins, and only it.
    browser.goto(baseUrl + '/settings/skills')
    expect(activeLabel()).toEqual(['Skills'])
  })

  it('makes main the only scroller — the document never scrolls', () => {
    browser.goto(baseUrl + '/')

    const layout = browser.evaluate(`(() => {
      const shell = document.querySelector('[data-slot="app-shell"]')
      const main = document.querySelector('[data-slot="main"]')
      return {
        shellHeight: shell.getBoundingClientRect().height,
        viewport: window.innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflowY,
        mainOverflow: getComputedStyle(main).overflowY,
        mainOverscroll: getComputedStyle(main).overscrollBehaviorY,
        sidebarWidth: document.querySelector('[data-slot="sidebar"]').getBoundingClientRect().width,
      }
    })()`) as Record<string, unknown>

    // The shell is exactly one viewport tall — this is what `h-dvh` has to produce.
    expect(layout.shellHeight).toBe(layout.viewport)
    expect(layout.bodyOverflow).toBe('hidden')
    expect(layout.mainOverflow).toBe('auto')
    expect(layout.mainOverscroll).toBe('contain')
    expect(layout.sidebarWidth).toBe(264)
  })

  it('screenshots the shell in both themes', () => {
    setTheme('dark')
    expect(browser.evaluate('document.documentElement.classList.contains("light")')).toBe(false)
    browser.screenshot(`${artifactsDir}/shell-dark.png`)

    setTheme('light')
    expect(browser.evaluate('document.documentElement.classList.contains("light")')).toBe(true)
    // The palette really flipped: light `--background` is white, dark is near-black.
    expect(
      browser.evaluate(`getComputedStyle(document.querySelector('[data-slot="app-shell"]')).backgroundColor`)
    ).toBe('rgb(255, 255, 255)')
    browser.screenshot(`${artifactsDir}/shell-light.png`)

    setTheme('dark')
  })
})

describe('mobile shell', () => {
  beforeAll(() => {
    browser.setViewport(IPHONE.width, IPHONE.height)
  })

  afterAll(() => {
    browser.setViewport(DESKTOP.width, DESKTOP.height)
  })

  it('hides the sidebar and shows the top bar at an iPhone viewport', () => {
    browser.goto(baseUrl + '/')

    expect(browser.isVisible('[data-slot="sidebar"]')).toBe(false)
    expect(browser.isVisible('[data-slot="mobile-top-bar"]')).toBe(true)
    expect(browser.text('[data-slot="mobile-top-bar"]')).toContain('Tasks')

    const bar = browser.evaluate(`(() => {
      const menu = document.querySelector('[data-slot="mobile-top-bar"] button')
      const rect = menu.getBoundingClientRect()
      return { width: rect.width, height: rect.height, label: menu.getAttribute('aria-label') }
    })()`) as { width: number; height: number; label: string }

    // Touch targets ≥44px (spec's mobile rules).
    expect(bar.label).toBe('Open menu')
    expect(bar.width).toBeGreaterThanOrEqual(44)
    expect(bar.height).toBeGreaterThanOrEqual(44)

    browser.screenshot(`${artifactsDir}/shell-iphone.png`)
  })
})

describe('legacy cockpit', () => {
  it('still serves the legacy UI at /?legacy=1', () => {
    browser.goto(baseUrl + '/?legacy=1')

    // #brand is legacy-only markup from web/index.html — it exists in no React template.
    expect(browser.isVisible('#brand')).toBe(true)
    expect(browser.text('#brand .brand-name')).toBe('cezar')
    expect(browser.evaluate('document.getElementById("root") === null')).toBe(true)

    browser.screenshot(`${artifactsDir}/legacy-shell.png`)
  })
})
