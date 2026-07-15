import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, RefreshCwIcon, SparklesIcon, TriangleAlertIcon, ZapIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { refreshSkills } from '@/api/client'
import { queryKeys, useLaunchKey, useSkills, useWorkflows } from '@/api/queries'
import type { Skill } from '@/api/types'
import { CenteredState } from '@/components/centered-state'
import { SkillDetailBody, SkillSourceTag } from '@/components/skill-detail'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { bookmarkletUrl } from '@/lib/bookmarklet'
import { filterSkills, isProjectSkill, orderSkills, skillUsedBy } from '@/lib/skills'
import { cn } from '@/lib/utils'

/**
 * Settings → Skills (R6 Step 1.4, spec §"Skills, Workflows, Inbox"): the legacy Skills tab
 * moved under Settings — catalog + detail + Refresh + the bookmarklet panel — with the two
 * standing feedback items built in:
 *
 *  - #377 project-first and bold: the list renders through `orderSkills`/`filterSkills`, the
 *    same pure module every picker uses;
 *  - #384 stable scroll/selection: selection lives in the URL (`?skill=<name>`), the rows are
 *    keyed React elements inside one persistent scroll container — a refresh re-renders rows
 *    in place instead of rebuilding the pane, so neither the selection nor the scroll
 *    position can be lost (the legacy innerHTML rebuild lost both).
 *
 * The pinned "Run from GitHub" entry (spec 011 — must not drown under a long team catalog)
 * opens the bookmarklet panel via the legacy `__bm` sentinel in the same query param.
 */

const BOOKMARKLETS = '__bm'

