/**
 * The shape of the cockpit's HTTP surface (`src/server/server.ts`), hand-mirrored for the
 * browser bundle.
 *
 * Why a mirror and not an import: the server is Node ESM under NodeNext (`.js` relative
 * specifiers, `node:*` imports, zod at runtime). Importing its modules here would either drag
 * Node built-ins into the bundle or force two module-resolution modes into one file. The types
 * are the contract; the code behind them is not.
 *
 * The mirror is *checked*, not trusted: `src/server/api-types.test.ts` asserts type-exactness
 * between these declarations and the server's own (it is a server test on purpose — that is the
 * suite `npm run typecheck` and `npm test` both cover, so drift fails the gate rather than
 * hiding until runtime). Anything below without a guard there carries a real drift risk; keep
 * the guard list in step with this file.
 *
 * This module MUST stay import-free so the guard can reach it from the NodeNext side.
 */

// ---- runs (src/runs/store.ts) ------------------------------------------------------------

export type RunStatus = 'queued' | 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'cancelled'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'review'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'skipped'

/** The agent backends a run can use. `runner` is optional on old records — they predate the
 *  choice and are Claude by definition (see `resumeCommand` in the server). */
export type Runner = 'claude' | 'codex' | 'opencode'

export interface StepState {
  id: string
  name: string
  kind: 'agent' | 'check'
  status: StepStatus
  iterations: number
  tokensUsed: number
  startedAt?: string
  finishedAt?: string
  error?: string
  /** Latest agent session id — `claude --resume <id>` and friends. */
  sessionId?: string
  costUsd?: number
}

/** Aggregate diff numbers of a run's worktree vs its base (#389). */
export interface DiffStat {
  adds: number
  dels: number
  files: number
}

export interface RunRecord {
  id: string
  title: string
  /** Display title (#389): auto-derived from the first agent turn, or the user's inline edit
   *  (`PATCH /api/runs/:id` sets it together with `title`). Show `titleSummary ?? title`. */
  titleSummary?: string
  /** Refreshed on every turn-end; absent until the first turn ends (and on worktree-less runs). */
  diffStat?: DiffStat
  workflow: string
  task: string
  model?: string
  runner?: Runner
  /** Echo of the extra system prompt the run used (POST override or config default). */
  systemPrompt?: string
  status: RunStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  tokensUsed: number
  costUsd?: number
  pullRequestUrl?: string
  /** Absent when the run executed in the repo working tree rather than its own worktree. */
  worktreePath?: string
  branch?: string
  baseBranch?: string
  /** Parallel variants (spec 010): runs sharing a groupId are one group. */
  groupId?: string
  /** Variant letter within the group — 'A' | 'B' | 'C'. */
  variant?: string
  peakRssBytes?: number
  peakProcCount?: number
  archived: boolean
  archivedAt?: string
  currentStepId?: string
  error?: string
  steps: StepState[]
  /** Persisted workflow definition; kept loose server-side, so loose here too. */
  workflowDef?: Record<string, unknown>
}

/** One aggregated sample of a run's live process tree (src/core/process-usage.ts). */
export interface ProcessUsage {
  cpuPct: number
  rssBytes: number
  procCount: number
}

/**
 * What `GET /api/runs` and `GET /api/runs/:id` actually answer: the stored record plus the
 * live `usage` sample the server attaches on the way out (`withUsage`). Absent for finished
 * runs and wherever `ps` yields nothing — never persisted.
 */
export type ApiRun = RunRecord & { usage?: ProcessUsage }

/**
 * One line of a run's NDJSON transcript. `type` mirrors the agent events plus engine
 * lifecycle, and the payload keys vary by type — hence the index signature. `seq` is the
 * dedup key the reducers key on (Step 3.2).
 */
export interface RunEvent {
  seq: number
  ts: string
  stepId?: string
  type: string
  [key: string]: unknown
}

// ---- health / environment (src/core/backend-detect.ts, src/server/git.ts) -----------------

export interface BackendCheck {
  name: 'claude' | 'codex' | 'opencode' | 'gh' | 'git'
  available: boolean
  version?: string
  /** Human setup hint — shown verbatim; the server writes these for people, not for parsing. */
  hint?: string
}

export interface RepoInfo {
  root: string
  branch: string
  remote?: string
}

export interface HealthResponse {
  version: string
  /** Only once the npm-registry check answers with something newer (#368). */
  latestVersion?: string
  repoRoot: string
  /** Null when cezar was started outside a git repository. */
  repo: RepoInfo | null
  checks: BackendCheck[]
  defaultRunner: Runner
}

// ---- repo view (src/server/git.ts) ---------------------------------------------------------

