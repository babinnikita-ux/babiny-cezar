import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquareTextIcon, PlayIcon, SearchXIcon } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Link, useParams } from 'react-router'

import { ApiError, continueRun } from '@/api/client'
import { queryKeys, useRun, useSendMessage } from '@/api/queries'
import { useRunEvents } from '@/api/run-events'
import type { ApiRun } from '@/api/types'
import { CenteredState } from '@/components/centered-state'
import { Composer } from '@/components/composer/composer'
import { StatusDot } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
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
import { runActionFlags } from './run-actions'
import { RunHeader } from './run-header'
import { groupThreadItems, type ThreadBlock } from './thread-groups'
import { ThreadLoading } from './thread-loading'
import {
  latestPlanEntries,
  reduceThread,
  threadFilePaths,
  threadFooter,
  type ThreadEntry,
  type ThreadState,
} from './thread-state'

/**
 * `/tasks/:id` — the Session tab (spec, "Task thread"): the run header (title/meta/tabs/
 * actions — see run-header.tsx), turns with user bubbles, assistant markdown, tool cards,
 * dim lifecycle lines, the closed footer, and the docked composer (plan dock · paused hint ·
 * reply box).
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

/** The loaded thread. The header owns its own data hooks (mutations, the runs list); the
 *  thread body stays presentational — tests drive it with reduced fixture states directly. */
export function ThreadView({ run, thread }: { run: ApiRun; thread: ThreadState }) {
  const footer = threadFooter(run.status, run.error)
  // The dock's data: the latest plan snapshot across turns (full replacement — an emptied
  // plan hides the dock and the header mirror alike).
  const plan = latestPlanEntries(thread)
  const planTally = plan !== undefined && plan.length > 0 ? planCounts(plan) : undefined
  // The legacy session-open rule (web/app.js `updateDetail`): the composer can deliver while
  // the engine owns a live session — running queues the message, waiting answers it.
  const sessionOpen = run.status === 'running' || run.status === 'waiting'
  const sendMessage = useSendMessage(run.id)

  return (
    <div data-route="task-thread" className="flex min-h-full flex-col">
      <RunHeader run={run} planTally={planTally} />

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

        {/* Closed states read as the body's last line; the WAITING state lives in the dock
            (mockup `.paused-hint`), right above the composer it is asking the user to use. */}
        {footer && footer.state === 'closed' ? (
          <div
            data-slot="thread-footer"
            data-state={footer.state}
            className={cn(
              'mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs',
              footer.tone === 'danger' ? 'text-danger' : 'text-soft-foreground',
            )}
          >
            {footer.label}
          </div>
        ) : null}
      </div>

      {/* The dock region (mockup `.dock`): plan dock, paused hint, then the composer. */}
      <div
        data-slot="thread-dock"
        className="sticky bottom-0 z-10 bg-background px-4 pt-1.5 pb-3 max-md:border-t max-md:border-border md:px-6 md:pb-4"
      >
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-2.5">
          {plan !== undefined && plan.length > 0 ? (
            // Keyed by run id: the collapse default re-derives per task (see PlanDock).
            <PlanDock key={run.id} runId={run.id} entries={plan} />
          ) : null}

          {run.status === 'waiting' ? (
            <div
              data-slot="paused-hint"
              className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
            >
              <StatusDot tone="pending" pulse />
              The agent is paused, waiting for your reply
            </div>
          ) : null}

          <Composer
            onSubmit={(text, images) => sendMessage.mutateAsync({ text, images })}
            disabled={!sessionOpen}
            disabledReason="Session closed — Continue to reopen."
            disabledAction={<ContinueAction run={run} />}
            placeholder={
              run.status === 'waiting'
                ? 'Reply — / for skills, @ for files…'
                : 'Message the agent — / for skills, @ for files…'
            }
            autocompleteSkills
            quickReplies
            getMentionCandidates={() => threadFilePaths(thread)}
          />
        </div>
      </div>
    </div>
  )
}

/** The closed composer's way out (legacy "Session closed — Continue to reopen."): reopens the
 *  last agent session, exactly like the header's Continue — hidden when the run has no session
 *  to resume (the flags rule in run-actions.ts). */
function ContinueAction({ run }: { run: ApiRun }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => continueRun(run.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs.all }),
    onError: (error: Error) => toast(error.message, { tone: 'danger' }),
  })
  if (!runActionFlags(run).continueRun) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <PlayIcon aria-hidden="true" className="size-3.5" />
      Continue
    </Button>
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
