# Notifications — Cockpit UI redesign, Phase R1

_Append-only. UTC timestamps. Checkpoints, blockers, decisions, and subagent delegations only — routine per-Step progress lives in the Tasks table and the git log._
- 2026-07-14T12:03:08Z — **run start**. Phase R1 (Platform + shell) of the cockpit UI redesign spec. Branch `feat/cockpit-ui-r1-platform-shell` off main@16ef2fa. 17 Steps planned across 4 phases.
- 2026-07-14T12:03:08Z — **decision**: basing R1 on `main`, not on the spec branch. Spec PR #395 is approved by the user but still OPEN (`REVIEW_REQUIRED`; self-approval is blocked by GitHub — the owner must merge). R1's scaffold has no dependency on the spec file being present, and the two PRs touch disjoint paths.
- 2026-07-14T12:09:17Z — **decision**: spec PR #395 merged; run rebased onto main so the spec is in-tree.
- 2026-07-14T12:09:17Z — **decision**: adopted the `agent-browser` provider per the upgraded skills collection (config `browser.provider` + committed `.ai/browsers/agent-browser.md`); `npm test` joins the validation gate. Every UI checkpoint drives the browser through this provider. Added Step 1.6 for the provider setup + first smoke test.
- 2026-07-14T12:09:17Z — **decision**: `Commit` column in the Tasks table is informational and dispatcher-backfilled — a commit cannot contain its own SHA (the amend re-hashes it, as Step 1.1's executor found). `Status` remains the resume signal. Backfilled 1.1 → c431924 (later 4f3bf43 after the rebase).
- 2026-07-14T12:09:17Z — **PR opened early as draft (#396)** at the user's request so run status is watchable; lock claimed (assignee + in-progress + claim comment).
