import { useQuery } from '@tanstack/react-query'

import {
  getGithub,
  getHealth,
  getRepo,
  getRun,
  getRunDiff,
  getRuns,
  getSkills,
  getTodos,
  getUiState,
  getWorkflows,
} from './client'

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

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: ({ signal }) => getSkills({ signal }),
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

export function useGithub(params: { limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.github(params),
    queryFn: ({ signal }) => getGithub({ limit: params.limit }, { signal }),
  })
}
