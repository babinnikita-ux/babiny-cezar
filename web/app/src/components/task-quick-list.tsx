import { ArrowUpRightIcon, ChevronDownIcon } from 'lucide-react'
import * as React from 'react'
import { Link, useMatch } from 'react-router'

import { useRuns } from '@/api/queries'
import type { RunRecord } from '@/api/types'
import { useListView } from '@/components/list-view'
import { StatusDot } from '@/components/status-dot'
import { deriveAttention } from '@/lib/attention'
import { compactTokens, shortAge } from '@/lib/format'
import { groupRuns, listCounts, type ListView, type QuickListRow } from '@/lib/task-groups'
import { cn } from '@/lib/utils'

/**
 * The sidebar's task quick-list (spec, "App shell & navigation"): Active/Archived tabs, then the
 * runs grouped Needs you / Working / Recent, with variant groups collapsed into one tile.
 *
 * Presentational — every decision it paints (which bucket, which order, which dot, whether a
 * group collapses) is made by `lib/task-groups.ts` and `lib/attention.ts`, which are pure and
 * table-tested. What is left here is markup, the router, and the expand/collapse toggle.
 */
export function TaskQuickList({
  runs,
  view,
  onViewChange,
  currentRunId = null,
  now = Date.now(),
}: {
  runs: RunRecord[]
  view: ListView
  onViewChange: (view: ListView) => void
  /** The run open at `/tasks/:id`, so its row can show as active. */
  currentRunId?: string | null
  /** Injected so the ages are not racing the clock in tests. */
  now?: number
}) {
  // Which variant groups are open. Local: it is view state about this list, nothing else reads it.
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set())
  const toggleGroup = (groupId: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(groupId)) next.add(groupId)
      return next
    })

  const counts = listCounts(runs)
  const buckets = groupRuns(runs, view)

  return (
    <div data-slot="quick-list">
      {/* Sticky, not scrolled away: the tabs say what you are looking at, and a long Recent list
          must not be able to hide that the view is filtered. */}
      <div className="sticky top-0 z-10 bg-sidebar pt-2 pb-1">
        <div className="inline-flex w-full gap-0.5 rounded-md bg-muted p-[3px]">
          <ViewTab view="active" current={view} onSelect={onViewChange} count={counts.active}>
            Active
            {/* The one reason to look at a tab you are not on. */}
            {counts.waiting > 0 && view !== 'active' ? (
              <StatusDot tone="pending" pulse data-slot="waiting-dot" aria-label="needs you" />
            ) : null}
          </ViewTab>
          <ViewTab view="archived" current={view} onSelect={onViewChange} count={counts.archived}>
            Archived
          </ViewTab>
        </div>
      </div>

      {buckets.length === 0 ? (
        <p className="px-3 py-3.5 text-xs text-soft-foreground">
          {view === 'archived' ? 'Nothing archived yet.' : 'No tasks yet — describe one.'}
        </p>
      ) : (
        buckets.map((bucket) => (
          <div key={bucket.label} data-slot="quick-list-bucket" data-bucket={bucket.label}>
            <h2 className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-soft-foreground uppercase">
              {bucket.label}
            </h2>
            {bucket.rows.map((row) => (
              <Row
                key={row.kind === 'group' ? row.groupId : row.run.id}
                row={row}
                currentRunId={currentRunId}
                now={now}
                expanded={row.kind === 'group' && expanded.has(row.groupId)}
                onToggle={toggleGroup}
              />
            ))}
          </div>
        ))
      )}
    </div>
  )
}

function ViewTab({
  view,
  current,
  onSelect,
  count,
  children,
}: {
  view: ListView
  current: ListView
  onSelect: (view: ListView) => void
  count: number
  children: React.ReactNode
}) {
  const isActive = view === current
  return (
    <button
      type="button"
      data-slot="view-tab"
      data-view={view}
      // Toggle buttons rather than a real tablist: these filter one list in place, they do not
      // switch between panels — `aria-pressed` is what that actually is.
      aria-pressed={isActive}
      onClick={() => onSelect(view)}
      className={cn(
        'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12.5px] font-medium text-muted-foreground',
        isActive && 'bg-card font-semibold text-foreground shadow-xs'
      )}
    >
      {children}
      {/* No "0": an empty bucket says so by being empty. */}
      {count > 0 ? <span className="font-mono text-[11px] tabular-nums">{count}</span> : null}
    </button>
  )
}

function Row({
  row,
  currentRunId,
  now,
  expanded,
  onToggle,
}: {
  row: QuickListRow
  currentRunId: string | null
  now: number
  expanded: boolean
  onToggle: (groupId: string) => void
}) {
  if (row.kind === 'run') {
    return <RunRow run={row.run} queuePosition={row.queuePosition} currentRunId={currentRunId} now={now} />
  }
  return (
    <>
      <button
        type="button"
        data-slot="group-tile"
        data-group-id={row.groupId}
        aria-expanded={expanded}
        onClick={() => onToggle(row.groupId)}
        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-[7px] text-left hover:bg-muted"
      >
        <ChevronDownIcon
          className={cn('size-3 shrink-0 text-soft-foreground transition-transform', !expanded && '-rotate-90')}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.title}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
          ×{row.members.length}
        </span>
      </button>
      {expanded
        ? row.members.map((member) => (
            <RunRow key={member.id} run={member} queuePosition={null} currentRunId={currentRunId} now={now} variant />
          ))
        : null}
    </>
  )
}

