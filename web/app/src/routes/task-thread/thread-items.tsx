import type { UiToolItem } from '@/protocol/ui-events'
import { cn } from '@/lib/utils'

import { Markdown } from './markdown'
import type { ThreadImage, ThreadNote } from './thread-state'

/**
 * The thread's per-entry building blocks (mockup: docs/mockups/thread.html). Presentational
 * only — everything they show comes from the reducer's output, nothing is derived here.
 */

/** Right-aligned muted bubble — a v1 `user-message` line or the run's initial task. */
export function UserBubble({ text, imageCount = 0 }: { text: string; imageCount?: number }) {
  return (
    <div
      data-slot="user-bubble"
      className="max-w-[78%] self-end rounded-2xl rounded-br-md bg-muted px-[15px] py-2.5 text-[13.5px] leading-[1.55] whitespace-pre-wrap md:max-w-[70%]"
    >
      {text}
      {imageCount > 0 ? (
        <span className="mt-1 block text-xs text-soft-foreground">
          {imageCount} image{imageCount > 1 ? 's' : ''} attached
        </span>
      ) : null}
    </div>
  )
}

/** An assistant message item, as markdown. */
export function AssistantMessage({ text }: { text: string }) {
  return (
    <div data-slot="assistant-message" className="min-w-0 text-[13.5px] leading-[1.6]">
      <Markdown>{text}</Markdown>
    </div>
  )
}

/** A dim (lifecycle/note) or danger (error) transcript line. */
export function NoteLine({ note }: { note: ThreadNote }) {
  return (
    <div
      data-slot="note-line"
      data-tone={note.tone}
      className={cn('px-0.5 text-xs', note.tone === 'danger' ? 'text-danger' : 'text-soft-foreground')}
    >
      {note.tone === 'danger' ? '✗ ' : '· '}
      {note.text}
    </div>
  )
}

/** Reasoning, folded to one dim line for now — Step 1.2 builds the expandable card. */
export function ReasoningLine({ text }: { text: string }) {
  const summary = text.split('\n', 1)[0] ?? ''
  return (
    <div data-slot="reasoning-line" className="px-0.5 text-xs text-soft-foreground italic">
      Thinking — {summary}
    </div>
  )
}

/**
 * PLAIN one-line tool row — deliberately minimal. Step 1.2 REPLACES this component with the
 * real collapsible tool cards (live output, diffs, exit codes); everything else in the thread
 * renders tool items only through this boundary, so 1.2 swaps one file.
 */
export function ToolItemRow({ item }: { item: UiToolItem }) {
  return (
    <div
      data-slot="tool-row"
      data-status={item.status}
      className="flex min-w-0 items-baseline gap-2 px-0.5 font-mono text-xs text-muted-foreground"
    >
      <span className="truncate">{item.title}</span>
      {item.status === 'running' ? (
        <span className="shrink-0 text-soft-foreground motion-safe:animate-pulse">…</span>
      ) : null}
      {item.status === 'failed' ? <span className="shrink-0 text-danger">failed</span> : null}
      {item.status === 'declined' ? <span className="shrink-0 text-soft-foreground">declined</span> : null}
    </div>
  )
}

/** A persisted run image (served by the cockpit itself — never an external origin). */
export function ImageItem({ image }: { image: ThreadImage }) {
  return (
    <img
      data-slot="thread-image"
      src={image.url}
      alt={image.name ?? 'image from the agent session'}
      loading="lazy"
      className="max-h-72 max-w-full self-start rounded-lg border border-border"
    />
  )
}
