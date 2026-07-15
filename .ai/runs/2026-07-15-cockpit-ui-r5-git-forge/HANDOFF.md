# Handoff — R5

## State

Run started; next Step 1.1. Same branch/PR #396. R4 complete (see `../2026-07-15-cockpit-ui-r4-new-task/HANDOFF.md` for carried gotchas — jsdom matchMedia stub, no `dark:` variant, Tailwind v4 theme quirks, agent-browser seam rules, SSE pagehide discipline).

Key anchors: server routes in `src/server/server.ts` (983 lines — new git/forge routes should extract into modules, not grow it); existing `src/server/{git,github,pr}.ts`; highlighter singleton `web/app/src/lib/highlighter.ts`; run detail routes under `web/app/src/routes/task-thread/`.
