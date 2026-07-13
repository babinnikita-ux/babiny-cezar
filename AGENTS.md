# Agent instructions — cezar

cezar is a local cockpit for running and tracking AI coding-agent tasks in a repository: a Node 20+ TypeScript CLI (`cezar` / `cez`, entry `src/index.ts`) that starts a Hono HTTP server serving a zero-build vanilla-JS web cockpit (`web/`) and drives agent backends (Claude CLI, Codex, OpenCode) through per-run worktrees. All state lives in `.ai/cezar/` inside the target repo as plain JSON/NDJSON/Markdown — no database, no accounts, no cloud.

## Task routing

| When the task involves… | Read first | Key rules |
|---|---|---|
| CLI entry, flags, startup | `src/index.ts`, `src/config.ts` | Node ≥ 20; bins are `cezar` and `cez` (both → `dist/index.js`). Zero-config philosophy: new options need a sensible default. |
| HTTP API / server routes | `src/server/server.ts`, then `src/server/{git,pr,github,launch-key,open-in-terminal}.ts` | Hono app; every request body is validated with a zod schema at the top of `server.ts`. Follow the existing limits (e.g. images: `image/*`, ~5 MB decoded, max 4). Static cockpit files are served from `web/`. |
| Web cockpit UI | `web/app.js`, `web/index.html`, `web/style.css` | Single-file vanilla JS, no framework, no build step, no dependencies. State lives in the top-level `state` object; DOM is built with template literals + the `esc()` helper (always escape interpolated values). Events stream over SSE and are rendered per-type in the big `switch (evt.type)` renderer. |
| Agent runners / backends | `src/core/agent-runner.ts` (types), `src/core/{claude-cli-runner,codex-app-server-runner,opencode-server-runner}.ts`, `src/core/runner-factory.ts`, `src/core/backend-detect.ts` | Runners implement the `AgentSession` contract and emit typed `AgentEvent`s. New event types must be handled (or explicitly ignored) in `src/workflows/run.ts` and rendered in `web/app.js`. |
| Workflow engine / run lifecycle | `src/workflows/run.ts` (RunManager), `src/workflows/{load,types}.ts` | Runs execute step-by-step; the last agent step is interactive (session stays open, `waiting` status, idle timeout). Transcript events are append-only NDJSON via `store.appendEvent` — image bytes never enter the NDJSON log (see `persistImage`). |
| Run persistence / transcripts | `src/runs/store.ts` | State under `.ai/cezar/runs/`: `<id>.json` (run), `<id>.ndjson` (events), `<id>-images/` (persisted screenshots). Files must stay hand-fixable plain text. |
| Worktrees, git, PRs | `src/git-worktree.ts`, `src/server/git.ts`, `src/server/pr.ts`, `src/server/github.ts` | Each run gets an isolated worktree under `.ai/cezar/worktrees/` on branch `cez/<id-prefix>`; degrade gracefully when not in a git repo. |
| Skills / handoff / todos | `src/skills.ts`, `src/skills-remote.ts`, `src/handoff.ts`, `src/todos.ts` | Skills are discovered from `.ai/cezar/skills`, `.ai/skills`, and the team skills repo. Every agent step carries the handoff/todos contract (spec 007). |
| Feature design docs | `.ai/specs/` (`000`–`012`, some in Polish) | Specs are numbered and status-tagged; check whether one already covers your change before designing. |
| Testing without tokens | `scripts/mock-claude.mjs` | Mock Claude CLI runner reading/writing NDJSON on stdio; there is no automated test suite — validation is `npm run typecheck` + `npm run build`. |

## Validation gate

Run before any commit/PR, in order (from `.ai/agentic.config.json`):

1. `npm run typecheck`
2. `npm run build`

## Process pointers

- Ticket flow, labels, QA gate: `SDLC.md`
- Review rules: `CODE_REVIEW.md`
- Protected contract surfaces: `BACKWARD_COMPATIBILITY.md`
- Pipeline config: `.ai/agentic.config.json` (tracker ops in `.ai/trackers/github.md`)
