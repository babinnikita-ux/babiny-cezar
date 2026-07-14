import type {
  ApiRun,
  ArchiveFinishedResponse,
  CancelResponse,
  ContinueResponse,
  CreateRunInput,
  CreateRunResponse,
  DeleteRunResponse,
  FinishResponse,
  GithubData,
  HealthResponse,
  MessageInput,
  MessageResponse,
  PatchRunInput,
  RepoResponse,
  RunRecord,
  Skill,
  TodoItem,
  UiState,
  WorkflowsResponse,
} from './types'

/**
 * The typed client for the cockpit's own HTTP API.
 *
 * Same-origin by construction: the Hono server serves this bundle and owns `/api/*`, and the
 * Vite dev server proxies `/api` to it. So every path here is root-relative — there is no base
 * URL to configure and no cross-origin case to get wrong.
 *
 * This module is the boundary. It parses responses, turns every non-2xx into an `ApiError`
 * carrying the server's own words, and does nothing else: no caching, no retries, no
 * reconnect. Freshness is SSE's job and TanStack Query's (queries.ts, and Step 3.2's reconcile).
 */

/**
 * A failed API call.
 *
 * `message` is the server's `{ error }` verbatim wherever it sent one, because it writes those
 * for the person reading them — "run is active — cancel it first", "no terminal emulator
 * found". Rewording them here would be inventing a worse error. The extras are the fields the
 * server pairs with specific 409s so the UI can offer the manual way out.
 */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server (offline, server stopped). */
  readonly status: number
  /** `POST /api/runs/:id/pr`: the `git merge <branch>` to run by hand when the PR failed. */
  readonly manual?: string
  /** `POST /api/runs/:id/open-in-cli`: the resume command, when no terminal could be opened. */
  readonly command?: string
  /** `POST /api/workflows`: the file is already there — the caller may retry with `overwrite`. */
  readonly exists?: boolean

  constructor(
    status: number,
    message: string,
    extras: { manual?: string; command?: string; exists?: boolean; cause?: unknown } = {},
  ) {
    super(message, extras.cause !== undefined ? { cause: extras.cause } : undefined)
    this.name = 'ApiError'
    this.status = status
    this.manual = extras.manual
    this.command = extras.command
    this.exists = extras.exists
  }
}

export type ReadOptions = {
  /** Wired to TanStack Query's per-query signal, so an unmounted view stops its fetch. */
  signal?: AbortSignal
}

type Json = Record<string, unknown>

/** JSON.parse that answers "not JSON" instead of throwing — an error body is untrusted input:
 *  a proxy's HTML 502 page is as likely as the server's own `{ error }`. */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Build the ApiError for a non-2xx, preferring the server's own message. */
function errorFor(status: number, statusText: string, body: string): ApiError {
  const parsed = parseJson(body)
  const json: Json = parsed && typeof parsed === 'object' ? (parsed as Json) : {}
  const message =
    str(json.error) ??
    // No `{ error }` — a proxy error page, an empty body, a crash. Say what we know rather
    // than leak a page of HTML into a toast.
    `${status} ${statusText || 'request failed'}`.trim()
  return new ApiError(status, message, {
    manual: str(json.manual),
    command: str(json.command),
    exists: typeof json.exists === 'boolean' ? json.exists : undefined,
  })
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch (cause) {
    // The request never got an answer. Not an HTTP failure — hence status 0 — but callers get
    // one error type either way instead of two.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, `cannot reach the cezar server (${path})`, { cause })
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init)
  const body = await res.text()
  if (!res.ok) throw errorFor(res.status, res.statusText, body)
  const parsed = parseJson(body)
  if (parsed === undefined) {
    throw new ApiError(res.status, `the cezar server answered ${path} with a non-JSON body`)
  }
  return parsed as T
}

/** For the endpoints that answer `text/plain` (diffs, the handoff journal). */
async function requestText(path: string, init: RequestInit = {}): Promise<string> {
  const res = await send(path, init)
  const body = await res.text()
  if (!res.ok) throw errorFor(res.status, res.statusText, body)
  return body
}

function get<T>(path: string, opts: ReadOptions = {}): Promise<T> {
  return request<T>(path, { method: 'GET', signal: opts.signal })
}

function mutate<T>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

const runPath = (id: string, suffix = ''): string => `/api/runs/${encodeURIComponent(id)}${suffix}`

// ---- reads --------------------------------------------------------------------------------

/** Version, update check, repo/branch, and the tool probes behind the Tools menu. */
export function getHealth(opts?: ReadOptions): Promise<HealthResponse> {
  return get<HealthResponse>('/api/health', opts)
}

