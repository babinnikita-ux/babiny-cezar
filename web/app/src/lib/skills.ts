import type { Skill } from '@/api/types'

/**
 * The shared skill presentation rules (#377/#380): the ⌘K palette, the composer's `/`
 * autocomplete, and (R4) the new-task skill picker must agree on what "project first" means
 * and how a typed query narrows the list — so the rules live here, not in any one surface.
 */

/** Project skills first, global/team after — the #377 ordering rule, matching the server's
 *  `Skill.source` values (`src/skills.ts`): `ai`/`cezar`/`agents` live in the repo, `global`
 *  and `team` come from outside it. */
const PROJECT_SKILL_SOURCES: ReadonlySet<Skill['source']> = new Set(['ai', 'cezar', 'agents'])

/** Project skills render emphasized (bold) wherever skills are listed. */
export function isProjectSkill(skill: Skill): boolean {
  return PROJECT_SKILL_SOURCES.has(skill.source)
}

/** The sort is stable, so within each half the server's own order (its directory precedence)
 *  is preserved. */
export function orderSkills(skills: readonly Skill[]): Skill[] {
  return [...skills].sort((a, b) => Number(!isProjectSkill(a)) - Number(!isProjectSkill(b)))
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

/** The `/` autocomplete's list for a typed query: ordered project-first, then filtered in
 *  place. Matches on the name and, as a fallback, the description ("review" should find
 *  `om-code-review` even when the name says less than the description does). */
export function filterSkills(skills: readonly Skill[], query: string): Skill[] {
  return orderSkills(skills).filter(
    (skill) => fuzzyMatch(skill.name, query) || fuzzyMatch(skill.description ?? '', query),
  )
}
