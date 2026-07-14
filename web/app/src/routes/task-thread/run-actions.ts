import type { RunRecord, RunStatus, Runner } from '@/api/types'

/**
 * The run header's action policy — WHICH actions a run offers, as a pure function of the
 * record, ported from the legacy header (web/app.js `updateDetail`) so both cockpits agree.
 * The header component only maps these booleans to buttons; every rule lives here where a
 * table test can pin it per status.
 */

/** "Active" in the legacy sense: the engine still owns the run (a queued run is parked but
 *  claimed). `review` is deliberately NOT active — a parked review can be continued, archived
 *  or deleted like any finished run. */
export function isRunActive(status: RunStatus): boolean {
  return status === 'running' || status === 'queued' || status === 'waiting'
}

/** The latest agent session across steps — what Continue/Terminal resume. */
export function lastSessionId(run: RunRecord): string | undefined {
  return [...run.steps].reverse().find((step) => step.sessionId)?.sessionId
}

/** The per-backend take-over command — mirrors the server's `resumeCommand` (server.ts), and
 *  like it treats records without a runner as Claude (they predate the choice). */
export function resumeCommand(runner: Runner | undefined, sessionId: string): string {
  switch (runner) {
    case 'codex':
      return `codex resume ${sessionId}`
    case 'opencode':
      return `opencode --session ${sessionId}`
    default:
      return `claude --resume ${sessionId}`
  }
}

/** The copyable "take over interactively" line under the header — only once the engine has
 *  let go of the session (same gate as the Terminal button). Prefixes the `cd` when the run
 *  has its own worktree, because the resume only makes sense from in there. */
export function resumeHint(run: RunRecord): string | undefined {
  if (isRunActive(run.status)) return undefined
  const sessionId = lastSessionId(run)
  if (sessionId === undefined) return undefined
  const command = resumeCommand(run.runner, sessionId)
  return run.worktreePath ? `cd ${run.worktreePath} && ${command}` : command
}

export interface RunActionFlags {
  /** waiting → close the session; review → accept the changes without a PR. Both POST /finish. */
  finish: boolean
  /** Reopen the last agent session in-process. */
  continueRun: boolean
  /** Hand the session to a real terminal (open-in-cli). */
  terminal: boolean
  /** The handoff-notes panel — always available; an unseeded file is an honest empty state. */
  notes: boolean
  /** Archive when live, unarchive when archived — the record itself says which. */
  archive: boolean
  /** Stop an active run. Mutually exclusive with delete, by construction below. */
  cancel: boolean
  /** Remove the run, its transcript, worktree and branch. Terminal runs only. */
  deleteRun: boolean
}

export function runActionFlags(run: RunRecord): RunActionFlags {
  const active = isRunActive(run.status)
  const hasSession = lastSessionId(run) !== undefined
  return {
    finish: run.status === 'waiting' || run.status === 'review',
    continueRun: !active && hasSession,
    terminal: !active && hasSession,
    notes: true,
    archive: !active,
    cancel: active,
    deleteRun: !active,
  }
}

/** The Finish button's tooltip — review-gate accept reads differently from closing a session. */
export function finishTitle(status: RunStatus): string {
  return status === 'review' ? 'Accept the changes without a PR' : 'Close the session'
}
