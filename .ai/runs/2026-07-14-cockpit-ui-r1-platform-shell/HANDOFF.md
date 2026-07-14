# Handoff — Cockpit UI redesign, Phase R1 (Platform + shell)

_Rewritten at every checkpoint and at run end. A fresh agent should be able to resume in under 30 seconds._

## State

- **Run started.** No Steps landed yet.
- Branch `feat/cockpit-ui-r1-platform-shell` off `main` (16ef2fa).
- PR: not opened yet (opens after the final gate).

## Next concrete action

Step **1.1 — Vite + React + TS scaffold with dev:web / build:web scripts** (first `todo` row in `PLAN.md`'s Tasks table).

## Context a new agent needs

- Source spec lives on PR #395's branch (`origin/feat/cockpit-ui-redesign-spec:.ai/specs/2026-07-14-cockpit-ui-redesign.md`) — **not yet on main** (blocked on `REVIEW_REQUIRED`; the repo owner must merge it). R1 does not depend on the spec file existing in the repo.
- Design tokens + 5 HTML mockups (the visual targets) are on the same branch under `docs/mockups/`.
- The legacy vanilla UI (`web/app.js`) must keep working the whole time — it is the fallback until phase R7.
- Validation gate: `npm run typecheck`, `npm run build`, and (from Step 1.4) `npm test`.

## Resume command

`om-auto-continue-pr-loop <prNumber>` once the PR exists; until then, continue this run folder directly.
