import { MenuIcon, PlusIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { NAV_ITEMS, activeNavItem, activeNavPath } from '@/components/nav-items'
import { cn } from '@/lib/utils'

export type RepoChip = {
  name: string
  branch: string
}

export type AppShellProps = {
  /** The routed view. Renders into the one scrolling region. */
  children: ReactNode
  /** Repo + branch for the brand chip. Null until Step 3.1/3.2 wires `/api/health` — the chip
   *  is simply absent rather than showing an invented repo name. */
  repo?: RepoChip | null
  /** Inbox badge count. Null/0 renders no badge. Step 3.2 feeds it from the SSE stream. */
  inboxCount?: number | null
  /** cezar version for the footer chip. Null until Step 3.1 reads it from `/api/health`. */
  version?: string | null
  /** Step 3.3's grouped task quick-list. */
  taskQuickList?: ReactNode
  /** Step 4.2's Tools dropdown trigger. */
  toolsMenu?: ReactNode
  /** Step 2.4's mobile drawer opens from here. */
  onOpenMenu?: () => void
}

/**
 * The cockpit's app shell: a fixed sidebar plus a single scrolling main region.
 *
 * Layout contract (spec, "App shell & navigation"):
 *  - `h-dvh` (never `100vh` — that ignores mobile browser chrome and clips the composer).
 *  - The main column is a `auto 1fr auto` grid — top bar / scroller / composer dock. Rows are
 *    placed explicitly (`row-start-*`) so hiding the mobile bar at `md` leaves its row empty
 *    instead of promoting the scroller into the `auto` row and collapsing it.
 *  - `overflow-hidden` here and on `body` means the document never scrolls; only the main
 *    region does, with `overscroll-contain` so a thread at its end doesn't rubber-band the page.
 *  - Safe-area insets are the shell's job, not each view's: left/right on the root, top on the
 *    mobile bar, bottom on the composer row (which stays mounted, so the home indicator always
 *    has its gutter even before Step R4 puts a composer in it).
 */
export function AppShell({
  children,
  repo = null,
  inboxCount = null,
  version = null,
  taskQuickList,
  toolsMenu,
  onOpenMenu,
}: AppShellProps) {
  const { pathname } = useLocation()
  const activeTo = activeNavPath(pathname)
  const current = activeNavItem(pathname)

  return (
    <div
      data-slot="app-shell"
      className="flex h-dvh overflow-hidden bg-background text-foreground pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <Sidebar
        activeTo={activeTo}
        repo={repo}
        inboxCount={inboxCount}
        version={version}
        taskQuickList={taskQuickList}
        toolsMenu={toolsMenu}
      />

      <div className="grid min-w-0 flex-1 grid-rows-[auto_1fr_auto] overflow-hidden">
        <MobileTopBar title={current?.label ?? 'cezar'} onOpenMenu={onOpenMenu} />

        <main data-slot="main" className="row-start-2 min-h-0 overflow-y-auto overscroll-contain">
          {children}
        </main>

        {/* Row 3: the composer dock (thread reply, Step R3). Empty today, but it still carries the
            bottom safe-area gutter so the scroller never runs under the home indicator. */}
        <div
          data-slot="composer"
          className="row-start-3 pb-[env(safe-area-inset-bottom)]"
        />
      </div>
    </div>
  )
}

function Sidebar({
  activeTo,
  repo,
  inboxCount,
  version,
  taskQuickList,
  toolsMenu,
}: {
  activeTo: string | null
  repo: RepoChip | null
  inboxCount: number | null
  version: string | null
  taskQuickList?: ReactNode
  toolsMenu?: ReactNode
}) {
  return (
    <aside
      data-slot="sidebar"
      className="hidden w-[264px] shrink-0 flex-col border-r border-border bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:flex"
    >
      <div className="flex items-center gap-[9px] px-3.5 pt-3.5 pb-2.5">
        <BrandTile />
        <span className="text-[15px] font-semibold">cezar</span>
        {repo ? (
          <span
            data-slot="repo-chip"
            className="ml-auto truncate font-mono text-[11px] font-medium text-soft-foreground"
          >
            {repo.name} / {repo.branch}
          </span>
        ) : null}
      </div>

      <div className="px-2.5 pt-1 pb-2">
        <Button asChild variant="contrast" className="relative w-full justify-center">
          <Link to="/new">
            <PlusIcon className="size-[15px]" aria-hidden="true" />
            New task
            {/* Decorative: the ⌘N accelerator itself is registered in Step 4.3. */}
            <kbd
              aria-hidden="true"
              className="absolute right-2.5 rounded-[5px] border border-b-2 border-contrast-foreground/25 bg-transparent px-[5px] py-px font-mono text-[10.5px] font-medium text-contrast-foreground/60"
            >
              ⌘N
            </kbd>
          </Link>
        </Button>
      </div>

      <nav aria-label="Main" className="px-2.5 py-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.to === activeTo
          const Icon = item.icon
          // Link, not NavLink, on purpose. NavLink derives `aria-current` from its own prefix
          // match against `to`, and that rule is wrong here in both directions: it would light
          // Settings on /settings/skills, and would *not* light Tasks on /tasks/:id — which the
          // spec requires. `aria-current` cannot be forced past NavLink's own matching, so the
          // area rule lives in `activeNavPath` and this is a plain Link.
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-[34px] w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive && 'bg-muted font-semibold text-foreground'
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
              {item.badge && inboxCount ? (
                <span
                  data-slot="nav-badge"
                  className="ml-auto rounded-full bg-violet px-1.5 py-px text-[10.5px] font-semibold text-violet-foreground"
                >
                  {inboxCount}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {/* Step 3.3 renders the grouped quick-list (Needs you / Working / Recent) in here. */}
      <div
        data-slot="task-quick-list"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2"
      >
        {taskQuickList}
      </div>

      <div
        data-slot="sidebar-footer"
        className="flex flex-wrap items-center gap-2 gap-y-1.5 border-t border-border px-3.5 py-2.5"
      >
        {/* SLOT — Step 4.2 mounts the Tools dropdown (aggregate status dot + tool versions) here. */}
        <div data-slot="tools-menu">{toolsMenu}</div>
        {version ? (
          <span
            data-slot="version-chip"
            className="rounded-full border border-border px-1.5 py-px font-mono text-[10px] font-medium text-soft-foreground"
          >
            {version}
          </span>
        ) : null}
        <ThemeToggle className="ml-auto" />
      </div>
    </aside>
  )
}

/** The gradient brand mark. Dark glyph on the lime→yellow→violet gradient in both themes —
 *  `--primary-foreground` is the near-black the gradient is designed to carry. */
function BrandTile() {
  return (
    <span
      data-slot="brand-tile"
      aria-hidden="true"
      className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-[image:var(--grad)] text-[15px] font-bold text-primary-foreground"
    >
      ⚡
    </span>
  )
}

/** Mobile chrome (<md): the sidebar's replacement. The menu button is a prop callback —
 *  Step 2.4 owns the drawer it opens. */
function MobileTopBar({ title, onOpenMenu }: { title: string; onOpenMenu?: () => void }) {
  return (
    <header
      data-slot="mobile-top-bar"
      className="row-start-1 border-b border-border bg-card pt-[env(safe-area-inset-top)] md:hidden"
    >
      <div className="flex h-[52px] items-center gap-2.5 px-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          onClick={onOpenMenu}
          // 44px: the minimum touch target, overriding the 36px desktop icon-button size.
          className="-ml-1.5 size-11"
        >
          <MenuIcon className="size-[17px]" aria-hidden="true" />
        </Button>
        <span className="truncate text-[14.5px] font-semibold">{title}</span>
        {/* SLOT — the run status dot / kebab land with the thread view (Step R3). */}
        <div data-slot="mobile-status" className="ml-auto flex items-center gap-2" />
      </div>
    </header>
  )
}
