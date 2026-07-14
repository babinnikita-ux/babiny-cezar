import { MoonIcon, PlusIcon } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router'

import { useRuns, useSkills } from '@/api/queries'
import type { RunRecord, Skill } from '@/api/types'
import { NAV_ITEMS } from '@/components/nav-items'
import { StatusDot } from '@/components/status-dot'
import { NEXT_THEME } from '@/components/theme-toggle'
import { useTheme } from '@/components/theme-provider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { deriveAttention } from '@/lib/attention'
import { shortAge } from '@/lib/format'
import { useCommandShortcut } from '@/lib/use-command-shortcut'

/**
 * The ⌘K command palette (spec, "Cross-cutting"): tasks, views, actions, skills — everything,
 * one keystroke from anywhere.
 *
 * Opened by ⌘K *and* Ctrl+K (the shared `useCommandShortcut` registers both together), by the
 * sidebar footer's hint, or programmatically via `openCommandPalette()`. Escape and selecting
 * anything close it.
 */

/** The programmatic-open seam: a window event rather than a context, so chrome that must stay
 *  presentational (the sidebar hint today, an onboarding nudge tomorrow) can open the palette
 *  without threading a setter through the tree. */
export const OPEN_COMMAND_PALETTE_EVENT = 'cezar:open-command-palette'

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
}

export type DocumentNavigate = (href: string) => void

/** R1's /new destination still belongs to the legacy document. Keeping this injectable makes
 *  the hard-navigation contract testable without asking jsdom to implement page loads. */
const navigateDocument: DocumentNavigate = (href) => window.location.assign(href)

/** Project skills first, global/team after — the #377 ordering rule, matching the server's
 *  `Skill.source` values (`src/skills.ts`): `ai`/`cezar`/`agents` live in the repo, `global`
 *  and `team` come from outside it. The sort is stable, so within each half the server's own
 *  order (its directory precedence) is preserved. */
const PROJECT_SKILL_SOURCES: ReadonlySet<Skill['source']> = new Set(['ai', 'cezar', 'agents'])

export function orderSkills(skills: readonly Skill[]): Skill[] {
  return [...skills].sort(
    (a, b) =>
      Number(!PROJECT_SKILL_SOURCES.has(a.source)) - Number(!PROJECT_SKILL_SOURCES.has(b.source))
  )
}

/** Newest first — the palette's unfiltered Tasks group should lead with what you touched last,
 *  exactly like the sidebar. Stable for equal timestamps (variant groups started together). */
export function orderRuns(runs: readonly RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function CommandPalette({
  onDocumentNavigate = navigateDocument,
}: {
  onDocumentNavigate?: DocumentNavigate
} = {}) {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()

  useCommandShortcut('k', () => setOpen((current) => !current))
  // The sidebar CTA's decorative ⌘N hint becomes real here: new task from anywhere.
  useCommandShortcut('n', () => {
    setOpen(false)
    onDocumentNavigate('/new')
  })

  React.useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
  }, [])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search tasks, views, actions, and skills"
      showCloseButton={false}
    >
      {/* The body mounts only while the dialog is open (Radix portals nothing when closed), so
          its queries — notably the skills fetch — run on first open, never on app boot. */}
      <PaletteContent close={() => setOpen(false)} onDocumentNavigate={onDocumentNavigate} />
    </CommandDialog>
  )
}

function PaletteContent({
  close,
  onDocumentNavigate,
}: {
  close: () => void
  onDocumentNavigate: DocumentNavigate
}) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  // Runs are already cached by the sidebar's quick-list; skills fetch here, on first open.
  const runs = useRuns()
  const skills = useSkills()
  const now = Date.now()

  const orderedRuns = React.useMemo(() => orderRuns(runs.data ?? []), [runs.data])
  const orderedSkills = React.useMemo(() => orderSkills(skills.data ?? []), [skills.data])

  const go = (to: string) => {
    close()
    navigate(to)
  }
  const goToComposer = (to: string) => {
    close()
    onDocumentNavigate(to)
  }
  const nextTheme = NEXT_THEME[theme]

  return (
    <>
      <CommandInput placeholder="Search tasks, views, actions, skills…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>

        <CommandGroup heading="Views">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.to}
                // The `view` prefix keeps values unique across groups and gives "view git" a
                // deterministic hit; the value is filter fodder, never rendered.
                value={`view ${item.label}`}
                data-slot="palette-view"
                data-nav-to={item.to}
                onSelect={() => go(item.to)}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </CommandItem>
            )
          })}
          <CommandItem
            value="view new task"
            data-slot="palette-view"
            data-nav-to="/new"
            onSelect={() => goToComposer('/new')}
          >
            <PlusIcon aria-hidden="true" />
            New task
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {orderedRuns.length > 0 ? (
          <CommandGroup heading="Tasks">
            {orderedRuns.map((run) => {
              const attention = deriveAttention(run)
              return (
                <CommandItem
                  key={run.id}
                  // The id keeps duplicate titles apart; it also lets a pasted run id find its task.
                  value={`task ${run.title} ${run.id}`}
                  data-slot="palette-task"
                  data-run-id={run.id}
                  onSelect={() => go(`/tasks/${run.id}`)}
                >
                  <StatusDot tone={attention.tone} pulse={attention.pulse} aria-label={attention.label} role="img" />
                  <span className="min-w-0 flex-1 truncate">{run.title}</span>
                  <span className="shrink-0 text-xs text-soft-foreground tabular-nums">
                    {shortAge(run.finishedAt ?? run.createdAt, now)}
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Actions">
          <CommandItem
            value="action toggle theme"
            data-slot="palette-action"
            data-action="toggle-theme"
            onSelect={() => {
              setTheme(nextTheme)
              close()
            }}
          >
            <MoonIcon aria-hidden="true" />
            Toggle theme
            <CommandShortcut className="tracking-normal">
              {theme} → {nextTheme}
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="action new task"
            data-slot="palette-action"
            data-action="new-task"
            onSelect={() => goToComposer('/new')}
          >
            <PlusIcon aria-hidden="true" />
            New task
          </CommandItem>
        </CommandGroup>

        {orderedSkills.length > 0 ? (
          <CommandGroup heading="Skills">
            {orderedSkills.map((skill) => (
              <CommandItem
                key={skill.path}
                // The path suffix keeps values unique when a project skill shadows a global
                // one of the same name — both stay selectable.
                value={`skill ${skill.name} ${skill.path}`}
                keywords={skill.description ? [skill.description] : undefined}
                data-slot="palette-skill"
                data-skill={skill.name}
                onSelect={() => goToComposer(`/new?skill=${encodeURIComponent(skill.name)}`)}
              >
                <span className="shrink-0 font-medium">{skill.name}</span>
                {skill.description ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-soft-foreground">{skill.description}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </>
  )
}
