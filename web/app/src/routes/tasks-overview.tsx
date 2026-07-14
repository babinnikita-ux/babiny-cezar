import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  ListChecksIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router'

import { archiveFinished } from '@/api/client'
import { useRunUsage } from '@/api/global-events'
import { queryKeys, useRuns } from '@/api/queries'
import type { RunRecord } from '@/api/types'
import { CenteredState } from '@/components/centered-state'
import { useListView } from '@/components/list-view'
import { Pill } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { deriveAttention } from '@/lib/attention'
import { compactTokens, shortAge } from '@/lib/format'
import { listCounts, queuePositions, sortRuns, type ListView } from '@/lib/task-groups'
import {
  compareGroups,
  filterRuns,
  finishedRunCount,
  formatCost,
  prNumber,
  usageCells,
  workflowLabel,
  type UsageCell,
} from '@/lib/tasks-table'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * The Tasks overview — the table that IS the home at `/` (spec, "Task list & table", per PR
 * #392: the Tasks nav always lands here, there is no list/table presentation toggle, and the
 * Active/Archived tabs in this header are the *same state* as the sidebar quick-list's tabs).
 *
 * Presentational: sorting, search, queue numbers, usage-cell decisions and the compare strip
 * all come from the pure modules (`lib/task-groups.ts`, `lib/tasks-table.ts`,
 * `lib/attention.ts`). What lives here is markup, the router, and the local search text.
 *
 * Below `md` the table becomes a stacked card list plus a New-task FAB — same rows, same order,
 * same data, only the framing changes (mockup `tasks-home.html`, mobile section).
 */
export function TasksOverview({
  runs,
  view,
  onViewChange,
  onArchiveFinished,
  now = Date.now(),
}: {
  /** Undefined while `/api/runs` has not answered: the header renders, the body stays empty —
   *  an empty state before we know there are no runs would be a lie. */
  runs: RunRecord[] | undefined
  view: ListView
  onViewChange: (view: ListView) => void
  onArchiveFinished: () => void
  /** Injected so the ages are not racing the clock in tests. */
  now?: number
}) {
  const [query, setQuery] = React.useState('')
  const all = runs ?? []
  const counts = listCounts(all)
  const visible = sortRuns(filterRuns(all, query), view)
  // Positions come from the full list, never the filtered one: a search must not renumber the
  // queue the engine is actually going to drain.
  const positions = queuePositions(all)
  const strips = compareGroups(filterRuns(all, query), view)
  const finished = finishedRunCount(all)

  return (
    <div data-route="tasks" className="flex min-h-full flex-col">
      {/* Desktop header. Below `md` the shell's top bar already says "Tasks", and the drawer
          carries the shared Active/Archived tabs — repeating them here would be a third copy. */}
      <header className="sticky top-0 z-10 hidden h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-5 md:flex">
        <h1 className="text-base font-semibold">Tasks</h1>
        <div className="inline-flex gap-0.5 rounded-md bg-muted p-[3px]">
          <OverviewTab view="active" current={view} onSelect={onViewChange} count={counts.active}>
            Active
          </OverviewTab>
          <OverviewTab view="archived" current={view} onSelect={onViewChange} count={counts.archived}>
            Archived
          </OverviewTab>
        </div>
        <div className="flex-1" />
        {/* Only when there is something to sweep, like the legacy header's count-gated broom. */}
        {view === 'active' && finished > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-slot="archive-finished"
            onClick={onArchiveFinished}
          >
            <ArchiveIcon className="size-3.5" aria-hidden="true" />
            Archive finished
          </Button>
        ) : null}
        <div className="relative w-60">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-soft-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-8 text-[13px] text-foreground outline-none placeholder:text-soft-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col p-3 pb-[calc(90px+env(safe-area-inset-bottom))] md:p-5 md:pb-5">
        {runs === undefined ? null : visible.length === 0 ? (
          <TasksEmptyState view={view} query={query} />
        ) : (
          <>
            {/* ≥md: the table. */}
            <div
              data-slot="tasks-table"
              className="hidden overflow-x-auto rounded-lg border border-border bg-card shadow-xs md:block"
            >
              <table className="w-full min-w-[1040px] border-collapse">
                <thead>
                  <tr>
                    <Th>Status</Th>
                    <Th>Task</Th>
                    <Th>Workflow</Th>
                    <Th>Branch</Th>
                    <Th>±</Th>
                    <Th>PR</Th>
                    <Th right>Tokens</Th>
                    <Th right>Cost</Th>
                    <Th right>CPU</Th>
                    <Th right>Mem</Th>
                    <Th right>Started</Th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {visible.map((run) => (
                    <TableRow
                      key={run.id}
                      run={run}
                      queuePosition={run.status === 'queued' ? (positions.get(run.id) ?? null) : null}
                      now={now}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* <md: the same runs as stacked cards. */}
            <div data-slot="task-cards" className="flex flex-col gap-2.5 md:hidden">
              {visible.map((run) => (
                <TaskCard
                  key={run.id}
                  run={run}
                  queuePosition={run.status === 'queued' ? (positions.get(run.id) ?? null) : null}
                  now={now}
                />
              ))}
            </div>
          </>
        )}

        {strips.map((group) => (
          <div
            key={group.groupId}
            data-slot="compare-strip"
            data-group-id={group.groupId}
            className="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12.5px] text-muted-foreground shadow-xs"
          >
            <ScaleIcon className="size-[15px] shrink-0 text-soft-foreground" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-foreground">{group.title}</strong> — {group.count} variants
              finished
            </span>
            <Button asChild variant="outline" size="sm" className="md:ml-auto">
              <Link to={`/compare/${group.groupId}`}>Compare</Link>
            </Button>
          </div>
        ))}
      </div>

      {/* The mobile New-task FAB. The desktop CTA lives in the sidebar. */}
      {/* A plain anchor is intentional until R4: a full /new request is routed by Hono to the
          working legacy composer, while React's /new route is only a parameter-preserving shell. */}
      <a
        href="/new"
        data-slot="new-task-fab"
        aria-label="New task"
        className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-modal md:hidden"
      >
        <PlusIcon className="size-[22px]" aria-hidden="true" />
      </a>
    </div>
  )
}

/**
 * What an empty list honestly means, given how it got empty — as a CenteredState, one variant
 * per cause. Only the no-tasks-at-all state is a hero moment and gets the twinkle backdrop
 * (spec: textures on hero/empty surfaces only); a missed search or an unswept archive is just
 * a fact, so those stay flat. `heading="h2"` because the page's h1 is the header's "Tasks".
 */
function TasksEmptyState({ view, query }: { view: ListView; query: string }) {
  const needle = query.trim()
  const kind = needle ? 'search-miss' : view === 'archived' ? 'archive' : 'no-tasks'
  return (
    <div data-slot="tasks-empty" data-empty-kind={kind} className="flex flex-1 flex-col">
      {kind === 'search-miss' ? (
        <CenteredState
          heading="h2"
          icon={<SearchXIcon />}
          tone="neutral"
          title="No matching tasks"
          subtitle={`No tasks match “${needle}”.`}
        />
      ) : kind === 'archive' ? (
        <CenteredState
          heading="h2"
          icon={<ArchiveIcon />}
          tone="neutral"
          title="Nothing archived yet"
          subtitle="Finished tasks you archive land here."
        />
      ) : (
        <CenteredState
          heading="h2"
          icon={<ListChecksIcon />}
          tone="primary"
          backdrop
          title="No tasks yet"
          subtitle="Describe a task to get started."
          actions={
            <Button asChild>
              <a href="/new">
                <PlusIcon aria-hidden="true" />
                New task
              </a>
            </Button>
          }
        />
      )}
    </div>
  )
}

function OverviewTab({
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
      data-slot="overview-tab"
      data-view={view}
      // Same rationale as the sidebar's tabs: these filter one list in place, they do not switch
      // panels — `aria-pressed` is what that actually is.
      aria-pressed={isActive}
      onClick={() => onSelect(view)}
      className={cn(
        'flex h-7 items-center justify-center gap-1.5 rounded-[7px] px-3 text-[12.5px] font-medium text-muted-foreground',
        isActive && 'bg-card font-semibold text-foreground shadow-xs'
      )}
    >
      {children}
      {count > 0 ? <span className="font-mono text-[11px] tabular-nums">{count}</span> : null}
    </button>
  )
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        'h-[38px] border-b border-border px-2.5 text-left text-[11px] font-semibold tracking-[0.05em] whitespace-nowrap text-soft-foreground uppercase first:pl-4 last:pr-4',
        right && 'text-right'
      )}
    >
      {children}
    </th>
  )
}

