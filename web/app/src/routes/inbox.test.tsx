import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/api/query-client'
import type { RunRecord, TodoItem } from '@/api/types'
import { Toaster, resetToasts } from '@/components/ui/toaster'

import { InboxRoute, isTodoRunnable, todoRunHref, todoTaskText, visibleTodos } from './inbox'

afterEach(() => {
  act(() => resetToasts())
  cleanup()
  vi.unstubAllGlobals()
})

// ---- fixtures --------------------------------------------------------------------------------

/** The full meta row: age, action, live source task, PR link, suggested skill. */
const TODO_FULL: TodoItem = {
  id: 't1',
  ts: '2026-07-15T08:00:00.000Z',
  taskId: 'run-1',
  summary: 'Open a follow-up PR for the flaky retry test',
  action: 'follow-up',
  prUrl: 'https://github.com/acme/demo/pull/7',
  suggestedSkill: 'om-fix',
}

/** Its source task is NOT in `/api/runs` — the legacy "source task deleted" case. */
const TODO_ORPHAN: TodoItem = {
  id: 't2',
  taskId: 'run-gone',
  summary: 'Rerun the failed checks',
}

/** Already turned into a task: stays in todos.json as the audit trail, never rendered. */
const TODO_STARTED: TodoItem = {
  id: 't3',
  summary: 'Ship the release notes',
  startedTaskId: 'run-5',
}

const TODOS: TodoItem[] = [TODO_FULL, TODO_ORPHAN, TODO_STARTED]

const RUN_1: RunRecord = {
  id: 'run-1',
  title: 'Fix the retry test',
  workflow: 'quick-task',
  task: 'fix it',
  status: 'done',
  createdAt: '2026-07-15T07:00:00.000Z',
  tokensUsed: 10,
  archived: false,
  steps: [],
}

interface SentRequest {
  path: string
  method: string
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Fetch stub in the house style (github.test.tsx): records requests, serves the fixtures,
 *  and lets a test override specific `METHOD path` keys. Stateful like the real server: a
 *  DELETE really removes the entry, so the invalidation refetch answers without it. */
function stubFetch(
  overrides: Record<string, () => Response> = {},
  todos: TodoItem[] = TODOS,
): SentRequest[] {
  const sent: SentRequest[] = []
  let inbox = [...todos]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input)
      const method = init.method ?? 'GET'
      sent.push({ path, method })
      const override = overrides[`${method} ${path}`]
      if (override) return override()
      if (method === 'GET' && path === '/api/todos') return jsonResponse(inbox)
      if (method === 'GET' && path === '/api/runs') return jsonResponse([RUN_1])
      if (method === 'DELETE' && path === '/api/todos/t1') {
        inbox = inbox.filter((item) => item.id !== 't1')
        return jsonResponse({ removed: true })
      }
      if (method === 'DELETE' && path === '/api/todos/t2') {
        inbox = inbox.filter((item) => item.id !== 't2')
        return jsonResponse({ removed: true })
      }
      return jsonResponse({ error: 'not found' }, 404)
    }),
  )
  return sent
}

/** Stands in for the real `/new` route: renders the query string Run navigated with, so tests
 *  can assert on the prefill contract without pulling in the whole composer. */
function NewTaskProbe() {
  const [params] = useSearchParams()
  return <div data-slot="new-task-probe">{params.toString()}</div>
}

function renderInbox() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/inbox']}>
        <Routes>
          <Route path="/inbox" element={<InboxRoute />} />
          {/* Where the "source task" meta link points — and where the legacy Run used to land
              straight after POSTing /start. Rendered so a stray navigation to a thread is a
              visible failure rather than a router warning. */}
          <Route path="/tasks/:id" element={<div data-slot="thread-probe" />} />
          {/* #374: Run navigates here now, prefilled — not straight to a started run. */}
          <Route path="/new" element={<NewTaskProbe />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-slot="todo-card"]')]

// ---- the visibility rule ----------------------------------------------------------------------

