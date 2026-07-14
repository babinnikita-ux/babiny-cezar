# Run: Cockpit UI redesign — Phase R1 (Platform + shell)

- Date: 2026-07-14
- Branch: `feat/cockpit-ui-r1-platform-shell`
- Base: `main`
- Source spec: `.ai/specs/2026-07-14-cockpit-ui-redesign.md` (PR #395 — approved by the user; lands on main separately)
- Mode: Spec-implementation run

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids are immutable once a Step has a commit.

| Phase | Step | Title | Status | Commit |
|-------|------|-------|--------|--------|
| 1 | 1.1 | Vite + React + TS scaffold with dev:web / build:web scripts | done | 4f3bf43 |
| 1 | 1.2 | Tailwind v4 + design tokens + self-hosted fonts | done | da0f27b |
| 1 | 1.3 | shadcn/ui primitives and the cn() utility | done | 907c125 |
| 1 | 1.4 | vitest projects (server + web) and npm test in the validation gate | done | ca8208f |
| 1 | 1.5 | Hono serves web/dist with legacy fallback and ?legacy=1 | done | 85db541 |
| 1 | 1.6 | Agent-browser provider setup + first UI smoke test | done | 03b58d0 |
| 2 | 2.1 | react-router route map + server SPA catch-all | todo | — |
| 2 | 2.2 | Theme system (pre-paint, light/dark/system) | todo | — |
| 2 | 2.3 | App shell: sidebar + 100dvh grid + safe areas | todo | — |
| 2 | 2.4 | Mobile drawer navigation | todo | — |
| 3 | 3.1 | Typed API client for /api/* | todo | — |
| 3 | 3.2 | SSE hooks with reconcile doctrine (global stream) | todo | — |
| 3 | 3.3 | deriveAttention + task quick-list (groups, variants, status dots) | todo | — |
| 3 | 3.4 | Tasks table view (the overview home) | todo | — |
| 4 | 4.1 | CenteredState template + empty states | todo | — |
| 4 | 4.2 | Tools dropdown (installed tools, versions, setup links, cog) | todo | — |
| 4 | 4.3 | ⌘K command palette | todo | — |
| 4 | 4.4 | Design-guardian static-scan test | todo | — |

## Conventions

- **`Commit` column is informational and backfilled by the dispatcher.** A commit cannot contain its own SHA (amending re-hashes it), so executors flip `Status` → `done` in their Step's commit and the dispatcher backfills real short SHAs at each checkpoint. `Status` is what the resume logic reads.
- **UI verification uses the agent-browser provider** (`.ai/browsers/agent-browser.md`, `browser.provider` in the pipeline config). Every checkpoint that touches UI runs the integration suite through it and saves screenshots into `checkpoint-<N>-artifacts/`.

## Goal

Land the platform and shell for the cockpit redesign: a React + Vite + Tailwind v4 + shadcn/ui app served by the existing Hono server, with the app shell, theming, routing, live data layer, task overview, and chrome — while the legacy vanilla UI stays reachable and every existing feature keeps working.

## Scope

- `web/` — new React app (`web/src`, `web/index.html`, vite/tailwind/vitest configs). The legacy `web/app.js`, `web/style.css`, `web/index.html` are preserved (served at `?legacy=1`) until phase R7.
- `src/server/server.ts` — serve `web/dist` when present, legacy fallback, SPA catch-all for deep links.
- `package.json` — vite/react/tailwind/shadcn/vitest devDeps, `dev:web`, `build:web`, `test` scripts; `build` runs both.
- `.ai/agentic.config.json` — add `npm test` to `validation.commands`; select the `agent-browser` browser provider.
- `.ai/browsers/agent-browser.md` — the committed browser-provider descriptor (from the skills collection, which made agent-browser the default).
- `web/app/e2e/` — integration tests driven through the agent-browser provider, extended at every UI step.

## Non-goals

- No agent-event protocol v2 (phase R2), no thread view (R3), no new-task composer (R4), no git view (R5), no settings/GitHub/workflows views (R6), no legacy deletion or packaging flip (R7).
- No changes to the run engine, worktree/queue logic, review-gate semantics, or the CEZ:DONE contract.
- No new runtime dependencies for end users (all new deps are devDependencies; the build ships static assets).

## Risks

- **Bundle/offline**: fonts must be self-hosted (no CDN) so the cockpit works offline. Verified at the checkpoint.
- **Zero-config promise**: `npx cezar-cli` must keep working with no build step for the user — `web/dist` is built at publish time; when absent in dev, the server serves the legacy UI and prints a hint. No user-facing regression.
- **BC**: the spec's redesign waiver (PR #395) covers the `web/` asset layout. Until #395 lands, reviewers may see the `web/` change as a BC concern — the PR body flags this explicitly.
- **Node 24 / npm resolution**: new toolchain deps must not break `npm run build` (tsc) for the server.

## External References

None (no `--skill-url` passed).