/** The authoritative run list — sorted newest-first by the server. */
export function getRuns(opts?: ReadOptions): Promise<ApiRun[]> {
  return get<ApiRun[]>('/api/runs', opts)
}

export function getRun(id: string, opts?: ReadOptions): Promise<ApiRun> {
  return get<ApiRun>(runPath(id), opts)
}

export function getUiState(opts?: ReadOptions): Promise<UiState> {
  return get<UiState>('/api/ui-state', opts)
}

export function getWorkflows(opts?: ReadOptions): Promise<WorkflowsResponse> {
  return get<WorkflowsResponse>('/api/workflows', opts)
}

export function getSkills(opts?: ReadOptions): Promise<Skill[]> {
  return get<Skill[]>('/api/skills', opts)
}

export function getTodos(opts?: ReadOptions): Promise<TodoItem[]> {
  return get<TodoItem[]>('/api/todos', opts)
}

export function getRepo(opts?: ReadOptions): Promise<RepoResponse> {
  return get<RepoResponse>('/api/repo', opts)
}

/** Issues + PRs via the logged-in `gh`. Degrades to `{ available: false, reason }` server-side —
 *  an unreachable forge is a hint in the tab, not an ApiError. */
export function getGithub(
  params: { limit?: number; refresh?: boolean } = {},
  opts?: ReadOptions,
): Promise<GithubData> {
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.refresh) query.set('refresh', '1')
  const search = query.toString()
  return get<GithubData>(`/api/github${search ? `?${search}` : ''}`, opts)
}

/** The run's worktree diff against its base, as unified-diff text. Also the plain-text
 *  "(no worktree — …)" sentence for runs that executed in the repo working tree. */
export function getRunDiff(id: string, opts?: ReadOptions): Promise<string> {
  return requestText(runPath(id, '/diff'), { method: 'GET', signal: opts?.signal })
}

// ---- run mutations ------------------------------------------------------------------------

/** ×1 answers the run record; ×2/×3 answers `{ runs }` — narrow on `'runs' in result`. */
export function createRun(input: CreateRunInput): Promise<CreateRunResponse> {
  return mutate<CreateRunResponse>('POST', '/api/runs', input)
}

export function cancelRun(id: string): Promise<CancelResponse> {
  return mutate<CancelResponse>('POST', runPath(id, '/cancel'))
}

/** Archives by default; pass `false` to bring a run back into the live list. */
export function archiveRun(id: string, archived = true): Promise<RunRecord> {
  return mutate<RunRecord>('POST', runPath(id, '/archive'), { archived })
}

/** Sweep every finished (done/failed/cancelled) active run into the archive in one call —
 *  the Tasks header's "Archive finished" button. */
export function archiveFinished(): Promise<ArchiveFinishedResponse> {
  return mutate<ArchiveFinishedResponse>('POST', '/api/runs/archive-finished')
}

/** Close a waiting session gracefully — the run completes as done. 409 when nothing is open. */
export function finishRun(id: string): Promise<FinishResponse> {
  return mutate<FinishResponse>('POST', runPath(id, '/finish'))
}

/** Reopen a finished run's session. 409 (with the reason) when it cannot be resumed. */
export function continueRun(id: string, text?: string): Promise<ContinueResponse> {
  return mutate<ContinueResponse>('POST', runPath(id, '/continue'), text === undefined ? {} : { text })
}

/** Rename a run (#389): the edit becomes the display title and wins over any auto-summary. */
export function patchRun(id: string, patch: PatchRunInput): Promise<RunRecord> {
  return mutate<RunRecord>('PATCH', runPath(id), patch)
}

/** Deletes the run, its transcript, its worktree and its branch. 409 while it is still active. */
export function deleteRun(id: string): Promise<DeleteRunResponse> {
  return mutate<DeleteRunResponse>('DELETE', runPath(id))
}

/** Deliver text and/or pasted screenshots into a run's live session. 409 once it has closed. */
export function sendMessage(id: string, message: MessageInput): Promise<MessageResponse> {
  return mutate<MessageResponse>('POST', runPath(id, '/messages'), {
    text: message.text ?? '',
    images: message.images ?? [],
  })
}

// ---- prefs ---------------------------------------------------------------------------------

/** Merges server-side (the stored object spread under the patch) and answers the merged state. */
export function putUiState(patch: UiState): Promise<UiState> {
  return mutate<UiState>('PUT', '/api/ui-state', patch)
}
