# Backward compatibility — protected contract surfaces

cezar ships as an npm CLI (`@pat-lewczuk/cezar`, bins `cezar`/`cez`) and persists user state in-place inside target repositories. These surfaces are contracts; changing one requires the listed handling.

## 1. On-disk state under `.ai/cezar/` (highest sensitivity)

Runs (`runs/<id>.json`), transcripts (`runs/<id>.ndjson`), images (`runs/<id>-images/`), handoff files (`runs/<id>.handoff.md`), todos (`todos.json`), skills, worktrees, launch-key. Users are told they can `cat` and hand-fix these files, and old runs must remain viewable after upgrades.

- **Breaking:** renaming/removing fields readers depend on, changing NDJSON event semantics, relocating directories.
- **Required path:** additive changes only where possible; readers (`src/runs/store.ts`, `web/app.js`) must tolerate missing new fields and unknown event types. A relocation or rename needs a lazy migration in the store plus a CHANGELOG note.

## 2. NDJSON transcript event types

Every `evt.type` (`user-message`, `image`, `note`, `lifecycle`, `tool-call`, `tool-result`, `step-start`, `step-end`, `check-output`, `error`, `token-usage`, `cost`, `turn-end`, `done`, …) is read back by the cockpit renderer for **old runs too**.

- **Breaking:** removing a type, repurposing a field, making a previously optional field required at render time.
- **Required path:** add new event types or optional fields; the renderer keeps handling the old shape indefinitely (cheap — one `switch` case).

## 3. HTTP API (`/api/*` in `src/server/server.ts`)

Consumed by the bundled cockpit and by user bookmarklets (spec 011), so it is not purely internal.

- **Breaking:** removing/renaming routes or request/response fields, tightening validation on previously accepted input.
- **Required path:** additive fields; keep old field names accepted for at least one release when renaming; note route removals in the CHANGELOG.

## 4. CLI commands and flags (`src/index.ts`, bins `cezar`/`cez`)

- **Breaking:** removing/renaming flags or changing defaults (port, data dir).
- **Required path:** deprecation warning for one release before removal; keep `cez` and `cezar` equivalent.

## 5. Workflow YAML format (`src/workflows/{load,types}.ts`)

User-authored workflow files must keep loading.

- **Breaking:** renaming step keys, changing step-kind semantics, new required fields.
- **Required path:** new fields optional with defaults; loader accepts old spellings or fails with a message naming the exact migration.

## 6. Skills discovery layout

Locations (`.ai/cezar/skills`, `.ai/skills`, team skills repo) and the SKILL.md format are user-facing.

- **Breaking:** dropping a discovery location or requiring new frontmatter.
- **Required path:** add locations/fields additively; keep old locations scanned.

## Not protected

`src/` internal module structure, `web/` internals (shipped with the server, always version-matched), `scripts/mock-claude.mjs`, and anything under `dist/`.
