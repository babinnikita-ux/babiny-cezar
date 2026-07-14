import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  CornerUpLeftIcon,
  ExternalLinkIcon,
  EyeIcon,
  GitPullRequestIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, continueRun, createRunPr } from '@/api/client'
import { queryKeys, useRunDiff } from '@/api/queries'
import type { ApiRun, RunStatus } from '@/api/types'
import { TwinkleBackdrop } from '@/components/centered-state'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toaster'
import { highlight, highlightSync, type SynToken } from '@/lib/highlighter'
import { diffTotals, parseUnifiedDiff, type DiffFile } from '@/lib/unified-diff'
import { isSubmitShortcut } from '@/lib/use-submit-shortcut'
import { cn } from '@/lib/utils'

import { finishTitle } from './run-actions'
import { useFinishRun } from './use-finish-run'

/**
 * The review gate (spec 009, §"Task thread" review bullet) on the new surface — cezar's core
 * promise that nothing auto-merges. The flow is UNCHANGED from web/app.js `renderReviewPanel`;
 * only the surface is redesigned: a violet review banner, the diff as collapsible per-file
 * sections, a notes box with ↩ Send back (`POST /continue` with the `Review feedback:` prefix
 * — legacy semantics verbatim), Draft PR (`POST /pr`; 409 → the copyable `git merge` manual
 * fallback), and ✓ Accept (the shared finish action from use-finish-run.ts).
 *
 * Diff rendering is the honest R3 interim: unified text parsed by `parseUnifiedDiff`, lines
 * highlighted through the ONE Shiki singleton (`diff` grammar) with add/del backgrounds from
 * the `--diff-*` tokens. R5's Changes tab (word-level/split view, @pierre/diffs) replaces
 * `DiffFileBody` — that component is the named boundary, exactly like `InlineDiffPreview`.
 */
export function ReviewPanel({ run }: { run: ApiRun }) {
  return (
    <section data-slot="review-panel" aria-label="Review the changes" className="flex flex-col gap-3">
      <div
        data-slot="review-banner"
        className="flex items-center gap-2.5 rounded-md border border-violet/30 bg-violet/10 px-3.5 py-2.5"
      >
        <EyeIcon className="size-4 shrink-0 text-violet" aria-hidden="true" />
        <p className="min-w-0 text-[13px]">
          <span className="font-semibold">Review the changes before anything lands.</span>{' '}
          <span className="text-muted-foreground">
            Read the diff, send notes back, draft a PR — or accept. Nothing merges on its own.
          </span>
        </p>
      </div>

      <ReviewDiff runId={run.id} />
      <ReviewActions run={run} />
    </section>
  )
}

// ---- the diff -------------------------------------------------------------------------------

/** Sections beyond this many start hidden behind "Show N more files". */
const FILE_CAP = 20
/** Per-file line cap — a generated lockfile must not wedge the page. */
const DIFF_CLAMP_LINES = 300

function ReviewDiff({ runId }: { runId: string }) {
  const queryClient = useQueryClient()
  const diff = useRunDiff(runId)
  // Legacy parity (web/app.js: the panel "(re)loads the diff on each entry into review"):
  // this component only exists while status === 'review', so mounting IS entering — marking
  // the cached diff stale here refetches it on every re-entry, never showing a pre-send-back
  // diff after the agent worked again.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.runs.diff(runId) })
  }, [queryClient, runId])

  const files = useMemo(() => parseUnifiedDiff(diff.data ?? ''), [diff.data])
  const [showAllFiles, setShowAllFiles] = useState(false)

  if (diff.isPending) {
    return <p className="px-1 text-xs text-soft-foreground">Loading diff…</p>
  }
  if (diff.isError) {
    return <p className="px-1 text-xs text-danger">{diff.error.message}</p>
  }
  if (files.length === 0) {
    // Not a diff: the server's own sentence ("(no worktree — …)", "(diff failed …)") or an
    // empty answer. Show its words — they were written for the reader.
    return (
      <p data-slot="review-diff-empty" className="px-1 font-mono text-xs text-soft-foreground">
        {diff.data.trim() || '(no changes)'}
      </p>
    )
  }

  const totals = diffTotals(files)
  const shown = showAllFiles ? files : files.slice(0, FILE_CAP)
  return (
    <div data-slot="review-diff" className="flex min-w-0 flex-col gap-2">
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <span>
          {totals.files} {totals.files === 1 ? 'file' : 'files'} changed
        </span>
        <span className="font-mono font-semibold tabular-nums">
          <span className="text-success">+{totals.additions}</span>{' '}
          <span className="text-danger">−{totals.deletions}</span>
        </span>
      </p>
      {shown.map((file) => (
        <DiffFileSection key={`${file.oldPath ?? ''}→${file.path}`} file={file} />
      ))}
      {files.length > shown.length ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAllFiles(true)}>
          Show {files.length - shown.length} more files
        </Button>
      ) : null}
    </div>
  )
}

