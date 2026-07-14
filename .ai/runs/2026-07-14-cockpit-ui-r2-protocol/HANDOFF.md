# Handoff — Cockpit UI redesign, Phase R2 (Protocol v2)

## State (checkpoint 1)
- **Phase 1 complete (4/8 Steps)** — v2 types + all three backend emitters with golden fixtures + the parity roll-up test. `4aaaa82`..`cbaf869`. Gate: 800/800, build green.
- Next: **Step 2.1 — RunManager persists v2 (delta coalescing ~30-50ms + item snapshots, per the spec's performance guardrails) and fans out over SSE.** Then 2.2 titleSummary/diffStat/PATCH, 2.3 systemPrompt, 2.4 web mirror.
- All mappers share one shape (`create*UiState`/`map*`/out-of-band session+turn helpers) and one channel: `SessionOptions.onUiEvent`. RunManager consumes it uniformly.

## Context
- The protocol contract: spec §"Normalized agent-event protocol v2" + the authoritative mapping tables in `.ai/analysis/cockpit-ui-redesign/agent-event-protocols.md` §7 (READ THESE FIRST).
- R1's conventions all apply (see the R1 run folder's HANDOFF "Rules"/"Gotchas" sections — same worktree family, same gate: `npm run typecheck` · `npm test` · `npm run build` + `npm run test:e2e` via agent-browser).
- R1 left honest slots this phase fills: `titleSummary` (runTitle() in task-groups), `±` diffStat (tasks table renders `—`), `permission`/`unseen` predicates in `lib/attention.ts`.

## Resume
`om-auto-continue-pr-loop <R2 prNumber>` once the PR exists; until then continue the run folder on the branch.