export function SkillsSection() {
  const skillsQuery = useSkills()
  const workflowsQuery = useWorkflows()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const queryClient = useQueryClient()

  const refresh = useMutation({
    mutationFn: () => refreshSkills(),
    onSuccess: (catalog) => {
      // The POST answers the merged catalog — seed the shared query instead of refetching.
      queryClient.setQueryData(queryKeys.skills, catalog)
      toast('Team skills refreshed.')
    },
    onError: (error) => toast(error.message, { tone: 'danger' }),
  })

  if (skillsQuery.isError) {
    return (
      <CenteredState
        icon={<TriangleAlertIcon />}
        tone="danger"
        heading="h2"
        title="Could not load skills"
        subtitle={skillsQuery.error.message}
      />
    )
  }

  const skills = orderSkills(skillsQuery.data ?? [])
  const param = searchParams.get('skill')
  // Explicit choice if it still exists, else the first skill, else the bookmarklet panel —
  // the legacy fallback rule. A vanished selection degrades, it never crashes.
  const selection =
    param === BOOKMARKLETS
      ? BOOKMARKLETS
      : param !== null && skills.some((skill) => skill.name === param)
        ? param
        : (skills[0]?.name ?? BOOKMARKLETS)
  const selected = skills.find((skill) => skill.name === selection) ?? null
  const shown = filterSkills(skills, query)

  return (
    <div data-slot="skills-section" className="flex min-h-full flex-1 items-stretch">
      {/* List pane. Below md it IS the page until a selection is in the URL — the GitHub
          tab's two-surfaces-one-URL rule. */}
      <section
        data-slot="skills-list"
        className={cn(
          'w-full flex-col border-border md:flex md:w-[320px] md:shrink-0 md:border-r',
          // Pin the pane below the shell's sticky h-14 header so the ROWS scroll inside it
          // (the #384 stable-scroll surface) — `var(--spacing)*14` tracks the density token.
          'md:sticky md:top-14 md:max-h-[calc(100dvh-(var(--spacing)*14))]',
          param === null ? 'flex' : 'hidden md:flex',
        )}
      >
        <div className="flex shrink-0 items-center gap-2 p-3 pb-2">
          <Input
            data-slot="skills-filter"
            placeholder="Filter skills…"
            aria-label="Filter skills"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 text-[13px]"
          />
          <button
            type="button"
            data-slot="skills-refresh"
            title="git fetch the team skills repos"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-55"
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={cn('size-3', refresh.isPending && 'motion-safe:animate-spin')}
            />
            Refresh
          </button>
        </div>

        <ul data-slot="skill-rows" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {skillsQuery.isPending ? (
            <li className="px-2.5 py-2 text-[13px] text-soft-foreground">Loading…</li>
          ) : shown.length > 0 ? (
            shown.map((skill) => <SkillRow key={skill.path} skill={skill} active={selection === skill.name} />)
          ) : (
            <li className="px-2.5 py-2 text-xs leading-relaxed text-soft-foreground">
              {skills.length > 0 ? (
                '(no skills match)'
              ) : (
                <>
                  No skills yet. Drop Markdown files into <span className="font-mono">.ai/skills/</span> or{' '}
                  <span className="font-mono">.ai/cezar/skills/</span> — optional frontmatter:{' '}
                  <span className="font-mono">name</span>, <span className="font-mono">description</span>. Team
                  skills from your skills repo appear here too — try Refresh.
                </>
              )}
            </li>
          )}
        </ul>

        {/* Always visible below the scrollable rows — spec 011's pinned entry. */}
        <div className="shrink-0 border-t border-border p-2">
          <Link
            to={`/settings/skills?skill=${BOOKMARKLETS}`}
            data-slot="bookmarklets-row"
            aria-current={selection === BOOKMARKLETS ? 'page' : undefined}
            className={cn(
              'flex flex-col gap-0.5 rounded-md px-2.5 py-2 transition-colors hover:bg-muted',
              selection === BOOKMARKLETS && 'bg-muted',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ZapIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 truncate text-[13px] font-medium">Run from GitHub</span>
              <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-px font-mono text-[10.5px] text-soft-foreground">
                bookmarklets
              </span>
            </span>
            <span className="pl-[22px] text-xs text-soft-foreground">
              One-click skill launch from any GitHub PR or issue.
            </span>
          </Link>
        </div>
      </section>

      {/* Detail pane. Hidden below md until the URL carries a selection. */}
      <section
        data-slot="skills-detail"
        className={cn('min-w-0 flex-1 flex-col', param === null ? 'hidden md:flex' : 'flex')}
      >
        <div className="min-w-0 flex-1 px-4 py-4 md:px-7 md:py-5">
          <Link
            to="/settings/skills"
            data-slot="skills-back"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground md:hidden"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            Back to the list
          </Link>

          {selection === BOOKMARKLETS ? (
            <BookmarkletPanel skills={skills} />
          ) : selected ? (
            <SkillDetailBody
              skill={selected}
              usedBy={skillUsedBy(workflowsQuery.data?.workflows ?? [], selected.name)}
            />
          ) : skillsQuery.isPending ? null : (
            <CenteredState
              icon={<SparklesIcon />}
              tone="neutral"
              heading="h2"
              title="No skill selected"
              subtitle="Pick a skill from the catalog."
            />
          )}
        </div>
      </section>
    </div>
  )
}

function SkillRow({ skill, active }: { skill: Skill; active: boolean }) {
  const project = isProjectSkill(skill)
  return (
    <li>
      <Link
        to={`/settings/skills?skill=${encodeURIComponent(skill.name)}`}
        data-slot="skill-row"
        data-skill={skill.name}
        data-project={project ? 'true' : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-col gap-0.5 rounded-md px-2.5 py-2 transition-colors hover:bg-muted',
          active && 'bg-muted',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <SparklesIcon
            aria-hidden="true"
            className={cn('size-3.5 shrink-0', project ? 'text-violet' : 'text-soft-foreground')}
          />
          {/* Project skills read bold (#377) — the visual half of the ordering rule. */}
          <span
            className={cn(
              'min-w-0 truncate font-mono text-[13px]',
              project ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
            )}
          >
            {skill.name}
          </span>
          <SkillSourceTag source={skill.source} className="ml-auto" />
        </span>
        {skill.description ? (
          <span className="line-clamp-2 pl-[22px] text-xs text-soft-foreground">{skill.description}</span>
        ) : null}
      </Link>
    </li>
  )
}

/**
 * The bookmarklet generator panel (spec 011, ported from the legacy cockpit): draggable
 * `javascript:` links against the protected `/new?skill=&key=` contract (`lib/bookmarklet`).
 * A failed key fetch degrades exactly like legacy — the links still generate, auto-start
 * just will not arm.
 */
function BookmarkletPanel({ skills }: { skills: readonly Skill[] }) {
  const launchKey = useLaunchKey()
  const [auto, setAuto] = useState(false)
  const [filter, setFilter] = useState('')
  const key = launchKey.data?.key ?? ''
  const needle = filter.trim().toLowerCase()
  const shown = skills.filter((skill) => skill.name.toLowerCase().includes(needle))

  return (
    <div data-slot="bookmarklet-panel" className="mx-auto w-full max-w-2xl">
      <h2 className="text-base font-semibold">Run from GitHub</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Drag a button below to your browser&apos;s bookmarks bar. On any GitHub PR or issue, click it —
        it finds your running cockpit on localhost (ports 4321–4330) and picks the one serving that
        repo. The cockpit must be running: <span className="font-mono">npx cezar</span>.
      </p>

      <label className="mt-4 flex items-center gap-2 text-[13px] font-medium">
        <input
          type="checkbox"
          data-slot="bm-auto"
          checked={auto}
          onChange={(event) => setAuto(event.target.checked)}
          className="size-3.5"
        />
        One-click launch (auto-submit){' '}
        <span className="font-normal text-soft-foreground">— re-drag the buttons after changing this</span>
      </label>

      <div data-slot="bm-generic" className="mt-4">
        {/* Generic launcher: no skill, auto forced off — it only prefills the form. */}
        <BookmarkletRow
          label="cezar: this PR/issue"
          url={bookmarkletUrl('', false, key)}
          hint="prefills the form — nothing starts by itself"
        />
      </div>

      <Input
        data-slot="bm-filter"
        placeholder="Filter skills…"
        aria-label="Filter bookmarklet skills"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="mt-5 h-8 text-[13px]"
      />
      <div data-slot="bm-list" className="mt-3 flex flex-col gap-2">
        {shown.length > 0 ? (
          shown.map((skill) => (
            <BookmarkletRow
              key={skill.path}
              label={`/${skill.name}`}
              url={bookmarkletUrl(skill.name, auto, key)}
              hint={skill.source}
            />
          ))
        ) : (
          <p className="text-xs text-soft-foreground">
            {skills.length > 0
              ? '(no skills match)'
              : '(no skills yet — the generic launcher above still works)'}
          </p>
        )}
      </div>
    </div>
  )
}

function BookmarkletRow({ label, url, hint }: { label: string; url: string; hint?: string }) {
  // React (rightly) refuses `javascript:` hrefs at render time — but a bookmarklet IS one by
  // definition, and dragging to the bookmarks bar needs the real href on the DOM node. The
  // link is a drag source only (the click handler below never lets it execute), so setting
  // the attribute imperatively is the honest escape hatch.
  const anchor = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    anchor.current?.setAttribute('href', url)
  }, [url])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Bookmarklet URL copied.')
    } catch {
      toast('Copy failed — drag the button instead.', { tone: 'danger' })
    }
  }
  return (
    <div data-slot="bm-row" className="flex min-w-0 items-center gap-2.5">
      {/* A drag SOURCE only — the cockpit page never executes the javascript: URL itself
          (spec 011 §5), so a plain click just explains the gesture. */}
      <a
        ref={anchor}
        draggable
        data-slot="bm-link"
        title="Drag me to your bookmarks bar"
        onClick={(event) => {
          event.preventDefault()
          toast('Drag me to your bookmarks bar')
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
      >
        <ZapIcon aria-hidden="true" className="size-3 text-primary" />
        {label}
      </a>
      <button
        type="button"
        data-slot="bm-copy"
        title="Copy the bookmarklet URL"
        onClick={() => void copy()}
        className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Copy
      </button>
      {hint ? <span className="min-w-0 truncate text-[11px] text-soft-foreground">{hint}</span> : null}
    </div>
  )
}