describe('visibleTodos', () => {
  it('hides entries already turned into a task (the legacy audit-trail rule)', () => {
    expect(visibleTodos(TODOS).map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

describe('isTodoRunnable', () => {
  it('infers legacy entries from their executable suggestion', () => {
    expect(isTodoRunnable(TODO_FULL)).toBe(true)
    expect(isTodoRunnable(TODO_ORPHAN)).toBe(false)
  })

  it('lets explicit intent override inference in either direction', () => {
    expect(isTodoRunnable({ ...TODO_FULL, runnable: false })).toBe(false)
    expect(isTodoRunnable({ ...TODO_ORPHAN, runnable: true })).toBe(true)
  })
})

// ---- cards ------------------------------------------------------------------------------------

describe('the inbox card list', () => {
  it('renders one card per visible entry, started entries excluded', async () => {
    stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(cards().map((card) => card.dataset.id)).toEqual(['t1', 't2'])
    expect(screen.queryByText('Ship the release notes')).toBeNull()
  })

  it('a full card carries summary, meta, PR link, skill and a live source-task link', async () => {
    stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    const card = cards()[0]!
    expect(card.querySelector('[data-slot="todo-summary"]')?.textContent).toBe(TODO_FULL.summary)
    expect(card.querySelector('[data-slot="todo-meta"]')?.textContent).toContain('follow-up')
    expect(card.querySelector('[data-slot="todo-skill"]')?.textContent).toBe('skill: om-fix')
    const pr = card.querySelector<HTMLAnchorElement>('[data-slot="todo-pr"]')
    expect(pr?.getAttribute('href')).toBe(TODO_FULL.prUrl)
    expect(pr?.getAttribute('rel')).toContain('noopener')
    // run-1 exists in /api/runs → a real link into the thread.
    expect(card.querySelector('[data-slot="todo-source"]')?.getAttribute('href')).toBe('/tasks/run-1')
  })

  it('says "source task deleted" when the source run is gone (legacy honesty rule)', async () => {
    stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    const card = cards()[1]!
    expect(card.querySelector('[data-slot="todo-source"]')).toBeNull()
    expect(card.querySelector('[data-slot="todo-source-gone"]')?.textContent).toBe(
      'source task deleted',
    )
  })

  it('every card wears the attention grammar\'s "needs you" dot — amber, pulsing', async () => {
    stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    for (const card of cards()) {
      const dot = card.querySelector<HTMLElement>('[data-slot="status-dot"]')
      expect(dot?.dataset.tone).toBe('pending')
      expect(dot?.className).toContain('animate-pulse')
      expect(dot?.getAttribute('title')).toBe('needs you')
    }
  })
})

// ---- Run --------------------------------------------------------------------------------------

describe('Run (#374: prefill, never blind-launch)', () => {
  function probeParams(): URLSearchParams {
    const text = document.querySelector('[data-slot="new-task-probe"]')?.textContent ?? ''
    return new URLSearchParams(text)
  }

  it('navigates to a prefilled /new — the suggested skill + summary — instead of starting a run', async () => {
    const sent = stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0]!.querySelector('[data-action="todo-run"]')!)

    await waitFor(() => expect(document.querySelector('[data-slot="new-task-probe"]')).not.toBeNull())
    expect(probeParams().get('skill')).toBe('om-fix')
    expect(probeParams().get('ref')).toBe(TODO_FULL.summary)
    // The audit trail rides along: the composer hands `todo` back as `todoId` on POST /api/runs
    // so the entry is marked started and leaves the inbox — the bookkeeping the old
    // POST /api/todos/:id/start did for us.
    expect(probeParams().get('todo')).toBe('t1')
    // The whole point: clicking Run must not itself fire a task (#355's "blindly firing").
    expect(sent.some((r) => r.method === 'POST')).toBe(false)
  })

  it('carries the entry id but never the auto-start arming — a prefill link cannot launch', async () => {
    stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0]!.querySelector('[data-action="todo-run"]')!)

    await waitFor(() => expect(document.querySelector('[data-slot="new-task-probe"]')).not.toBeNull())
    expect(probeParams().get('todo')).toBe('t1')
    // `todo` is bookkeeping, not authority: it must not drag `auto`/`key` along (#374/#355).
    expect(probeParams().has('auto')).toBe(false)
    expect(probeParams().has('key')).toBe(false)
    expect(document.querySelector('[data-slot="thread-probe"]')).toBeNull()
  })

  it('omits the skill param when the entry has no suggested skill', async () => {
    // #440 infers a summary-only entry to be a note (Acknowledge, no Run), so the
    // skill-less *Run* path needs an entry that is explicitly runnable — `isTodoRunnable`
    // lets that intent win. `ref` then falls back to the summary (`todoTaskText`).
    const runnableWithoutSkill: TodoItem = { ...TODO_ORPHAN, runnable: true }
    stubFetch({}, [runnableWithoutSkill])
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(1))
    fireEvent.click(cards()[0]!.querySelector('[data-action="todo-run"]')!)

    await waitFor(() => expect(document.querySelector('[data-slot="new-task-probe"]')).not.toBeNull())
    expect(probeParams().has('skill')).toBe(false)
    expect(probeParams().get('ref')).toBe(TODO_ORPHAN.summary)
    // No skill to suggest is no reason to lose the entry.
    expect(probeParams().get('todo')).toBe(runnableWithoutSkill.id)
  })
})

