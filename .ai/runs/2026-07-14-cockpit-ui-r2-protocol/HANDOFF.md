# Handoff — Cockpit UI redesign, Phase R2 (Protocol v2)

## State
- Run started; no Steps landed. Branch `feat/cockpit-ui-r2-protocol` stacked on R1's branch (PR #396, complete, awaiting user merge).
- Next: Step 1.1 (v2 types + display model). PLAN.md's Tasks table is authoritative.

## Context
- The protocol contract: spec §"Normalized agent-event protocol v2" + the authoritative mapping tables in `.ai/analysis/cockpit-ui-redesign/agent-event-protocols.md` §7 (READ THESE FIRST).
- R1's conventions all apply (see the R1 run folder's HANDOFF "Rules"/"Gotchas" sections — same worktree family, same gate: `npm run typecheck` · `npm test` · `npm run build` + `npm run test:e2e` via agent-browser).
- R1 left honest slots this phase fills: `titleSummary` (runTitle() in task-groups), `±` diffStat (tasks table renders `—`), `permission`/`unseen` predicates in `lib/attention.ts`.

## Resume
`om-auto-continue-pr-loop <R2 prNumber>` once the PR exists; until then continue the run folder on the branch.
