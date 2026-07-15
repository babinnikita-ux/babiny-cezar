import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckIcon,
  ChevronDownIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { createRun, putConfig, putUiState } from '@/api/client'
import { queryKeys, useHealth, useRepo, useSkills, useUiState, useWorkflows } from '@/api/queries'
import type { ImageInput, RepoResponse, Runner, Skill, WorkflowDef } from '@/api/types'
import { TwinkleBackdrop } from '@/components/centered-state'
import { Composer } from '@/components/composer/composer'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/components/ui/toaster'
import { isProjectSkill, orderSkills } from '@/lib/skills'
import { submitShortcutHint } from '@/lib/use-submit-shortcut'
import { cn } from '@/lib/utils'

import { clearDraftText, readDraft, writeDraft, type NewTaskDraft } from './new-task-draft'
import {
  availableRunners,
  buildCreateRunBody,
  modelsForRunner,
  resolveModel,
  resolveRunner,
  resolveSource,
  startedRunPath,
  RUNNERS,
  type TaskSource,
} from './new-task-form'
import { parseNewTaskParams } from './new-task-params'

/**
 * `/new` — the full-screen new-task hero (spec §"New task (full-screen, #386)"; visual
 * contract docs/mockups/new-task.html): centered composer card on the twinkle surface, the
 * picker pill row inside the card below the textarea, suggested-task ghost chips underneath.
 *
 * Still to come here: the live plan-first toggle + plan review overlay (Step 1.2 — the segment
 * below is the shell, honestly disabled), and `auto=1` bookmarklet auto-start (Step 1.3 — the
 * param is parsed and deliberately ignored; full document loads of /new stay pinned to the
 * legacy page until that step proves parity).
 */
export function NewTaskRoute() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const health = useHealth()
  const workflows = useWorkflows()
  const skills = useSkills()
  const repo = useRepo()
  const uiState = useUiState()

  // The draft survives navigation (module store); explicit deep-link params beat it — a
  // pasted `/new?skill=&ref=` link states intent, a leftover draft only remembers it.
  const [draft, setDraft] = useState<NewTaskDraft>(() => {
    const params = parseNewTaskParams(search)
    const stored = readDraft()
    return {
      ...stored,
      ...(params.ref !== '' ? { text: params.ref } : {}),
      ...(params.skill !== '' ? { source: { source: 'skill', ref: params.skill } as TaskSource } : {}),
    }
  })
  useEffect(() => {
    writeDraft(draft)
  }, [draft])
  const update = (patch: Partial<NewTaskDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  // ---- effective picker values (rules in new-task-form.ts, mirrored from legacy) -----------
  const skillList = orderSkills(skills.data ?? [])
  const workflowList = workflows.data?.workflows ?? []
  const sourcesReady =
    skills.data !== undefined && workflows.data !== undefined && !uiState.isPending
  const source = resolveSource([draft.source, uiState.data?.lastTask], skillList, workflowList)

  const runners = availableRunners(health.data?.checks ?? [])
  const runner = resolveRunner(draft.runner, runners, health.data?.defaultRunner ?? 'claude')
  const models = modelsForRunner(runner)
  const model = resolveModel(draft.model, runner)

  // Parallel variants need a worktree per variant, hence git (the server 409s without it).
  const hasGit = health.data === undefined || health.data.repo !== null
  const variants = hasGit ? draft.variants : 1

  const submit = async (text: string, images: ImageInput[]) => {
    if (!sourcesReady) {
      // Rejection restores the draft — nothing typed is lost to a race with the pickers.
      throw new Error('Still loading workflows and skills — try again in a second.')
    }
    const created = await createRun(
      buildCreateRunBody({
        task: text,
        source,
        model,
        runner,
        runnerCount: runners.length,
        variants,
        images,
      }),
    )
    // Remember what was actually run so the next visit preselects it (legacy
    // `saveLastTaskSource`) — fire-and-forget: a failed write only costs the convenience.
    void putUiState({ lastTask: source })
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.uiState }))
      .catch(() => {})
    clearDraftText()
    void queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
    navigate(startedRunPath(created))
  }

  return (
    <div
      data-route="new"
      className="relative isolate flex min-h-full flex-col items-center overflow-x-clip px-6 pt-[clamp(32px,7vh,84px)] pb-16 max-md:px-3.5 max-md:pt-7"
    >
      <TwinkleBackdrop />

      <div className="w-full max-w-[720px]">
        <header className="mb-6 text-center max-md:mb-4">
          <h1 className="text-lg font-semibold tracking-tight max-md:text-base">
            What should the agent work on?
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground max-md:text-xs">
            Runs in an isolated worktree — review everything before it lands.
          </p>
        </header>

        <Composer
          onSubmit={submit}
          value={draft.text}
          onValueChange={(text) => update({ text })}
          autoFocus
          placeholder="Describe a task for the agent — / for skills…"
          ariaLabel="Describe a task for the agent"
          sendAriaLabel="Start task"
          autocompleteSkills
          footerStart={
            <>
              <SourcePill
                source={source}
                ready={sourcesReady}
                skills={skillList}
                workflows={workflowList}
                onPick={(next) => update({ source: next })}
              />
              {runners.length > 1 ? (
                <RunnerPill runners={runners} value={runner} onPick={(next) => update({ runner: next, model: null })} />
              ) : null}
              <PickerPill
                slot="model-pill"
                ariaLabel="Model"
                label={models.find((m) => m.id === model)?.label ?? 'auto'}
                value={model}
                onPick={(next) => update({ model: next })}
                options={models.map((m) => ({ value: m.id, label: m.label, desc: m.desc }))}
              />
              <PickerPill
                slot="variants-pill"
                ariaLabel="Parallel variants"
                label={variants > 1 ? `×${variants} variants` : '×1'}
                value={String(variants)}
                onPick={(next) => update({ variants: Number(next) })}
                disabled={!hasGit}
                disabledHint="Parallel variants need a git repository — each variant runs in its own worktree."
                options={[
                  { value: '1', label: '×1', desc: 'One run' },
                  { value: '2', label: '×2 variants', desc: 'Two competing runs — pick the diff you keep' },
                  { value: '3', label: '×3 variants', desc: 'Three competing runs — pick the diff you keep' },
                ]}
              />
              {repo.data ? <BaseBranchPill repo={repo.data} /> : null}
            </>
          }
          footerEnd={
            <>
              <ModeSegment />
              <kbd
                aria-hidden="true"
                className="rounded-[5px] border border-b-2 border-border bg-card px-[5px] py-px font-mono text-[10.5px] font-medium text-muted-foreground"
              >
                {submitShortcutHint()}
              </kbd>
            </>
          }
        />

        <SuggestedChips onPick={(text) => update({ text })} />
      </div>
    </div>
  )
}