const TD_BASE = 'h-11 border-b border-border px-2.5 whitespace-nowrap first:pl-4 last:pr-4'

/**
 * One run, one row.
 *
 * The whole row is a click target for `/tasks/:id` — but a click that lands on any anchor inside
 * it (the PR chip, the title's real link) belongs to that anchor and is not hijacked. The title
 * is a true `<Link>` so the row's destination exists for keyboards and middle-clicks too.
 */
function TableRow({
  run,
  queuePosition,
  now,
}: {
  run: RunRecord
  queuePosition: number | null
  now: number
}) {
  const navigate = useNavigate()
  const attention = deriveAttention(run)
  const to = `/tasks/${run.id}`
  const cost = formatCost(run.costUsd)

  return (
    <tr
      data-slot="task-table-row"
      data-run-id={run.id}
      onClick={(event) => {
        if ((event.target as Element).closest('a')) return
        navigate(to)
      }}
      className="cursor-pointer hover:bg-muted"
    >
      <td className={TD_BASE}>
        <Pill dot={attention.tone} pulse={attention.pulse}>
          {attention.label}
        </Pill>
      </td>
      <td className={cn(TD_BASE, 'w-[34%] max-w-0')}>
        <Link to={to} title={run.title} className="block truncate text-[13px] font-medium">
          {run.title}
        </Link>
      </td>
      <td className={cn(TD_BASE, 'text-[12.5px] text-muted-foreground')}>{workflowLabel(run)}</td>
      <td className={TD_BASE}>{run.branch ? <BranchChip branch={run.branch} /> : <Dash />}</td>
      {/* ± is honest-empty until R2 persists a diffStat — there is no such field to read today. */}
      <td className={cn(TD_BASE, 'text-[13px]')}>
        <Dash />
      </td>
      <td className={TD_BASE}>
        {run.pullRequestUrl ? <PrChip url={run.pullRequestUrl} taskTitle={run.title} /> : <Dash />}
      </td>
      <td className={cn(TD_BASE, 'text-right font-mono text-xs text-muted-foreground tabular-nums')}>
        {compactTokens(run.tokensUsed)}
      </td>
      <td className={cn(TD_BASE, 'text-right font-mono text-xs text-muted-foreground tabular-nums')}>
        {cost || <Dash />}
      </td>
      {queuePosition !== null ? (
        <td
          data-slot="queue-note"
          colSpan={2}
          className={cn(TD_BASE, 'text-right font-mono text-[11.5px] text-soft-foreground')}
        >
          #{queuePosition} in queue
        </td>
      ) : (
        <UsageTds run={run} />
      )}
      <td className={cn(TD_BASE, 'text-right text-xs text-soft-foreground tabular-nums')}>
        {shortAge(run.startedAt ?? run.createdAt, now)}
      </td>
    </tr>
  )
}