/**
 * One run.
 *
 * The row is a `<Link>` and the PR chip is its flex *sibling*, not its child: an anchor inside an
 * anchor is invalid, and both targets are real — the row opens the task, the chip opens the PR.
 */
function RunRow({
  run,
  queuePosition,
  currentRunId,
  now,
  variant = false,
}: {
  run: RunRecord
  queuePosition: number | null
  currentRunId: string | null
  now: number
  /** A member row under an expanded group tile: indented, letter-chipped, and labelled with what
   *  actually distinguishes the variants (runner and spend) rather than the shared title. */
  variant?: boolean
}) {
  const attention = deriveAttention(run)
  const isActive = run.id === currentRunId
  // A variant row spends its width on what distinguishes the variants (runner and spend) rather
  // than on an age they all share — they started together. Per the mockup.
  const age = variant
    ? ''
    : queuePosition !== null
      ? `#${queuePosition}`
      : shortAge(run.finishedAt ?? run.createdAt, now)

  return (
    <div
      data-slot="task-row"
      data-run-id={run.id}
      // The row's highlight is a wrapper concern (the PR chip sits outside the Link), so the
      // active state has to be readable here rather than only from the Link's `aria-current`.
      data-active={isActive ? 'true' : undefined}
      className={cn(
        'flex items-center rounded-sm hover:bg-muted',
        isActive && 'bg-muted',
        variant && 'pl-4'
      )}
    >
      <Link
        to={`/tasks/${run.id}`}
        // The row's accessible name is the title; `title` gives the full text back when the CSS
        // truncates it, which for a one-line 264px column is most of the time.
        title={run.title}
        aria-current={isActive ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-[7px]"
      >
        {variant ? (
          <span className="inline-flex size-[15px] shrink-0 items-center justify-center rounded-full bg-violet/15 font-mono text-[9.5px] font-semibold text-violet">
            {run.variant ?? '?'}
          </span>
        ) : null}
        <StatusDot tone={attention.tone} pulse={attention.pulse} aria-label={attention.label} role="img" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {variant ? variantLabel(run) : runTitle(run)}
        </span>
        {/* The PR chip takes the age's slot when there is one — same as the mockup. */}
        {run.pullRequestUrl || !age ? null : (
          <span className="shrink-0 text-[11px] text-soft-foreground tabular-nums">{age}</span>
        )}
      </Link>
      {run.pullRequestUrl ? (
        <a
          data-slot="pr-chip"
          href={run.pullRequestUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={run.pullRequestUrl}
          aria-label={`Open the pull request for ${run.title}`}
          className="mr-2.5 inline-flex shrink-0 items-center gap-[3px] rounded-full border border-violet/35 px-1.5 py-px font-mono text-[10.5px] font-semibold text-violet hover:bg-violet/10"
        >
          PR
          <ArrowUpRightIcon className="size-[9px]" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}

/**
 * What a row calls a run.
 *
 * `run.title` for now. Phase R2 adds the auto-summary (`titleSummary`) that the spec's "editable
 * auto-summary title" describes, and this is the single place it plugs in — `titleSummary ??
 * run.title`. It is not read speculatively today: no server writes it, so `RunRecord` has no such
 * field (the mirror in `api/types.ts` is type-checked against the server's own), and reaching for
 * one would be reading a field that cannot exist.
 */
function runTitle(run: RunRecord): string {
  return run.title
}

/** A variant row's subtitle: what differs between A and B — the backend and what it has spent.
 *  `runner` is absent on records predating the choice; those are Claude by definition. */
function variantLabel(run: RunRecord): string {
  const parts: string[] = [run.runner ?? 'claude']
  if (run.tokensUsed > 0) parts.push(compactTokens(run.tokensUsed))
  return parts.join(' · ')
}

/** Re-render on a slow tick so the ages stay true. 30s: finer than the coarsest unit a row can
 *  show ('1m'), and cheap enough that a sidebar of rows costs nothing between SSE updates. */
function useNow(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/**
 * The quick-list wired to live data: `useRuns()` for the list (kept fresh by the global SSE
 * stream, Step 3.2), the router for which row is open, and the shared Active/Archived context so
 * the sidebar and the Tasks table (Step 3.4) always show the same filter.
 */
export function TaskQuickListContainer() {
  const runs = useRuns()
  const [view, setView] = useListView()
  const match = useMatch('/tasks/:id/*')
  const exact = useMatch('/tasks/:id')
  const now = useNow(30_000)

  // Nothing at all until the list has answered: a skeleton here would be inventing rows, and an
  // empty state would claim "No tasks yet" before we know whether there are any.
  if (!runs.data) return null

  return (
    <TaskQuickList
      runs={runs.data}
      view={view}
      onViewChange={setView}
      // Both matches: `/tasks/:id` and its `/changes` and `/files` children all keep the row lit.
      currentRunId={match?.params.id ?? exact?.params.id ?? null}
      now={now}
    />
  )
}
