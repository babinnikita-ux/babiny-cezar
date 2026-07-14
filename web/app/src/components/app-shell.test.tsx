import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell, type AppShellProps } from './app-shell'
import { ThemeProvider } from './theme-provider'

afterEach(cleanup)

// jsdom ships no `matchMedia`; the ThemeProvider wrapping the footer toggle needs one.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  )
})

/** Mount the shell at a URL, exactly as a cold-loaded deep link would.
 *
 *  jsdom has no layout engine and no media queries: nothing here can (or pretends to) measure a
 *  breakpoint. Responsive behavior is asserted structurally — the elements and the responsive
 *  classes that carry them — and verified for real in the e2e suite at an iPhone viewport.
 */
function renderShell(entry = '/', props: Partial<AppShellProps> = {}, children: ReactNode = <p>route content</p>) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[entry]}>
        <AppShell {...props}>{children}</AppShell>
      </MemoryRouter>
    </ThemeProvider>
  )
}

const nav = () => screen.getByRole('navigation', { name: 'Main' })
const sidebar = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement
const footer = () => document.querySelector('[data-slot="sidebar-footer"]') as HTMLElement

describe('AppShell', () => {
  it('renders the routed view in the main region', () => {
    renderShell('/', {}, <p>route content</p>)
    expect(within(screen.getByRole('main')).getByText('route content')).toBeTruthy()
  })

  it('renders the whole nav as real router links', () => {
    renderShell()
    const links = within(nav()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual([
      'Tasks',
      'Inbox',
      'Git',
      'GitHub',
      'Skills',
      'Workflows',
      'Settings',
    ])
    // Deep-linkable per Step 2.1: every nav row is an <a href>, not a button with an onClick.
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/inbox',
      '/git',
      '/github',
      '/settings/skills',
      '/workflows',
      '/settings',
    ])
  })

  describe('active nav state follows the current route', () => {
    const cases: Array<[entry: string, active: string]> = [
      ['/', 'Tasks'],
      ['/git', 'Git'],
      ['/settings/skills', 'Skills'],
      // Tasks stays lit while a task thread is open (spec's "Task list & table").
      ['/tasks/abc123', 'Tasks'],
    ]

    for (const [entry, active] of cases) {
      it(`${entry} → ${active}`, () => {
        renderShell(entry)
        const current = within(nav()).getAllByRole('link', { current: 'page' })
        // Exactly one — two lit rows is as wrong as none.
        expect(current).toHaveLength(1)
        expect(current[0]?.textContent).toBe(active)
      })
    }

    it('lights nothing on a full-screen surface like /new', () => {
      renderShell('/new')
      expect(within(nav()).queryAllByRole('link', { current: 'page' })).toHaveLength(0)
    })
  })

  describe('New task button', () => {
    it('links to /new', () => {
      renderShell()
      expect(within(sidebar()).getByRole('link', { name: /New task/ }).getAttribute('href')).toBe('/new')
    })

    it('renders the ⌘N hint', () => {
      renderShell()
      const link = within(sidebar()).getByRole('link', { name: /New task/ })
      expect(within(link).getByText('⌘N').tagName).toBe('KBD')
    })
  })

  it('puts the theme toggle in the sidebar footer', () => {
    renderShell()
    expect(within(footer()).getByRole('button', { name: /^Theme:/ })).toBeTruthy()
  })

  describe('data slots stay empty rather than showing invented data', () => {
    it('renders no repo chip, badge or version chip when unfed', () => {
      renderShell()
      expect(document.querySelector('[data-slot="repo-chip"]')).toBeNull()
      expect(document.querySelector('[data-slot="nav-badge"]')).toBeNull()
      expect(document.querySelector('[data-slot="version-chip"]')).toBeNull()
    })

    it('renders the repo chip and version chip from props', () => {
      renderShell('/', { repo: { name: 'cezar', branch: 'main' }, version: 'v1.2.3' })
      expect(screen.getByText('cezar / main')).toBeTruthy()
      expect(within(footer()).getByText('v1.2.3')).toBeTruthy()
    })

    it('renders the Inbox badge only for a non-zero count', () => {
      renderShell('/', { inboxCount: 2 })
      const inbox = within(nav()).getByRole('link', { name: /Inbox/ })
      expect(within(inbox).getByText('2')).toBeTruthy()

      cleanup()
      renderShell('/', { inboxCount: 0 })
      expect(document.querySelector('[data-slot="nav-badge"]')).toBeNull()
    })

    it('reserves the quick-list, tools and composer slots for later Steps', () => {
      renderShell()
      for (const slot of ['task-quick-list', 'tools-menu', 'composer']) {
        expect(document.querySelector(`[data-slot="${slot}"]`)).not.toBeNull()
      }
    })
  })

  /** jsdom cannot evaluate `md:` — so assert the structure and the responsive classes that
   *  encode it, and leave "does it actually reflow at 390px" to the e2e iPhone screenshot. */
  describe('responsive skeleton', () => {
    it('hides the sidebar below md and shows it from md up', () => {
      renderShell()
      expect(sidebar().className).toContain('hidden')
      expect(sidebar().className).toContain('md:flex')
    })

    it('shows the mobile top bar below md only', () => {
      renderShell()
      const bar = document.querySelector('[data-slot="mobile-top-bar"]') as HTMLElement
      expect(bar).not.toBeNull()
      expect(bar.className).toContain('md:hidden')
    })

    it('titles the mobile bar from the active route', () => {
      renderShell('/settings/skills')
      const bar = document.querySelector('[data-slot="mobile-top-bar"]') as HTMLElement
      expect(within(bar).getByText('Skills')).toBeTruthy()
    })

    it('calls onOpenMenu when the menu button is pressed — Step 2.4 owns the drawer', () => {
      const onOpenMenu = vi.fn()
      renderShell('/', { onOpenMenu })
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
      expect(onOpenMenu).toHaveBeenCalledOnce()
    })
  })

  /** The layout contract from the spec. These classes are the whole reason the cockpit does not
   *  scroll its document or clip its composer on an iPhone — a refactor that drops one is a
   *  regression no visual test would catch on a desktop viewport. */
  describe('layout contract', () => {
    it('is exactly one viewport tall and never scrolls the document', () => {
      renderShell()
      const shell = document.querySelector('[data-slot="app-shell"]') as HTMLElement
      // h-dvh, not h-screen: 100vh ignores mobile browser chrome.
      expect(shell.className).toContain('h-dvh')
      expect(shell.className).not.toContain('h-screen')
      expect(shell.className).toContain('overflow-hidden')
    })

    it('makes the main region the only scroller, and contains its overscroll', () => {
      renderShell()
      const main = screen.getByRole('main')
      expect(main.className).toContain('overflow-y-auto')
      expect(main.className).toContain('overscroll-contain')
    })

    it('pads for the safe-area insets', () => {
      renderShell()
      const shell = document.querySelector('[data-slot="app-shell"]') as HTMLElement
      expect(shell.className).toContain('pl-[env(safe-area-inset-left)]')

      const bar = document.querySelector('[data-slot="mobile-top-bar"]') as HTMLElement
      expect(bar.className).toContain('pt-[env(safe-area-inset-top)]')

      // The composer row keeps the home-indicator gutter even while it is empty.
      const composer = document.querySelector('[data-slot="composer"]') as HTMLElement
      expect(composer.className).toContain('pb-[env(safe-area-inset-bottom)]')
    })
  })
})
