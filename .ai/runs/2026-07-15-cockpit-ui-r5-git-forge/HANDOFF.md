# Handoff — R5

## State

Steps 1.1–1.5 done (`e1fc7bd`..`57d9fdc`), checkpoint 1 green (typecheck · build · 1628/1628 unit · 109/109 e2e). Next: **Step 1.6** (Files tab — `task-files.tsx` is a stub panel waiting to be filled; the server API `GET /api/runs/:id/files` landed in 1.2), then 1.7 (Repo view rebuild).

## Anchors

- Server: `src/server/forge/` (driver seam), `src/server/git-changes.ts` (all git plumbing — helpers take `(dir, base)`), `src/server/capabilities.ts`.
- Web: `web/app/src/components/diff/` (facade — consumers never import an engine), `web/app/src/lib/git-actions.ts` (pure policy), `web/app/src/routes/task-git/` (Changes tab + Files stub).
- Health now carries `forge` + `capabilities.localHandoff`; UI mirrors in `api/types.ts` with drift guards in `src/server/api-types.test.ts`.

## Rules (unchanged)

One Step = one commit; flip the Tasks row in the same commit, Commit stays `pending` (dispatcher backfills). Tests mandatory. Agent-browser seam only for e2e. No raw hex outside styles/index.css; no `dark:` variant. Never --no-verify/force-push.