export interface StatusEntry {
  status: string
  path: string
}

export interface LogEntry {
  hash: string
  subject: string
  author: string
  when: string
}

export interface RepoResponse {
  info: RepoInfo | null
  status: StatusEntry[]
  log: LogEntry[]
  branches: string[]
  baseBranch: string | null
}

// ---- workflows (src/workflows/types.ts, src/workflows/load.ts) ------------------------------

export interface WorkflowStepDef {
  id: string
  name?: string
  prompt?: string
  skill?: string
  model?: string
  runner?: Runner
  allowedTools?: string[]
  bashAllowlist?: string[]
  command?: string
  onFail?: { retry: string; max: number }
}

export interface WorkflowDef {
  name: string
  description?: string
  steps: WorkflowStepDef[]
  source: 'built-in' | 'file'
  path?: string
}

export interface WorkflowLoadIssue {
  path: string
  message: string
}

export interface WorkflowsResponse {
  workflows: WorkflowDef[]
  /** Files that failed to load. The catalog still returns — bad files are reported, not fatal. */
  issues: WorkflowLoadIssue[]
}

// ---- skills (src/skills.ts) -----------------------------------------------------------------

export interface Skill {
  name: string
  description?: string
  body: string
  path: string
  source: 'ai' | 'cezar' | 'agents' | 'global' | 'team'
  /** Team skills only: where the definition lives in its skills repo. */
  team?: {
    repo: string
    ref: string
    path: string
    dir: boolean
  }
}

// ---- inbox (src/todos.ts) --------------------------------------------------------------------

export interface TodoItem {
  id: string
  ts?: string
  taskId?: string
  summary: string
  action?: string
  prUrl?: string
  suggestedSkill?: string
  suggestedArgs?: string
  suggestedPrompt?: string
  /** Set by the server when "▶ Run" turned this entry into a task. */
  startedTaskId?: string
}

// ---- GitHub tab (src/server/github.ts) --------------------------------------------------------

export interface GithubItem {
  kind: 'issue' | 'pr'
  number: number
  title: string
  author: string
  createdAt: string
  labels: string[]
  body: string
  url: string
  comments: number
  /** PRs only. */
  isDraft?: boolean
  additions?: number
  deletions?: number
  checks?: 'passing' | 'failing' | 'pending' | null
}

export interface GithubData {
  available: boolean
  /** Why it is unavailable (`gh` missing, no remote, offline…). Never an error — a hint. */
  reason?: string
  /** owner/name, when known. */
  repo?: string
  syncedAt?: string
  issues: GithubItem[]
  prs: GithubItem[]
}

// ---- GUI prefs (`PUT /api/ui-state`) -----------------------------------------------------------

/** The keys the server's schema names. It is a passthrough schema, so unknown keys round-trip
 *  untouched — future prefs need no server change, which is why this stays open. */
export interface UiState {
  lastTask?: { source: 'workflow' | 'skill'; ref: string }
  runsView?: 'list' | 'table'
  [key: string]: unknown
}

// ---- request bodies ------------------------------------------------------------------------------

/** An inline image, base64 — the same shape `POST /api/runs` and the message endpoint take
 *  (≤4 images, ~5 MB each once decoded). */
export interface ImageInput {
  mediaType: string
  data: string
}

/** `POST /api/runs`. Exactly one of `workflow` / `steps` — the server rejects both or neither. */
export interface CreateRunInput {
  task: string
  workflow?: string
  steps?: WorkflowStepDef[]
  model?: string
  runner?: Runner
  /** 1–3. Above 1 the response is `{ runs }` rather than a single record. */
  variants?: number
  images?: ImageInput[]
}

export interface MessageInput {
  text?: string
  images?: ImageInput[]
}

/** `PATCH /api/runs/:id` (#389). `title`: trimmed server-side, 1–300 chars. The edit sets both
 *  `title` and `titleSummary`, so it wins over any auto-summary. Answers the updated record. */
export interface PatchRunInput {
  title?: string
}

// ---- mutation responses ---------------------------------------------------------------------------

/** `POST /api/runs` — one record for ×1, a group for ×2/×3. */
export type CreateRunResponse = ApiRun | { runs: RunRecord[] }

export interface CancelResponse {
  cancelled: boolean
}

/** `POST /api/runs/archive-finished` — how many runs the sweep archived. */
export interface ArchiveFinishedResponse {
  archived: number
}

export interface DeleteRunResponse {
  deleted: boolean
}

export interface FinishResponse {
  finished: boolean
}

export interface ContinueResponse {
  continued: boolean
}

export interface MessageResponse {
  delivered: boolean
}