const statusBadge: Partial<Record<DiffFile['status'], string>> = {
  added: 'added',
  deleted: 'deleted',
  renamed: 'renamed',
}

/** One file of the diff as a collapsible card: path (with rename lineage), ± counts, body. */
function DiffFileSection({ file }: { file: DiffFile }) {
  const [open, setOpen] = useState(true)
  const badge = statusBadge[file.status]
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="diff-file"
      className="min-w-0 overflow-hidden rounded-md border border-border bg-card"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
        <ChevronRightIcon
          className={cn('size-3.5 shrink-0 text-soft-foreground transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
        <span data-slot="diff-file-path" className="min-w-0 truncate font-mono text-xs font-medium">
          {file.oldPath ? (
            <>
              <span className="text-soft-foreground">{file.oldPath} → </span>
              {file.path}
            </>
          ) : (
            file.path
          )}
        </span>
        {badge ? (
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            {badge}
          </span>
        ) : null}
        {file.binary ? (
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            binary
          </span>
        ) : null}
        <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold tabular-nums">
          <span className="text-success">+{file.additions}</span>{' '}
          <span className="text-danger">−{file.deletions}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/50">
          {file.binary ? (
            <p className="px-4 py-2.5 text-xs text-soft-foreground">Binary file — no text diff.</p>
          ) : file.lines.length === 0 ? (
            <p className="px-4 py-2.5 text-xs text-soft-foreground">No content changes (metadata only).</p>
          ) : (
            <DiffFileBody lines={file.lines} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * NAMED BOUNDARY for R5 (like `InlineDiffPreview`): @pierre/diffs' word-level `<Diff>`
 * replaces this body without touching the section chrome. Until then: the hunk lines through
 * the Shiki singleton's `diff` grammar, backgrounds from the `--diff-*` tokens, clamped with
 * an explicit "Show all" for huge files.
 */
function DiffFileBody({ lines }: { lines: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? lines : lines.slice(0, DIFF_CLAMP_LINES)
  const text = shown.join('\n')

  // Sync when the grammar is already resident (every file after the first), async once.
  const [loaded, setLoaded] = useState<{ text: string; tokens: SynToken[][] } | null>(null)
  useEffect(() => {
    let cancelled = false
    void highlight(text, 'diff').then((result) => {
      if (!cancelled) setLoaded({ text, tokens: result.tokens })
    })
    return () => {
      cancelled = true
    }
  }, [text])
  const tokens = loaded?.text === text ? loaded.tokens : (highlightSync(text, 'diff')?.tokens ?? null)

  return (
    <>
      <pre
        data-slot="diff-file-body"
        className="overflow-x-auto py-2 font-mono text-xs leading-[1.7] whitespace-pre"
      >
        {shown.map((line, index) => (
          <span
            key={index}
            className={cn(
              'block px-4',
              line.startsWith('+') && 'bg-diff-add',
              line.startsWith('-') && 'bg-diff-del',
              line.startsWith('@@') && 'text-soft-foreground',
            )}
          >
            {tokens?.[index] !== undefined
              ? tokens[index].map((token, i) => (
                  <span key={i} style={token.color !== undefined ? { color: token.color } : undefined}>
                    {token.content}
                  </span>
                ))
              : line}
            {/* An empty context line must still occupy its row. */}
            {line === '' ? ' ' : ''}
          </span>
        ))}
      </pre>
      {lines.length > DIFF_CLAMP_LINES ? (
        <button
          type="button"
          data-slot="diff-file-toggle"
          onClick={() => setExpanded((value) => !value)}
          className="block w-full border-t border-border/50 px-4 py-1.5 text-left text-[11px] font-medium text-soft-foreground hover:text-foreground"
        >
          {expanded ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      ) : null}
    </>
  )
}

// ---- notes + exits --------------------------------------------------------------------------

function ReviewActions({ run }: { run: ApiRun }) {
  const queryClient = useQueryClient()
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notes, setNotes] = useState('')
  const [manual, setManual] = useState<string | null>(null)
  const finish = useFinishRun(run.id)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })

  // Legacy send-back semantics verbatim (web/app.js `data-action="send-back"`): the notes go
  // back into the SAME session via continue, prefixed `Review feedback:` — the run leaves
  // `review`, works, and gates again. On success the status flip unmounts this panel.
  const sendBack = useMutation({
    mutationFn: (text: string) => continueRun(run.id, `Review feedback:\n${text}`),
    onSuccess: () => {
      setNotes('')
      invalidate()
    },
    onError: (error: Error) => toast(error.message, { tone: 'danger' }),
  })

  const draftPr = useMutation({
    mutationFn: () => createRunPr(run.id),
    onSuccess: (result) => {
      toast(`Draft PR created — ${result.url}`)
      invalidate() // the run completed as done with `pullRequestUrl` — refetch shows PR ↗
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.manual !== undefined) setManual(error.manual)
      toast(error.message, { tone: 'danger' })
    },
  })

  const submitNotes = () => {
    const text = notes.trim()
    if (text.length === 0) {
      // Legacy `alertBar('Write what to change first.')` + focus.
      toast('Write what to change first.')
      notesRef.current?.focus()
      return
    }
    sendBack.mutate(text)
  }

  return (
    <div data-slot="review-actions" className="flex flex-col gap-2">
      <Textarea
        ref={notesRef}
        data-slot="review-notes"
        aria-label="Notes for the agent"
        placeholder="Notes for the agent — what should change?"
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        onKeyDown={(event) => {
          // The spec's cross-surface chord: ⌘↵ / Ctrl+↵ submit review notes. Unlike the
          // composer, plain Enter stays a newline — notes are multi-line prose, and this box
          // has no legacy Enter-sends muscle memory to keep.
          const submits = isSubmitShortcut({
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            repeat: event.repeat,
            isComposing: event.nativeEvent.isComposing,
          })
          if (submits && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submitNotes()
          }
        }}
        className="min-h-[52px] text-[13px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-slot="review-send-back"
          variant="outline"
          size="sm"
          title="Send the notes back into the agent's session"
          disabled={sendBack.isPending}
          onClick={submitNotes}
        >
          <CornerUpLeftIcon aria-hidden="true" />
          Send back
        </Button>
        {run.pullRequestUrl !== undefined ? (
          // A PR already exists (agent-opened, spotted in the transcript) — a second Draft PR
          // click would open a duplicate. Legacy parity: the link replaces the button.
          <Button asChild variant="outline" size="sm">
            <a
              data-slot="pr-link"
              href={run.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="The PR for this task is already open"
            >
              <ExternalLinkIcon aria-hidden="true" />
              PR ↗
            </a>
          </Button>
        ) : (
          <Button
            data-slot="review-draft-pr"
            variant="outline"
            size="sm"
            title="Push the branch and open a draft PR"
            disabled={draftPr.isPending}
            onClick={() => draftPr.mutate()}
          >
            <GitPullRequestIcon aria-hidden="true" />
            Draft PR
          </Button>
        )}
        <Button
          data-slot="review-accept"
          variant="contrast"
          size="sm"
          className="ml-auto"
          title={finishTitle('review')}
          disabled={finish.isPending}
          onClick={() => finish.mutate()}
        >
          <CheckIcon aria-hidden="true" />
          Accept
        </Button>
      </div>
      {manual !== null ? <ManualMergeLine command={manual} /> : null}
    </div>
  )
}

/** The 409 fallback: the PR could not be opened, but the branch is real — show the merge
 *  command copyable, like the header's resume hint. */
function ManualMergeLine({ command }: { command: string }) {
  return (
    <button
      type="button"
      data-slot="review-manual"
      title="Copy the command"
      onClick={() => {
        void navigator.clipboard
          .writeText(command)
          .then(() => toast('Command copied to clipboard.'))
          .catch(() => toast(`Run manually: ${command}`))
      }}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left font-mono text-[11px] text-soft-foreground hover:bg-muted hover:text-foreground"
    >
      <CopyIcon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">manual path: {command}</span>
    </button>
  )
}

// ---- the accept celebration -----------------------------------------------------------------

/** True when the OS asks for reduced motion — the celebration renders nothing at all then
 *  (spec: "reduced-motion-safe"). False where `matchMedia` is missing (old jsdom, SSR). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const CELEBRATION_MS = 1500

/**
 * The brief twinkle moment when a review is accepted (spec §"Design system": lifecycle
 * surfaces may twinkle): watches the run's status and, on the review → done transition —
 * however it was triggered: the panel's ✓ Accept, the header's Finish, a Draft PR — shows a
 * one-shot ~1.5s overlay of the brand scatter. Purely decorative (`aria-hidden`,
 * pointer-transparent); the status pill is the accessible record of what happened.
 */
export function AcceptCelebration({ status }: { status: RunStatus }) {
  const previous = useRef(status)
  const [celebrating, setCelebrating] = useState(false)

  useEffect(() => {
    const before = previous.current
    previous.current = status
    if (before !== 'review' || status !== 'done') return
    if (prefersReducedMotion()) return
    setCelebrating(true)
    const timer = setTimeout(() => setCelebrating(false), CELEBRATION_MS)
    return () => clearTimeout(timer)
  }, [status])

  if (!celebrating) return null
  return (
    <div
      data-slot="accept-celebration"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 isolate z-40"
    >
      <TwinkleBackdrop />
      <div className="flex justify-center pt-24">
        <span className="rounded-full border border-violet/30 bg-violet/15 px-4 py-1.5 text-[13px] font-medium text-violet shadow-modal">
          ✓ Changes accepted
        </span>
      </div>
    </div>
  )
}