/**
 * The live CPU/Mem pair, read from the global usage stream (`useRunUsage`, never `run.usage` —
 * the REST snapshot goes stale between refetches; the stream ticks every ~2s). Selected per run,
 * so a tick that says nothing about this run re-renders nothing.
 */
function UsageTds({ run }: { run: RunRecord }) {
  const sample = useRunUsage(run.id)
  const cells = usageCells(run, sample)
  return (
    <>
      <UsageTd column="cpu" cell={cells.cpu} />
      <UsageTd column="mem" cell={cells.mem} />
    </>
  )
}

function UsageTd({ column, cell }: { column: 'cpu' | 'mem'; cell: UsageCell }) {
  return (
    <td
      data-usage={column}
      data-usage-kind={cell.kind}
      title={cell.title}
      className={cn(
        TD_BASE,
        'text-right font-mono tabular-nums',
        cell.kind === 'live' && 'bg-violet/5 text-xs font-medium text-foreground',
        cell.kind === 'peak' && 'text-[11.5px] text-soft-foreground',
        cell.kind === 'none' && 'text-xs text-soft-foreground'
      )}
    >
      {cell.text || '—'}
    </td>
  )
}

/** One run, one card — the `<md` framing of the same row. */
function TaskCard({
  run,
  queuePosition,
  now,
}: {
  run: RunRecord
  queuePosition: number | null
  now: number
}) {
  const navigate = useNavigate()
  const attention = deriveAttention(run)
  const to = `/tasks/${run.id}`

  return (
    <div
      data-slot="task-card"
      data-run-id={run.id}
      onClick={(event) => {
        if ((event.target as Element).closest('a')) return
        navigate(to)
      }}
      className="cursor-pointer rounded-lg border border-border bg-card px-3.5 py-3 shadow-xs"
    >
      <div className="flex items-start gap-2.5">
        <Pill dot={attention.tone} pulse={attention.pulse} className="mt-px shrink-0">
          {attention.label}
        </Pill>
        <Link to={to} className="min-w-0 flex-1 text-[13.5px] leading-[1.35] font-medium">
          {run.title}
        </Link>
        <span className="mt-0.5 shrink-0 text-[11.5px] text-soft-foreground tabular-nums">
          {shortAge(run.finishedAt ?? run.createdAt, now)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] font-medium text-muted-foreground tabular-nums">
        <span>{workflowLabel(run)}</span>
        {queuePosition !== null ? (
          <>
            <Sep />
            <span data-slot="queue-note">#{queuePosition} in queue</span>
          </>
        ) : (
          <>
            {run.branch ? (
              <>
                <Sep />
                <span>{run.branch}</span>
              </>
            ) : null}
            {run.tokensUsed > 0 ? (
              <>
                <Sep />
                <span>{compactTokens(run.tokensUsed)}</span>
              </>
            ) : null}
          </>
        )}
        {run.pullRequestUrl ? (
          <PrChip url={run.pullRequestUrl} taskTitle={run.title} className="h-5" />
        ) : null}
      </div>
    </div>
  )
}