/**
 * The cockpit half of the cross-process drift guard (#374). This copy exists because the
 * prefilled composer must read exactly like the task `POST /api/todos/:id/start` would have
 * started — but that builder is `todoTaskText` in src/todos.ts, in the server process, and no
 * import can cross into the bundle. So both sides assert the SAME fixture (its counterpart is
 * test/unit/todo-task-text.test.ts): whichever builder moves first, a suite goes red.
 */
describe('todoTaskText (pinned to the server builder via the shared fixture)', () => {
  interface Fixture {
    cases: Array<{
      name: string
      todo: Pick<TodoItem, 'summary' | 'suggestedPrompt' | 'suggestedArgs'>
      expected: string
    }>
  }
  // Resolved from this file, not from cwd (the design-guardian.test.ts pattern) — jsdom's URL
  // is not Node's, so `fileURLToPath(new URL(…))` would throw here.
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const fixture = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'test/fixtures/todo-task-text.json'), 'utf8'),
  ) as Fixture

  it('the fixture is the whole contract, not a token case', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(5)
  })

  for (const { name, todo, expected } of fixture.cases) {
    it(name, () => {
      expect(todoTaskText(todo)).toBe(expected)
    })
  }
})

describe('todoRunHref (the prefill contract, #374)', () => {
  it('builds the /new href with skill, ref and the entry id, URL-encoded', () => {
    const href = todoRunHref({
      id: 't9',
      summary: 'Ship it',
      suggestedSkill: 'om-release',
      suggestedArgs: '--dry-run',
    })
    expect(href).toBe('/new?skill=om-release&ref=Ship+it%0A%0AArguments%3A+--dry-run&todo=t9')
  })

  it('keeps the entry id even when there is nothing else to prefill', () => {
    const todo: TodoItem = { id: 't9', summary: '' }
    expect(todoRunHref(todo)).toBe('/new?todo=t9')
  })
})

// ---- Acknowledge ------------------------------------------------------------------------------

describe('Acknowledge', () => {
  it('replaces Run for a note and DELETEs it without starting a task', async () => {
    const sent = stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    const note = cards()[1]!
    expect(note.querySelector('[data-action="todo-run"]')).toBeNull()
    expect(note.querySelector('[data-action="todo-dismiss"]')).toBeNull()
    expect(note.querySelector('[data-action="todo-acknowledge"]')?.textContent).toContain(
      'Acknowledge',
    )

    fireEvent.click(note.querySelector('[data-action="todo-acknowledge"]')!)

    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(sent).toContainEqual({ path: '/api/todos/t2', method: 'DELETE' })
    expect(sent).not.toContainEqual({ path: '/api/todos/t2/start', method: 'POST' })
  })
})

// ---- Dismiss ----------------------------------------------------------------------------------

describe('Dismiss', () => {
  it('DELETEs the entry and drops the card without waiting for SSE', async () => {
    const sent = stubFetch()
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0]!.querySelector('[data-action="todo-dismiss"]')!)

    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]!.dataset.id).toBe('t2')
    expect(sent).toContainEqual({ path: '/api/todos/t1', method: 'DELETE' })
  })

  it('surfaces a dismiss failure as a toast and keeps the card', async () => {
    stubFetch({ 'DELETE /api/todos/t1': () => jsonResponse({ error: 'not found' }, 404) })
    renderInbox()

    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(cards()[0]!.querySelector('[data-action="todo-dismiss"]')!)

    expect(await screen.findByText('not found')).not.toBeNull()
    expect(cards()).toHaveLength(2)
  })
})

// ---- empty & error ----------------------------------------------------------------------------

describe('empty and error states', () => {
  it('an empty inbox renders the shared CenteredState template', async () => {
    stubFetch({}, [])
    renderInbox()

    const state = await waitFor(() => {
      const found = document.querySelector('[data-slot="centered-state"]')
      expect(found).not.toBeNull()
      return found!
    })
    expect(state.getAttribute('data-tone')).toBe('neutral')
    expect(state.textContent).toContain('Inbox empty')
    expect(state.textContent).toContain('follow-up suggestions')
  })

  it('an all-started inbox is an empty inbox — the audit trail is not a card list', async () => {
    stubFetch({}, [TODO_STARTED])
    renderInbox()

    await waitFor(() =>
      expect(document.querySelector('[data-slot="centered-state"]')).not.toBeNull(),
    )
    expect(cards()).toHaveLength(0)
  })

  it('a failed todos fetch renders the danger state with the server error', async () => {
    // 4xx: the client's retry policy treats it as a considered answer, so the state is
    // immediate — no exponential-backoff retry for the test to wait out.
    stubFetch({ 'GET /api/todos': () => jsonResponse({ error: 'disk exploded' }, 400) })
    renderInbox()

    const state = await waitFor(() => {
      const found = document.querySelector('[data-slot="centered-state"][data-tone="danger"]')
      expect(found).not.toBeNull()
      return found!
    })
    expect(state.textContent).toContain('disk exploded')
  })
})
