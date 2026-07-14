import { MessageSquareTextIcon, SearchXIcon } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Link, useParams } from 'react-router'

import { ApiError } from '@/api/client'
import { useRun } from '@/api/queries'
import { useRunEvents } from '@/api/run-events'
import type { ApiRun } from '@/api/types'
import { CenteredState } from '@/components/centered-state'
import { Pill } from '@/components/pill'
import { StatusDot } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { deriveAttention } from '@/lib/attention'
import { runTitle } from '@/lib/task-groups'
import { cn } from '@/lib/utils'

import {
  AssistantMessage,
  ContextGroup,
  ImageItem,
  NoteLine,
  ReasoningItem,
  ToolCard,
  ToolStreak,
  UserBubble,
} from './thread-items'
import { PlanDock, planCounts } from './plan-dock'
import { StepRail } from './step-rail'
import { groupThreadItems, type ThreadBlock } from './thread-groups'
import { ThreadLoading } from './thread-loading'
import { latestPlanEntries, reduceThread, threadFooter, type ThreadEntry, type ThreadState } from './thread-state'

/**
 * `/tasks/:id` — the Session tab (spec, "Task thread"). Step 1.1 scope: turns with user
 * bubbles, assistant markdown, dim lifecycle lines, plain tool rows (`ToolItemRow` is the
 * boundary Step 1.2 replaces with the real cards), and the waiting/closed footer. The run
 * header (meta/tabs/actions) is Step 1.4; the composer is Phase 2.
 *
 * Data doctrine: `useRun` (fetch) is authoritative for the record — status, title, error;
 * `useRunEvents` (SSE replay + live) is the transcript. The reducer folds the full event list
 * on each change — fine at this phase's scale; virtualization and incremental folding are
 * Step 2.4's, deliberately.
 */