/** The mockup's `.chip`: a quiet bordered pill that darkens on hover. */
const chipClass =
  'inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-55'

const chevron = <ChevronDownIcon aria-hidden="true" className="size-2.5 shrink-0 text-soft-foreground" />

/**
 * The workflow/skill picker (#385's searchable cmdk dropdown, #377's project-first ordering):
 * ONE pill for both kinds of source. Groups follow the mockup — Project skills (bold), Global,
 * then Workflows.
 */
function SourcePill({
  source,
  ready,
  skills,
  workflows,
  onPick,
}: {
  source: TaskSource
  ready: boolean
  skills: readonly Skill[]
  workflows: readonly WorkflowDef[]
  onPick: (source: TaskSource) => void
}) {
  const [open, setOpen] = useState(false)
  const project = skills.filter(isProjectSkill)
  const global = skills.filter((skill) => !isProjectSkill(skill))
  const pick = (next: TaskSource) => {
    onPick(next)
    setOpen(false)
  }

  const skillItem = (skill: Skill, emphasized: boolean) => {
    const selected = source.source === 'skill' && source.ref === skill.name
    return (
      <CommandItem
        key={skill.path}
        // The path suffix keeps values unique when a project skill shadows a global one.
        value={`skill ${skill.name} ${skill.path}`}
        keywords={skill.description ? [skill.description] : undefined}
        data-slot="source-option"
        data-source-kind="skill"
        data-source-ref={skill.name}
        onSelect={() => pick({ source: 'skill', ref: skill.name })}
      >
        <span className={cn('shrink-0 font-mono text-xs', emphasized && 'font-semibold')}>
          {skill.name}
        </span>
        {skill.description ? (
          <span className="min-w-0 flex-1 truncate text-xs text-soft-foreground">
            {skill.description}
          </span>
        ) : null}
        {selected ? <CheckIcon aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-primary" /> : null}
      </CommandItem>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="source-pill"
          aria-label="Choose a skill or workflow"
          disabled={!ready}
          className={cn(chipClass, 'border-foreground/60 font-mono text-[11.5px] font-semibold text-foreground')}
        >
          {source.source === 'skill' ? (
            <SparklesIcon aria-hidden="true" className="size-3 shrink-0 text-violet" />
          ) : (
            <WorkflowIcon aria-hidden="true" className="size-3 shrink-0 text-violet" />
          )}
          <span className="max-w-44 truncate">{ready ? source.ref : '…'}</span>
          {chevron}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[336px] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandInput placeholder="search skills & workflows…" />
          <CommandList data-slot="source-menu" className="max-h-72">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {project.length > 0 ? (
              <CommandGroup heading="Project skills">
                {project.map((skill) => skillItem(skill, true))}
              </CommandGroup>
            ) : null}
            {global.length > 0 ? (
              <CommandGroup heading="Global">{global.map((skill) => skillItem(skill, false))}</CommandGroup>
            ) : null}
            {workflows.length > 0 ? (
              <CommandGroup heading="Workflows">
                {workflows.map((workflow) => {
                  const selected = source.source === 'workflow' && source.ref === workflow.name
                  return (
                    <CommandItem
                      key={workflow.name}
                      value={`workflow ${workflow.name}`}
                      keywords={workflow.description ? [workflow.description] : undefined}
                      data-slot="source-option"
                      data-source-kind="workflow"
                      data-source-ref={workflow.name}
                      onSelect={() => pick({ source: 'workflow', ref: workflow.name })}
                    >
                      <span className="shrink-0 font-mono text-xs">{workflow.name}</span>
                      {workflow.description ? (
                        <span className="min-w-0 flex-1 truncate text-xs text-soft-foreground">
                          {workflow.description}
                        </span>
                      ) : null}
                      {selected ? (
                        <CheckIcon aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-primary" />
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Runner choice — rendered only when the host offers more than one backend, so a claude-only
 *  machine keeps the simple form (legacy rule). */
function RunnerPill({
  runners,
  value,
  onPick,
}: {
  runners: readonly Runner[]
  value: Runner
  onPick: (runner: Runner) => void
}) {
  const options = RUNNERS.filter((r) => runners.includes(r.id))
  return (
    <PickerPill
      slot="runner-pill"
      ariaLabel="Runner"
      label={value}
      value={value}
      onPick={(next) => onPick(next as Runner)}
      options={options.map((r) => ({ value: r.id, label: r.label, desc: r.desc }))}
    />
  )
}

/** A generic single-choice pill (runner / model / variants): DropdownMenu radio semantics,
 *  two-line items (label + quiet description), disabled state carries its reason as `title`. */
function PickerPill({
  slot,
  ariaLabel,
  label,
  value,
  options,
  onPick,
  disabled = false,
  disabledHint,
}: {
  slot: string
  ariaLabel: string
  label: ReactNode
  value: string
  options: ReadonlyArray<{ value: string; label: string; desc?: string }>
  onPick: (value: string) => void
  disabled?: boolean
  disabledHint?: string
}) {
  const trigger = (
    <button
      type="button"
      data-slot={slot}
      aria-label={ariaLabel}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={chipClass}
    >
      {label}
      {chevron}
    </button>
  )
  // Radix never opens a disabled trigger, but `disabled:pointer-events-none` would also kill
  // the explanatory title tooltip — so the disabled pill renders bare, in a plain span wrapper
  // that still receives hover.
  if (disabled) {
    return (
      <span title={disabledHint} className="inline-flex">
        {trigger}
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid={`${slot}-menu`}>
        <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-[12.5px] font-medium">{option.label}</span>
                {option.desc ? (
                  <span className="text-[11.5px] text-muted-foreground">{option.desc}</span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Base-branch picker: worktrees fork from it and PRs target it. It is repo-level CONFIG
 *  (`PUT /api/config`, exactly the legacy Repo tab's picker), not a per-run flag — so it
 *  mutates the server and refetches, rather than living in the draft. Hidden without git. */
function BaseBranchPill({ repo }: { repo: RepoResponse }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (baseBranch: string | null) => putConfig({ baseBranch }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.repo })
      toast(
        result.baseBranch
          ? `New tasks will branch off "${result.baseBranch}" (PRs target it too).`
          : 'Base branch cleared — tasks follow the current checkout.',
      )
    },
    onError: (error: Error) => toast(error.message, { tone: 'danger' }),
  })
  if (!repo.info) return null
  const current = repo.baseBranch ?? repo.info.branch
  return (
    <PickerPill
      slot="base-pill"
      ariaLabel="Base branch"
      label={<span className="font-mono text-[11.5px]">base: {current}</span>}
      value={repo.baseBranch ?? ''}
      onPick={(value) => mutation.mutate(value === '' ? null : value)}
      options={[
        { value: '', label: `current checkout (${repo.info.branch})`, desc: 'Follow whatever is checked out' },
        ...repo.branches.map((branch) => ({ value: branch, label: branch })),
      ]}
    />
  )
}

/** The `Start | Plan first` segment (#383). Step 1.2 wires plan mode + the review overlay;
 *  until then the second segment is honestly disabled rather than silently doing "Start". */
function ModeSegment() {
  return (
    <div
      data-slot="mode-seg"
      role="radiogroup"
      aria-label="Run mode"
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-[3px]"
    >
      <button
        type="button"
        role="radio"
        aria-checked="true"
        className="h-6 rounded-md bg-card px-2 text-xs font-semibold text-foreground shadow-xs"
      >
        Start
      </button>
      <button
        type="button"
        role="radio"
        aria-checked="false"
        disabled
        title="Plan-first mode arrives with the plan review overlay — the next step of the redesign."
        className="h-6 rounded-md px-2 text-xs font-medium text-muted-foreground opacity-60"
      >
        Plan first
      </button>
    </div>
  )
}

/** Honest static starters (the mockup's ghost chips): they only fill the textarea — the user
 *  still aims and submits. */
const SUGGESTIONS = [
  'Fix a failing or flaky test',
  'Summarize recent commits on this branch',
  'Update the README for recent changes',
]

function SuggestedChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mt-7 flex flex-wrap justify-center gap-2 max-md:justify-start">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          data-slot="suggested-chip"
          onClick={() => onPick(suggestion)}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SparklesIcon aria-hidden="true" className="size-3 shrink-0 text-soft-foreground" />
          {suggestion}
        </button>
      ))}
    </div>
  )
}
