/**
 * Promotes `open-mercato/skills` (#391) — cezar's built-in default skills source
 * (`DEFAULT_SKILLS_REPOS` in `src/config.ts`) that today only surfaces in `--help`. Pure
 * formatting, split out of `src/index.ts` so the CLI banner has one source of truth the web
 * cockpit copy (`web/app/src/components/skills-banner.tsx`) can be kept in step with, and so
 * it is testable without importing `index.ts` (which runs `main()` on import).
 *
 * Printed on every `serve` start — a few lines in an already-chatty startup block, the simpler
 * of the two options the issue raised, and consistent with the rest of that block (AGENTS.md's
 * "never trade a working default for a knob": no flag to turn this off, no state to dismiss it).
 */
export const SKILLS_BANNER_LINES: readonly string[] = [
  '  🤖 Make the most of parallel coding with our AI skills',
  "  open-mercato/skills: reusable, technology-agnostic agent skills for PR",
  '  creation, code review, CI stabilisation, spec writing & more.',
  "     npx skills add open-mercato/skills --skill '*'",
];
