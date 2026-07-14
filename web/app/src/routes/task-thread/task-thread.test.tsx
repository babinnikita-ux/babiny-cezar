import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/api/query-client'
import type { ApiRun, RunEvent, RunStatus } from '@/api/types'

import { TaskThreadRoute, ThreadView } from './task-thread'
import { reduceThread } from './thread-state'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const run = (status: RunStatus, extra: Partial<ApiRun> = {}): ApiRun =>
  ({
    id: 'r1',
    title: 'do the thing plz',
    titleSummary: 'Do the thing',
    workflow: 'quick-task',
    task: 'Summarize what this project does.',
    status,
    createdAt: '2026-07-14T12:00:00.000Z',
    tokensUsed: 0,
    archived: false,
    steps: [],
    ...extra,
  }) as ApiRun

const line = (seq: number, type: string, rest: Record<string, unknown> = {}): RunEvent =>
  ({ seq, ts: '2026-07-14T12:00:00.000Z', type, ...rest }) as RunEvent

/** A small real-shaped transcript: dim lines, a v2 message, a tool, a v1 user reply. */
const EVENTS: RunEvent[] = [
  line(1, 'lifecycle', { message: 'run started — workflow "quick-task" (runner: claude)' }),
  line(2, 'note', { message: 'worktree ready — branch cez/r1 (base main)' }),
  line(3, 'turn.started', { turnId: 'turn_1' }),
  line(4, 'item.completed', {
    item: { kind: 'message', id: 'item_1', role: 'assistant', text: 'It is a **cockpit** for agents.' },
  }),
  line(5, 'item.completed', {
    item: { kind: 'tool', id: 'toolu_1', name: 'Bash', toolKind: 'execute', title: 'Ran npm test', status: 'completed', output: 'ok' },
  }),
  line(6, 'item.completed', { item: { kind: 'reasoning', id: 'item_2', text: 'Considering the layout…' } }),
  line(7, 'user-message', { text: 'Thanks!', imageCount: 2 }),
]

describe('ThreadView', () => {
  it('renders the task as the leading user bubble and the v1 reply as another', () => {
    render(<ThreadView run={run('waiting')} thread={reduceThread(EVENTS)} />)
    const bubbles = document.querySelectorAll('[data-slot="user-bubble"]')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]!.textContent).toContain('Summarize what this project does.')
    expect(bubbles[1]!.textContent).toContain('Thanks!')
    expect(bubbles[1]!.textContent).toContain('2 images attached')
  })

  it('renders assistant messages as markdown, not raw text', async () => {
    render(<ThreadView run={run('waiting')} thread={reduceThread(EVENTS)} />)
    // The ** marks became a strong element (Streamdown spells it as a data-tagged span) —
    // the renderer parsed, it didn't echo.
    await waitFor(() => {
      const strong = document.querySelector('[data-slot="assistant-message"] [data-streamdown="strong"]')
      expect(strong?.textContent).toBe('cockpit')
    })
    expect(document.querySelector('[data-slot="assistant-message"]')?.textContent).not.toContain('**')
  })

  it('dims lifecycle lines and shows the plain tool row + folded reasoning', () => {
    render(<ThreadView run={run('waiting')} thread={reduceThread(EVENTS)} />)
    const notes = [...document.querySelectorAll('[data-slot="note-line"]')]
    expect(notes.map((n) => n.getAttribute('data-tone'))).toEqual(['dim', 'dim'])
    expect(notes[1]!.textContent).toContain('worktree ready')

    const toolRow = document.querySelector('[data-slot="tool-row"]')
    expect(toolRow?.textContent).toContain('Ran npm test')
    expect(toolRow?.getAttribute('data-status')).toBe('completed')

    expect(document.querySelector('[data-slot="reasoning-line"]')?.textContent).toContain('Thinking — Considering the layout…')
  })

  it('shows the header title (auto-summary, never the raw title) and the status pill', () => {
    render(<ThreadView run={run('waiting')} thread={reduceThread(EVENTS)} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Do the thing')
    expect(document.querySelector('[data-slot="pill"]')?.textContent).toContain('needs you')
  })

  it('waiting → the paused footer with a pulsing dot', () => {
    render(<ThreadView run={run('waiting')} thread={reduceThread(EVENTS)} />)
    const footer = document.querySelector('[data-slot="thread-footer"]')
    expect(footer?.getAttribute('data-state')).toBe('waiting')
    expect(footer?.textContent).toContain('The agent is paused, waiting for your reply')
    expect(footer?.querySelector('[data-slot="status-dot"]')).not.toBeNull()
  })

  it('done → the closed footer; failed → the danger footer carrying the run error', () => {
    render(<ThreadView run={run('done')} thread={reduceThread(EVENTS)} />)
    expect(document.querySelector('[data-slot="thread-footer"]')?.textContent).toBe('Session closed')
    cleanup()

    render(<ThreadView run={run('failed', { error: 'checks failed' })} thread={reduceThread(EVENTS)} />)
    const footer = document.querySelector('[data-slot="thread-footer"]')
    expect(footer?.textContent).toBe('Session failed — checks failed')
    expect(footer?.className).toContain('text-danger')
  })

  it('running → no footer (the stream itself is the status), and no invented empty state', () => {
    render(<ThreadView run={run('running')} thread={reduceThread(EVENTS)} />)
    expect(document.querySelector('[data-slot="thread-footer"]')).toBeNull()
    expect(document.querySelector('[data-slot="thread-empty"]')).toBeNull()
  })

  it('an eventless run says so instead of rendering blank space', () => {
    render(<ThreadView run={run('running')} thread={reduceThread([])} />)
    expect(document.querySelector('[data-slot="thread-empty"]')?.textContent).toBe('No session events yet.')
  })
})

/** Route-level: loading and 404 — driven through the real fetch boundary. jsdom has no
 *  EventSource, which `useRunEvents` treats as "no stream" — honest for these states. */
function renderRoute(id: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/tasks/${id}`]}>
        <Routes>
          <Route path="/tasks/:id" element={<TaskThreadRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TaskThreadRoute', () => {
  it('is honestly loading while /api/runs/:id has not answered', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
    renderRoute('r1')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loading task…')
    expect(document.querySelector('[data-route="task-thread"]')).not.toBeNull()
  })

  it('unknown run id → the 404-style CenteredState with a way home', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } })),
      ),
    )
    renderRoute('nope')
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Task not found')
    })
    expect(screen.getByRole('link', { name: 'Back to tasks' }).getAttribute('href')).toBe('/')
    expect(document.querySelector('[data-slot="centered-state"]')?.getAttribute('data-tone')).toBe('neutral')
  })
})
