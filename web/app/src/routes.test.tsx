import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AppRoutes } from './routes'

// Explicit rather than relying on RTL's auto-cleanup, which only runs when vitest `globals` is on.
afterEach(cleanup)

/** Cold-load the router at a URL, exactly as a pasted deep link would. */
function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

function routeName(): string | null {
  return document.querySelector('[data-route]')?.getAttribute('data-route') ?? null
}

/** The URL contract from the spec's "Routing — every surface is a URL" section.
 *  These paths are pasteable links; changing one breaks a teammate's bookmark,
 *  so the map is asserted URL-by-URL rather than through the (future) nav. */
describe('route map', () => {
  const cases: Array<[url: string, route: string, title: string]> = [
    ['/', 'tasks', 'Tasks'],
    ['/new', 'new', 'New task'],
    ['/tasks/abc123', 'task-thread', 'Thread'],
    ['/tasks/abc123/changes', 'task-changes', 'Changes'],
    ['/tasks/abc123/files', 'task-files', 'Files'],
    ['/compare/grp-1', 'compare', 'Compare variants'],
    ['/git', 'git', 'Git'],
    ['/github', 'github', 'GitHub'],
    ['/github/issues/42', 'github-issue', 'Issue'],
    ['/github/prs/7', 'github-pr', 'Pull request'],
    ['/inbox', 'inbox', 'Inbox'],
    ['/workflows', 'workflows', 'Workflows'],
    ['/workflows/ship-it', 'workflow', 'Workflow'],
    ['/settings', 'settings', 'Settings'],
    ['/settings/skills', 'settings-skills', 'Skills'],
    ['/settings/appearance', 'settings-appearance', 'Appearance'],
    ['/settings/agents', 'settings-agents', 'Agents'],
  ]

  for (const [url, route, title] of cases) {
    it(`${url} → ${route}`, () => {
      renderAt(url)
      expect(routeName()).toBe(route)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title)
    })
  }

  // The tab lives in the path, so /tasks/:id/changes must not fall back to the thread.
  it('a task tab deep link renders the tab, not the thread', () => {
    renderAt('/tasks/abc123/changes')
    expect(screen.queryByRole('heading', { name: 'Thread' })).toBeNull()
  })

  const unknown = ['/nope-404', '/tasks', '/settings/nope', '/tasks/abc123/nope', '/compare']
  for (const url of unknown) {
    it(`${url} → the 404 route`, () => {
      renderAt(url)
      expect(routeName()).toBe('not-found')
    })
  }
})

/** The bookmarklet contract (spec 011), protected by BACKWARD_COMPATIBILITY.md:
 *  `/new?skill=&ref=&auto=1&key=`. The params must survive the move off the
 *  legacy page — the composer (Step R4) is what will finally consume them. */
describe('/new query params', () => {
  it('parses the full bookmarklet deep link', () => {
    renderAt('/new?skill=om-code-review&ref=https%3A%2F%2Fgithub.com%2Fo%2Fr%2Fpull%2F1&auto=1&key=s3cret')
    expect(screen.getByTestId('new-task-param-skill').textContent).toBe('om-code-review')
    expect(screen.getByTestId('new-task-param-ref').textContent).toBe('https://github.com/o/r/pull/1')
    expect(screen.getByTestId('new-task-param-auto').textContent).toBe('true')
  })

  it('renders without params', () => {
    renderAt('/new')
    expect(routeName()).toBe('new')
    expect(screen.getByTestId('new-task-param-skill').textContent).toBe('')
    expect(screen.getByTestId('new-task-param-auto').textContent).toBe('false')
  })

  it('never prints the launch key, only whether one arrived', () => {
    renderAt('/new?key=s3cret')
    expect(screen.getByTestId('new-task-param-key').textContent).toBe('present')
    expect(document.body.textContent).not.toContain('s3cret')
  })
})
