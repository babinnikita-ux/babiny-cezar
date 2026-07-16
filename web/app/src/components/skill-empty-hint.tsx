/**
 * The "no skills yet" copy shared by every empty state that tells a user where to drop skill
 * files — the Skills tab (`routes/skills.tsx`) and the workflow builder's skill palette
 * (`routes/workflows/workflows.tsx`). #374 (follow-up to #342): both used to mention only
 * `.ai/skills/`, while discovery also scans `.ai/cezar/skills/`, `.agents/skills/` (+ its
 * per-agent mirrors, e.g. `.claude/skills/`), the global `~/.agents/skills` /
 * `~/.claude/skills`, and the team skills repo (`src/skills.ts`). One shared list, so the two
 * surfaces can never drift apart again.
 */

/** Local project directories, in the server's precedence order (`src/skills.ts`'s SKILL_DIRS,
 *  agent mirrors folded into one mention). */
const SKILL_PROJECT_DIRS = ['.ai/cezar/skills/', '.ai/skills/', '.agents/skills/'] as const

function Path({ children }: { children: string }) {
  return <span className="font-mono">{children}</span>
}

/** Renders `SKILL_PROJECT_DIRS` as "a, b, or c" with each entry in `<Path>`. */
function ProjectDirList() {
  return (
    <>
      {SKILL_PROJECT_DIRS.map((dir, index) => (
        <span key={dir}>
          {index > 0 ? (index === SKILL_PROJECT_DIRS.length - 1 ? ', or ' : ', ') : ''}
          <Path>{dir}</Path>
        </span>
      ))}
    </>
  )
}

/** Full copy — the Skills tab's empty list (room for the frontmatter aside + a Refresh hint). */
export function SkillEmptyHint() {
  return (
    <>
      No skills yet. Drop Markdown files into <ProjectDirList /> (agent mirrors like{' '}
      <Path>.claude/skills/</Path> work too) — optional frontmatter: <Path>name</Path>,{' '}
      <Path>description</Path>. Global (<Path>~/.agents/skills</Path>) and team-repo skills
      appear here too — try Refresh.
    </>
  )
}

/** Compact copy — the workflow builder's skill palette, where space is tighter and there is no
 *  Refresh action on the surface itself. */
export function SkillEmptyHintCompact() {
  return (
    <>
      No skills yet — drop Markdown files into <ProjectDirList /> (or a global/team-repo skill
      source).
    </>
  )
}
