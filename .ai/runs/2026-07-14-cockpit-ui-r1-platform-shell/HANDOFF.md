# Handoff — Cockpit UI redesign, Phase R1 (Platform + shell)

_A fresh agent should be able to resume in under 30 seconds from this file._

## State (checkpoint 2 — 2026-07-14)

- **Phases 1 (Platform) and 2 (Shell) are complete** — Steps 1.1–1.6 and 2.1–2.4 landed (`4f3bf43`..`807805e`).
- **Remaining in R1: 7 Steps** — Phase 3 (3.1–3.4: data layer + task list/table) and Phase 4 (4.1–4.4: chrome).
- Branch `feat/cockpit-ui-r1-platform-shell`; **draft PR #396** (kept open deliberately so the user can watch; `Status: in-progress`; lock held: assignee + `in-progress` label).
- Everything green: `npm run typecheck` · `npm test` **246/246** · `npm run build` · `npm run test:e2e` **14/14** (real Chrome via agent-browser).

## Next concrete action

Step **3.1 — Typed API client for /api/\*** (first `todo` row in `PLAN.md`'s Tasks table). Then 3.2 SSE hooks, 3.3 quick-list, 3.4 tasks table; then Phase 4 (4.1 CenteredState, 4.2 Tools dropdown, 4.3 ⌘K palette, 4.4 design-guardian).

## How to resume

```
om-auto-continue-pr-loop 396
```
It reads `PLAN.md`'s Tasks table; the first non-`done` row is the resume point. The worktree may be gone — recreate one off the branch. Executors get their brief from `/tmp/.../scratchpad/EXECUTOR-CONTEXT.md` (recreate it from this file if the scratchpad is gone: it carries the worktree path, the reference material, and the hard rules below).

## What exists now

- **`web/app/`** — Vite + React 19 + TS (root `web/app`, builds to `web/dist`). Tailwind v4 CSS-first; Mercato tokens in `web/app/src/styles/index.css` (**the only place raw hex is allowed**); self-hosted Inter + JetBrains Mono; 19 shadcn/ui primitives (new-york) in `components/ui/`; `status-dot.tsx`, `pill.tsx`, `theme-provider.tsx`, `theme-toggle.tsx`, `app-shell.tsx`, `nav-items.ts`, `icons.tsx`; `cn()` in `lib/utils.ts`; `lib/theme.ts` (pure theme rules); `routes.tsx` (all 17 spec routes, placeholders).
- **`src/server/`** — `static-ui.ts` holds the pure resolvers (`resolveIndexHtml`, `resolveGetRequest`); `server.ts` serves `web/dist` (`/assets/*` immutable), falls back to the legacy UI when unbuilt (+ one-line hint), honors `?legacy=1`, and has the SPA catch-all registered **last** so deep links cold-load.
- **Testing** — vitest workspace: `server` project (node, `src/**/*.test.ts`, NodeNext `.js` imports) + `web` project (jsdom, `web/app/src/**/*.test.{ts,tsx}`, `@` alias). `npm test` is in the validation gate.
- **E2E / UI verification** — `npm run test:e2e` boots via `.ai/scripts/test-env-up.sh` (idempotent, reuses a healthy instance, `CEZ_DRY_RUN=1`, writes `.ai/qa/test-env.json`) and drives **agent-browser** through the seam at `web/app/e2e/agent-browser.ts` (wrappers: `open`, `snapshot`, `get`, `is`, `eval`, `screenshot`, `close`, `waitForFunction`, `count`, `tapAt`, `click`). Screenshots land in `.ai/qa/artifacts_e2e/` (gitignored) and are copied into `checkpoint-N-artifacts/` at checkpoints.

## Rules a resuming agent MUST keep

- **One Step = one commit.** Flip that Step's `Status` → `done` in the same commit; leave `Commit` as `pending` — the dispatcher backfills real SHAs at checkpoints (a commit cannot contain its own SHA).
- **Tests are mandatory per Step.** UI-touching Steps must extend `web/app/e2e/` **through the agent-browser seam** (never a browser library directly) and the suite must pass at the checkpoint. Checkpoint every ~5 Steps: targeted validation + e2e + screenshots → `checkpoint-N-checks.md`, rewrite this file, append `NOTIFY.md`, one commit, push.
- **No raw hex outside `styles/index.css`** (Step 4.4 adds the design-guardian test that enforces it).
- `npx cezar-cli` must stay **zero-config and no-build** for users — all new deps are `devDependencies`; the tarball ships built assets.
- **The legacy vanilla UI must keep working** (`?legacy=1`) until phase R7.
- Never `--no-verify`, never force-push, never fake a passing check.

## Gotchas learned the hard way (do not re-discover)

- jsdom here has **no `window.matchMedia`** → use `vi.stubGlobal`, not `vi.spyOn`.
- Radix dialogs never set `aria-modal`; they `aria-hidden` everything outside. Assert real modality.
- `tailwind-merge` doesn't know our custom scales — `cn()` is extended for `shadow-modal`.
- Tailwind v4: `@theme inline` self-references break for radius/shadow (their names are Tailwind namespace keys) → those live in `@theme static`. `rounded-3xl`/`shadow-2xl`/`rounded-xs` **do not exist**; default control radius 10px = `rounded-md`.
- Never use the `dark:` variant — it keys off `prefers-color-scheme`, but our theme flips on `.light`.
- The e2e drawer slides for 500ms and is "visible" while still off-screen → always `waitForFunction`.
- `npm run typecheck` uses `tsconfig.test.json`; `tsconfig.json` (build) excludes tests so they never ship in `dist`.

## Known follow-ups (not blockers, carried into later steps)

- `typecheck:web` is **not** in the validation gate — recommend folding it in (Step 4.4 is a natural home).
- `/new` parses the bookmarklet params but **`auto=1` does not auto-start until R4** (R4 owns the composer + auto-start). Not publishable to npm before the real views land — do not cut a release from R1 alone.
- The drawer is not mockup-verified (mockups have no drawer). Light-theme active nav row is low-contrast *as the mockup specifies*. The dark `.seg` active segment (`#333`) still has no token.
- `DESKTOP_MEDIA_QUERY` duplicates Tailwind's `md`.

## After R1

Phases R2–R7 of `.ai/specs/2026-07-14-cockpit-ui-redesign.md` remain, each its own run/PR: R2 protocol v2 (+ all-backend golden fixtures), R3 thread, R4 new task + list, R5 git view + forge drivers, R6 remaining views + Settings, R7 legacy retirement + packaging flip. The spec's Implementation Plan lists the steps.