/** An honest em dash: this cell has nothing true to show. */
function Dash() {
  return <span className="text-xs text-soft-foreground">—</span>
}

function Sep() {
  return (
    <span className="text-soft-foreground" aria-hidden="true">
      ·
    </span>
  )
}

function BranchChip({ branch }: { branch: string }) {
  return (
    <span className="rounded-[6px] bg-muted px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-muted-foreground">
      {branch}
    </span>
  )
}

/** The out-of-app link. One style for every PR — the record carries no merged/closed state to
 *  honestly split violet-open from green-merged (that is R5's forge driver). */
function PrChip({ url, taskTitle, className }: { url: string; taskTitle: string; className?: string }) {
  const num = prNumber(url)
  return (
    <a
      data-slot="pr-chip"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      aria-label={`Open the pull request for ${taskTitle}`}
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full border border-violet/35 px-2 font-mono text-[11px] font-semibold text-violet hover:bg-violet/10',
        className
      )}
    >
      {num ? `#${num}` : 'PR'}
      <ArrowUpRightIcon className="size-2.5" aria-hidden="true" />
    </a>
  )
}

/**
 * The overview wired to live data: `useRuns()` (kept fresh by the global SSE stream), the shared
 * Active/Archived context (the sidebar's tabs and these are one state), and the archive-finished
 * mutation. The invalidate on success is the authoritative half of the doctrine — the stream will
 * likely have patched each archived run already, but the endpoint's answer is the truth.
 */
export function TasksOverviewRoute() {
  const runs = useRuns()
  const [view, setView] = useListView()
  const queryClient = useQueryClient()
  const archive = useMutation({
    mutationFn: archiveFinished,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs.all }),
  })
  const now = useNow(30_000)

  return (
    <TasksOverview
      runs={runs.data}
      view={view}
      onViewChange={setView}
      onArchiveFinished={() => archive.mutate()}
      now={now}
    />
  )
}
