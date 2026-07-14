# Handoff — Cockpit UI redesign, Phase R1 (Platform + shell)

_Rewritten at every checkpoint and at run end. A fresh agent should be able to resume in under 30 seconds._

## State (checkpoint 1)

- **Phase 1 (Platform) is complete** — Steps 1.1–1.6 landed, `4f3bf43`..`03b58d0`.
- Branch `feat/cockpit-ui-r1-platform-shell`, **draft PR #396** (kept open deliberately so the user can watch; `Status: in-progress`).
- Gate green: `npm run typecheck` · `npm test` (72/72) · `npm run build`. E2E green: `npm run test:e2e` (2/2) through the **agent-browser** provider.

## Next concrete action

Step **2.1 — react-router route map + server SPA catch-all** (first `todo` row in `PLAN.md`'s Tasks table). Then 2.2 theme, 2.3 shell, 2.4 mobile drawer; then Phase 3 (data) and Phase 4 (chrome).

## What exists now

- `web/app/` — Vite + React 19 + TS app (root `web/app`, builds to `web/dist`). Tailwind v4 CSS-first; Mercato tokens in `web/app/src/styles/index.css` (**the only place raw hex is allowed**); self-hosted Inter + JetBrains Mono; 19 shadcn/ui primitives (new-york) in `components/ui/` + `status-dot.tsx`/`pill.tsx`; `cn()` in `lib/utils.ts`.
- `src/server/server.ts` + `static-ui.ts` — `/` serves `web/dist` when built, else the legacy UI (+ one-line hint); `?legacy=1` always forces legacy; `/assets/*` immutable-cached. **No SPA catch-all yet — that is Step 2.1.**
- Testing: vitest workspace (`server` project = node, `web` project = jsdom) → `npm test`, in the validation gate. E2E: `npm run test:e2e` boots via `.ai/scripts/test-env-up.sh` (idempotent, `CEZ_DRY_RUN=1`, writes `.ai/qa/test-env.json`) and drives the **agent-browser** provider through `web/app/e2e/agent-browser.ts`.

## Rules a resuming agent must keep

- One Step = one commit; flip the Step's `Status` → `done` in that same commit; leave `Commit` as `pending` (the dispatcher backfills SHAs at checkpoints — a commit cannot contain its own SHA).
- Tests mandatory per Step. UI-touching Steps must extend `web/app/e2e/` through the agent-browser seam (never a browser library directly) and the suite must pass at the checkpoint.
- No raw hex outside `styles/index.css`. `npx cezar-cli` must stay zero-config and no-build for users (all new deps are devDependencies).
- Legacy vanilla UI must keep working until phase R7.

## Known follow-ups (not blockers)

- `typecheck:web` is not in the validation gate — decide whether to fold it in.
- `/new` still serves the legacy page; Step 2.1 owns the move + preserving the bookmarklet `?skill=…&auto=…&key=…` contract.
- E2E assertions target the placeholder `app.tsx`; Step 2.3 must replace them when the real shell lands.
- No token covers the mockup's dark `.seg` active segment (`#333`); Tabs uses `bg-card` for now.

## Resume command

`om-auto-continue-pr-loop 396`
