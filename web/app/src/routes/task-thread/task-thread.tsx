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
  ImageItem,
  NoteLine,
  ReasoningLine,
  ToolItemRow,
  UserBubble,
} from './thread-items'
import { ThreadLoading } from './thread-loading'
import { reduceThread, threadFooter, type ThreadEntry, type ThreadState } from './thread-state'

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

  return (
    <div data-route="task-thread" className="flex min-h-full flex-col">
      {/* Slim interim header — Step 1.4 replaces it with the full run header (meta, tabs,
          action bar). Title + status only, so the footer state below has its context. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-3">
          <h1 className="min-w-0 truncate text-[15px] font-semibold">{runTitle(run)}</h1>
          <Pill dot={attention.tone} pulse={attention.pulse} className="ml-auto shrink-0">
            {attention.label}
          </Pill>
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
            {turn.items.map((entry) => (
              <ThreadEntryView key={entry.id} entry={entry} />
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
    </div>
  )
}

/** One reducer entry → its block. Every tool item goes through `ToolItemRow` — the 1.2 seam. */
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
      return <ReasoningLine text={entry.text} />
    case 'tool':
      return <ToolItemRow item={entry} />
    case 'note':
      return <NoteLine note={entry} />
    case 'image':
      return <ImageItem image={entry} />
  }
}
