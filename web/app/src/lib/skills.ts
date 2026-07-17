import type { Skill, WorkflowDef } from '@/api/types'

/**
 * The shared skill presentation rules (#377/#380): the ⌘K palette, the composer's `/`
 * autocomplete, and (R4) the new-task skill picker must agree on what "project first" means
 * and how a typed query narrows the list — so the rules live here, not in any one surface.
 */

/** Project skills first, global/team after — the #377 ordering rule, matching the server's
 *  `Skill.source` values (`src/skills.ts`): `ai`/`cezar`/`agents` live in the repo, `global`
 *  and `team` come from outside it. */
const PROJECT_SKILL_SOURCES: ReadonlySet<Skill['source']> = new Set(['ai', 'cezar', 'agents'])

/** Project skills render emphasized (bold) wherever skills are listed. Accepts anything
 *  carrying a `source` so tag components need not conjure a whole Skill. */
export function isProjectSkill(skill: Pick<Skill, 'source'>): boolean {
  return PROJECT_SKILL_SOURCES.has(skill.source)
}

/** The sort is stable, so within each half the server's own order (its directory precedence)
 *  is preserved. */
export function orderSkills(skills: readonly Skill[]): Skill[] {
  return [...skills].sort((a, b) => Number(!isProjectSkill(a)) - Number(!isProjectSkill(b)))
}

/**
 * The composer picker's frequency sort (#408): locality first (project before global, the #377
 * rule), then MOST-SELECTED first within each half. `usage` is the ui-state `skillUsage` map
 * (name → times chosen, counted across BOTH composers — `/new`'s SourcePill and the GitHub tab's
 * follow-up `SkillsPicker`). The sort is stable, so ties — including "never selected", the
 * common case before any stats exist — keep the server's own directory order: the project-first
 * fallback (#2) falls out of stability for free, no separate branch needed. Shared by both
 * pickers so they can never drift into two different orders.
 */
export function orderSkillsByUsage(
  skills: readonly Skill[],
  usage: Readonly<Record<string, number>> | undefined,
): Skill[] {
  return [...skills].sort(
    (a, b) =>
      Number(!isProjectSkill(a)) - Number(!isProjectSkill(b)) ||
      usageCount(usage, b.name) - usageCount(usage, a.name),
  )
}

/** One skill's count out of the `skillUsage` map. `Object.hasOwn`, not a plain lookup: `usage`
 *  comes from `JSON.parse`, so it carries Object.prototype — a skill named `constructor` or
 *  `toString` would otherwise resolve to the INHERITED function, which `??` does not catch,
 *  turning the comparator into NaN and the bump into string garbage. */
function usageCount(usage: Readonly<Record<string, number>> | undefined, name: string): number {
  if (!usage || !Object.hasOwn(usage, name)) return 0
  const count = usage[name]
  return typeof count === 'number' ? count : 0
}

/** A pure reducer over the ui-state `skillUsage` map (#408): bump one skill's count by one. The
 *  server's `PUT /api/ui-state` merge is shallow (`uiStateSchema` passthrough), so a successful
 *  run start always sends the WHOLE updated map back, never just the one changed entry. */
export function bumpSkillUsage(
  usage: Readonly<Record<string, number>> | undefined,
  name: string,
): Record<string, number> {
  return { ...usage, [name]: usageCount(usage, name) + 1 }
}

/**
 * Does `query` fuzzy-match `candidate`? Case-insensitive subsequence — `omfx` finds
 * `om-fix-issue` — the same permissiveness cmdk gives the palette, minus its score-reordering:
 * the composer autocomplete filters WITHOUT re-sorting, so the project-first order above
 * survives any query (a deliberate difference from the palette, where cmdk may interleave).
 */
export function fuzzyMatch(candidate: string, query: string): boolean {
  if (query === '') return true
  const haystack = candidate.toLowerCase()
  const needle = query.toLowerCase()
  let at = 0
  for (const char of needle) {
    at = haystack.indexOf(char, at)
    if (at === -1) return false
    at += 1
  }
  return true
}

/** Workflows referencing a skill, as "workflow › step" breadcrumbs — the skill detail's
 *  "Used by" list (legacy `skillUsedBy`, ported). Steps fall back to their id when unnamed. */
export function skillUsedBy(workflows: readonly WorkflowDef[], name: string): string[] {
  const out: string[] = []
  for (const workflow of workflows) {
    for (const step of workflow.steps ?? []) {
      if (step.skill === name) out.push(`${workflow.name} › ${step.name ?? step.id}`)
    }
  }
  return out
}

/**
 * Multi-word filter for cmdk `<Command filter={…}>`: splits the typed query on whitespace
 * and requires every word to appear as a case-insensitive substring in the combined
 * value + keywords text.  "auto review" finds "om-auto-review-pr", "verify ui" finds
 * "om-auto-verify-ui".  Returns a 0–1 score (0 = no match) so cmdk hides non-matches
 * and ranks the rest by coverage.
 */
export function multiWordFilter(value: string, search: string, keywords?: string[]): number {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  const haystack = [value, ...(keywords ?? [])].join(' ').toLowerCase()
  if (!words.every((word) => haystack.includes(word))) return 0
  const matched = words.reduce((sum, w) => sum + w.length, 0)
  return 0.5 + Math.min(matched / haystack.length, 0.5)
}

/** Split a skill/workflow name on hyphens so each part is independently searchable as a
 *  cmdk keyword — keeps the description keyword too. */
export function skillKeywords(name: string, description?: string | null): string[] {
  const parts = name.split('-').filter(Boolean)
  return description ? [...parts, description] : parts
}

/** The `/` autocomplete's list for a typed query: ordered project-first, then filtered in
 *  place. Matches on the name and, as a fallback, the description ("review" should find
 *  `om-code-review` even when the name says less than the description does). */
export function filterSkills(skills: readonly Skill[], query: string): Skill[] {
  return orderSkills(skills).filter(
    (skill) => fuzzyMatch(skill.name, query) || fuzzyMatch(skill.description ?? '', query),
  )
}
