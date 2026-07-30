import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunHistoryContext, RunHistoryPage } from '@open-mercato/cezar-api-client'
import { getRunHistory, getRunHistoryContext } from './client'
import { useRunHistory } from './run-history'

vi.mock('./client', () => ({
  getRunHistory: vi.fn(),
  getRunHistoryContext: vi.fn(),
}))

const mockHistory = vi.mocked(getRunHistory)
const mockContext = vi.mocked(getRunHistoryContext)

const page = (
  seq: number,
  extras: Partial<RunHistoryPage> = {},
): RunHistoryPage => ({
  events: [{ seq, ts: '2026-07-30T00:00:00.000Z', type: 'note', message: `event-${seq}` }],
  itemCount: 1,
  liveCursor: `live-${seq}`,
  asOfSeq: seq,
  hasOlder: false,
  ...extras,
})

const context = (seq = 90): RunHistoryContext => ({
  contextEvents: [{
    seq,
    ts: '2026-07-30T00:00:00.000Z',
    type: 'plan.updated',
    entries: [{ content: 'current plan', status: 'in_progress' }],
  }],
  asOfSeq: 100,
})

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom deliberately has no native EventSource; the stream hook degrades to no live frames.
  Reflect.deleteProperty(globalThis, 'EventSource')
})

describe('useRunHistory', () => {
  it('hydrates the visible tail and current context independently, then prepends one older page', async () => {
    mockHistory.mockImplementation(async (_id, cursor) =>
      cursor === 'older-100'
        ? page(1)
        : page(100, { olderCursor: 'older-100', hasOlder: true }),
    )
    mockContext.mockResolvedValue(context())
    const { wrapper } = harness()
    const { result } = renderHook(() => useRunHistory('run-1'), { wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.visibleEvents.map(({ seq }) => seq)).toEqual([100])
    expect(result.current.currentEvents.map(({ seq }) => seq)).toEqual([90])
    expect(result.current.hasOlder).toBe(true)

    await act(() => result.current.loadOlder())
    await waitFor(() => expect(result.current.visibleEvents.map(({ seq }) => seq)).toEqual([1, 100]))
    expect(mockHistory).toHaveBeenLastCalledWith('run-1', 'older-100', expect.any(Object))
    expect(result.current.retainedPages).toBe(2)
  })

  it('falls back to the protected full replay when either optimized request cannot load', async () => {
    mockHistory.mockRejectedValue(new Error('old server'))
    mockContext.mockResolvedValue(context())
    const { wrapper } = harness()
    const { result } = renderHook(() => useRunHistory('run-1'), { wrapper })

    await waitFor(() => expect(result.current.fallback).toBe(true), { timeout: 3_000 })
    expect(result.current.isPending).toBe(false)
    expect(result.current.hasOlder).toBe(false)
  })

  it('jump-to-latest clears retained older pages and refetches the cursorless tail', async () => {
    mockHistory.mockImplementation(async (_id, cursor) =>
      cursor === 'older-100'
        ? page(1)
        : page(100, { olderCursor: 'older-100', hasOlder: true }),
    )
    mockContext.mockResolvedValue(context())
    const { wrapper } = harness()
    const { result } = renderHook(() => useRunHistory('run-1'), { wrapper })
    await waitFor(() => expect(result.current.hasOlder).toBe(true))
    await act(() => result.current.loadOlder())
    await waitFor(() => expect(result.current.retainedPages).toBe(2))

    await act(() => result.current.jumpToLatest())
    await waitFor(() => expect(result.current.retainedPages).toBe(1))
    expect(mockHistory).toHaveBeenLastCalledWith('run-1', undefined, expect.any(Object))
  })
})
