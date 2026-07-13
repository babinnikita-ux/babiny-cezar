# Code review rules — cezar

Applies to every PR; `om-code-review` (and human reviewers) read this in addition to the built-in checklist.

## Review priorities

1. **Correctness of the run lifecycle.** The RunManager (`src/workflows/run.ts`) is the heart of the app: step transitions, `waiting`/idle-timer semantics, cancellation, and crash recovery must stay coherent. Any change there needs a walk-through of: fresh run, retry loop, cancel mid-turn, server restart with an active run.
2. **Security of the local server.** The cockpit binds locally but executes agents with filesystem access. Check: zod validation on every new/changed request body (`src/server/server.ts`), path traversal guards on file-serving routes (the `basename`/join pattern used by `/api/runs/:id/images/:file`), and size/type limits on user-supplied data (images: `image/*`, ~5 MB decoded, max 4 per message).
3. **XSS in the cockpit.** `web/app.js` builds DOM from template literals — every interpolated value must go through `esc()`. Event payloads (tool output, agent text, filenames) are attacker-influenced content.
4. **Contract surfaces.** HTTP API shapes, NDJSON event types, and on-disk state formats are contracts — see `BACKWARD_COMPATIBILITY.md`. Old transcripts must still render after an event-schema change.
5. **Graceful degradation.** cezar's philosophy: no hard failures for optional capabilities (no git repo → run in place; image persist fails → drop with placeholder). New features should follow the same best-effort pattern instead of throwing.

## Repo-specific checks

- New `AgentEvent` types are handled in all three layers: emitted by a runner (`src/core/*`), routed/persisted in `src/workflows/run.ts`, rendered (or deliberately ignored) in the `switch (evt.type)` in `web/app.js` — including the `default:` JSON fallback not leaking raw base64.
- Image/binary data never enters the NDJSON event log — persist to `.ai/cezar/runs/<id>-images/` and reference by URL (see `persistImage`).
- `web/` stays framework-free and build-free: no npm dependencies, no bundler, ES modules/vanilla only.
- Runner parity: a feature added for the Claude backend states explicitly whether Codex/OpenCode backends support it or degrade.
- State files under `.ai/cezar/` remain human-readable and hand-fixable.
- TypeScript strictness: no `any` escapes in `src/`; zod schemas and TS types for the same payload stay in sync.

## Severity guidance

- **Blocker** — data loss in run state, XSS/path traversal, broken run lifecycle, validation gate red.
- **Major** — contract break without a migration note, unhandled new event type, missing input validation.
- **Minor** — degradation-pattern violations, naming/convention drift, missing spec cross-reference.

Verdict: request changes on any Blocker/Major; Minors can land with follow-up issues.
