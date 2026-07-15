import type { Runner } from '@/api/types'
import type { TaskSource } from './new-task-form'

/**
 * The new-task draft store (spec: "Queued form state survives navigation (draft store)").
 *
 * A module singleton, not localStorage: the promise is that stepping away to check a thread
 * and coming back loses nothing WITHIN this visit — a draft is working memory, not a document,
 * and resurrecting week-old text on a fresh open would be creepier than helpful. Nulls mean
 * "the user has not chosen" — the form falls back to persisted/last-used/default values, so an
 * untouched draft never shadows a fresher `lastTask` from the server.
 */
export interface NewTaskDraft {
  text: string
  source: TaskSource | null
  runner: Runner | null
  model: string | null
  variants: number
  /** The `Start | Plan first` toggle (#383). Sticky like the pickers: plan-first is a way of
   *  working, not a per-task whim — it survives navigation with the rest of the draft. */
  planFirst: boolean
}

const EMPTY: NewTaskDraft = {
  text: '',
  source: null,
  runner: null,
  model: null,
  variants: 1,
  planFirst: false,
}

let draft: NewTaskDraft = { ...EMPTY }

export function readDraft(): NewTaskDraft {
  return { ...draft }
}

export function writeDraft(next: NewTaskDraft): void {
  draft = { ...next }
}

/** After a successful submit: the text is spent, the picker choices remain — the next task
 *  usually runs the same way (legacy keeps its pills too). */
export function clearDraftText(): void {
  draft = { ...draft, text: '' }
}

/** Test isolation. */
export function resetDraft(): void {
  draft = { ...EMPTY }
}
