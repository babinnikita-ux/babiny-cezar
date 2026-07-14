import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getGithub,
  getGroup,
  getHealth,
  getRepo,
  getRun,
  getRunDiff,
  getRunHandoff,
  getRuns,
  getSkills,
  getTodos,
  getUiState,
  getWorkflows,
  patchRun,
  sendMessage,
} from './client'
import type { MessageInput, PatchRunInput } from './types'

/**
 * Query keys, in one place and exported, because they are a contract rather than an
 * implementation detail: Step 3.2's stream handlers invalidate and reconcile *these* keys when
 * an event says the data behind them moved. A key spelled inline at a call site is a key
 * nothing can invalidate.
 *
 * Hierarchical on purpose — `queryKeys.runs.all` invalidates the list and every single-run
 * query under it in one call.
 */
export const queryKeys = {
  health: ['health'] as const,
  runs: {
    all: ['runs'] as const,
    list: () => ['runs', 'list'] as const,
    detail: (id: string) => ['runs', 'detail', id] as const,
    diff: (id: string) => ['runs', 'diff', id] as const,
    handoff: (id: string) => ['runs', 'handoff', id] as const,
  },
  groups: {
    detail: (groupId: string) => ['groups', groupId] as const,
  },
  todos: ['todos'] as const,
  workflows: ['workflows'] as const,
  skills: ['skills'] as const,
  repo: ['repo'] as const,
  uiState: ['ui-state'] as const,
  github: (params: { limit?: number } = {}) => ['github', params.limit ?? null] as const,
} as const

/** Version + update check + repo/branch + tool probes. Feeds the sidebar's repo and version
 *  chips and (Step 4.2) the Tools menu. */
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth({ signal }),
  })
}

/** The authoritative run list. */
export function useRuns() {
  return useQuery({
    queryKey: queryKeys.runs.list(),
    queryFn: ({ signal }) => getRuns({ signal }),
  })
}

/** One run, authoritative. `id` may be absent while a route param is still unresolved. */
export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.runs.detail(id ?? ''),
    queryFn: ({ signal }) => getRun(id as string, { signal }),
    enabled: Boolean(id),
  })
}

export function useRunDiff(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.runs.diff(id ?? ''),
    queryFn: ({ signal }) => getRunDiff(id as string, { signal }),
    enabled: Boolean(id),
  })
}

/** The variant-compare data for `/compare/:groupId` (spec 010). Freshness while variants are
 *  still running is the ROUTE's concern: the group endpoint is not on the SSE stream, so the
 *  compare view invalidates this key when the run list (which IS stream-patched) shows a member
 *  changing state — no polling, per the sync doctrine. */
export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.groups.detail(groupId ?? ''),
    queryFn: ({ signal }) => getGroup(groupId as string, { signal }),
    enabled: Boolean(groupId),
  })
}

/** The handoff journal behind the header's Notes panel. `enabled` gates the fetch on the panel
 *  actually being open — notes are read on demand, not on every thread visit. */
export function useRunHandoff(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.runs.handoff(id ?? ''),
    queryFn: ({ signal }) => getRunHandoff(id as string, { signal }),
    enabled: Boolean(id) && enabled,
  })
}

/** The follow-up inbox. Drives the nav badge. */
export function useTodos() {
  return useQuery({
    queryKey: queryKeys.todos,
    queryFn: ({ signal }) => getTodos({ signal }),
  })
}

export function useWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflows,
    queryFn: ({ signal }) => getWorkflows({ signal }),
  })
}

/** `enabled` gates the fetch for surfaces that need skills only once interacted with — the
 *  composer's `/` autocomplete fetches on first trigger, never on every thread visit. (The
 *  palette gets the same laziness structurally: its content mounts only while open.) */
export function useSkills(enabled = true) {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: ({ signal }) => getSkills({ signal }),
    enabled,
  })
}

export function useRepo() {
  return useQuery({
    queryKey: queryKeys.repo,
    queryFn: ({ signal }) => getRepo({ signal }),
  })
}

export function useUiState() {
  return useQuery({
    queryKey: queryKeys.uiState,
    queryFn: ({ signal }) => getUiState({ signal }),
  })
}

/** Rename a run (#389): `PATCH /api/runs/:id`. Invalidates `runs.*` so the list and the detail
 *  view refetch the authoritative record. The run header's inline title edit sits on this. */
export function usePatchRun(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: PatchRunInput) => patchRun(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs.all }),
  })
}

/** Deliver a reply into a live session (`POST /api/runs/:id/messages`). The transcript itself
 *  grows over SSE (`user-message`, then the agent's turn); the invalidation refreshes the
 *  record (status flips waiting → running). Errors are the CALLER's to surface — the composer
 *  restores the draft and toasts, so no toast fires here. */
export function useSendMessage(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: MessageInput) => sendMessage(id, message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs.all }),
  })
}

export function useGithub(params: { limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.github(params),
    queryFn: ({ signal }) => getGithub({ limit: params.limit }, { signal }),
  })
}