export function TaskThreadRoute() {
  const { id } = useParams<{ id: string }>()
  const run = useRun(id)
  const events = useRunEvents(id)
  const thread = useMemo(() => reduceThread(events), [events])

  if (run.isPending) return <ThreadLoading />

  if (run.isError) {
    const notFound = run.error instanceof ApiError && run.error.status === 404
    return (
      <div data-route="task-thread" className="flex min-h-full flex-col">
        <CenteredState
          icon={notFound ? <SearchXIcon /> : <MessageSquareTextIcon />}
          tone={notFound ? 'neutral' : 'danger'}
          title={notFound ? 'Task not found' : 'Could not load this task'}
          subtitle={
            notFound
              ? 'No run has this id. It may have been deleted, or the link is from another machine.'
              : run.error.message
          }
          actions={
            <Button asChild variant="outline">
              <Link to="/">Back to tasks</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return <ThreadView run={run.data} thread={thread} />
}

/** The loaded thread, presentational — tests drive it with reduced fixture states directly. */
export function ThreadView({ run, thread }: { run: ApiRun; thread: ThreadState }) {
  const attention = deriveAttention(run)
  const footer = threadFooter(run.status, run.error)
  // The dock's data: the latest plan snapshot across turns (full replacement — an emptied
  // plan hides the dock and the header mirror alike).
  const plan = latestPlanEntries(thread)
  const planTally = plan !== undefined && plan.length > 0 ? planCounts(plan) : undefined

  return (
    <div data-route="task-thread" className="flex min-h-full flex-col">
      {/* Slim interim header — Step 1.4 replaces it with the full run header (meta, tabs,
          action bar). Title + status + the workflow step rail, so the thread below has its
          context (the rail stays pinned like the mockup's fixed header region). */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto w-full max-w-[820px]">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 truncate text-[15px] font-semibold">{runTitle(run)}</h1>
            <span className="ml-auto flex shrink-0 items-center gap-2.5">
              {planTally ? (
                // The plan dock's compact mirror (spec: "mirrored as a compact progress line
                // in the run header").
                <span data-slot="plan-mirror" className="text-[11px] text-soft-foreground tabular-nums">
                  Plan {planTally.done}/{planTally.total}
                </span>
              ) : null}
              <Pill dot={attention.tone} pulse={attention.pulse}>
                {attention.label}
              </Pill>
            </span>
          </div>
          {run.steps.length > 0 ? (
            <div className="mt-2.5">
              <StepRail steps={run.steps} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col gap-3.5 px-4 py-5 md:px-6">
        {/* The initial prompt: the engine writes no v1 `user-message` line for it — the task on
            the run record IS that message, so it renders from there, not from an invented event. */}
        {run.task ? <UserBubble text={run.task} /> : null}

        {thread.turns.map((turn) => (
          <Fragment key={turn.id}>
            {turn.userMessage ? (
              <UserBubble text={turn.userMessage.text} imageCount={turn.userMessage.imageCount} />
            ) : null}
            {groupThreadItems(turn.items).map((block) => (
              <ThreadBlockView key={block.id} block={block} />
            ))}
          </Fragment>
        ))}

        {thread.turns.length === 0 ? (
          <p data-slot="thread-empty" className="py-6 text-center text-xs text-soft-foreground">
            No session events yet.
          </p>
        ) : null}

        {footer ? (
          <div
            data-slot="thread-footer"
            data-state={footer.state}
            className={cn(
              'mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs',
              footer.state === 'waiting' && 'text-muted-foreground',
              footer.state === 'closed' && footer.tone === 'danger' ? 'text-danger' : '',
              footer.state === 'closed' && footer.tone === 'dim' ? 'text-soft-foreground' : '',
            )}
          >
            {footer.state === 'waiting' ? (
              <>
                <StatusDot tone="pending" pulse />
                The agent is paused, waiting for your reply
              </>
            ) : (
              footer.label
            )}
          </div>
        ) : null}
      </div>

      {/* The dock region (mockup `.dock`): pinned above where the composer lands in Phase 2.
          Only the plan dock lives here for now — absent plan, absent dock. */}
      {plan !== undefined && plan.length > 0 ? (
        <div
          data-slot="thread-dock"
          className="sticky bottom-0 z-10 bg-background px-4 pt-1.5 pb-3 max-md:border-t max-md:border-border md:px-6 md:pb-4"
        >
          <div className="mx-auto w-full max-w-[820px]">
            {/* Keyed by run id: the collapse default re-derives per task (see PlanDock). */}
            <PlanDock key={run.id} runId={run.id} entries={plan} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** One grouped block → its surface. Grouping (context groups, streaks, sub-agent nesting) is
 *  `groupThreadItems`'s — this only maps block kinds to components. */
function ThreadBlockView({ block }: { block: ThreadBlock }) {
  switch (block.kind) {
    case 'entry':
      return <ThreadEntryView entry={block.entry} />
    case 'tool-card':
      return <ToolCard item={block.item} nested={block.children} />
    case 'context-group':
      return <ContextGroup group={block} />
    case 'streak':
      return (
        <ToolStreak count={block.count}>
          {block.blocks.map((inner) => (
            <ThreadBlockView key={inner.id} block={inner} />
          ))}
        </ToolStreak>
      )
  }
}

/** One reducer entry → its block (non-tool entries; tools always arrive as tool-card blocks). */
function ThreadEntryView({ entry }: { entry: ThreadEntry }) {
  switch (entry.kind) {
    case 'message':
      // Agent-side user echoes (some backends emit them) read as user bubbles too.
      return entry.role === 'assistant' ? (
        <AssistantMessage text={entry.text} />
      ) : (
        <UserBubble text={entry.text} />
      )
    case 'reasoning':
      return <ReasoningItem text={entry.text} />
    case 'tool':
      return <ToolCard item={entry} />
    case 'note':
      return <NoteLine note={entry} />
    case 'image':
      return <ImageItem image={entry} />
  }
}
