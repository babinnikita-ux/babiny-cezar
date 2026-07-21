# Oxlint and oxfmt for linting and formatting

The repo had no linter or formatter at all — ~450 TypeScript/TSX files kept consistent by hand and review alone. We adopted the Oxc toolchain: `oxlint` for linting, `oxfmt` for formatting.

The choice was largely made for us by [ADR 0001](0001-typescript-7.md). On TypeScript 7 the conventional pair is not merely slower, it is unavailable: typescript-eslint consumes the compiler API as a JS library, and TS 7 ships no such API. `oxlint` has no `typescript` dependency at all — it vendors its own parser — so it is immune to that constraint by construction. It is also fast enough (sub-second over the whole tree) to run in every one of the many agent worktrees cezar executes in parallel, which is a real cost multiplier here.

## Considered Options

- **ESLint + Prettier** — the default choice. Rejected as **not currently possible**: see above. The sanctioned escape hatch in ADR 0001 (aliasing `typescript` to `@typescript/typescript6`) exists for genuine compiler-API consumers, and taking on a side-by-side TypeScript install just to run a linter is a bad trade.
- **Biome** — comparable speed, single binary, and also free of the TS 7 problem. A genuinely close call. Oxc won on lint-rule coverage (the React/a11y/promise plugin set caught real bugs here) and because its type-aware mode explicitly targets TypeScript 7, so the path forward is already aligned with ADR 0001.
- **Oxc (chosen)** — two binaries rather than one, and `oxfmt` is younger than the alternatives. That immaturity is the real cost of this decision.

## Consequences

`oxfmt` is pre-1.0 (0.59.0 at adoption), so its output may shift between releases and surface as a formatting-only diff on upgrade. It is therefore pinned to an exact version rather than a caret range, and should be bumped deliberately.

The config is tuned to the code that already existed rather than to Oxc's defaults — single quotes, `printWidth: 110` (the codebase's own p99 line length). Both minimise the diff; neither is a claim about better style.

Rules disabled for reasons not obvious from the rule name:

- `react/react-in-jsx-scope` — React 19's automatic JSX runtime means `React` is never in scope.
- `no-await-in-loop` — sequential awaits are load-bearing in the git/worktree and runner paths.
- `jsx-a11y/prefer-tag-over-role` and `jsx-a11y/no-autofocus` — Radix/shadcn primitives set `role` deliberately, and focus-on-open is intended UX on modal surfaces.

The keyboard-access a11y rules (`click-events-have-key-events`, `no-static-element-interactions`, `anchor-is-valid`) are kept as **errors**, matching the cockpit's keyboard-access requirement in `AGENTS.md`.

Lint **errors** fail the build; **warnings** are reported but do not. This keeps the gate honest today without blocking unrelated work on a pre-existing warning backlog.

**Not yet enabled: `oxlint --type-aware`.** ADR 0001's move to TypeScript 7 is precisely the prerequisite it needs (it is powered by `oxlint-tsgolint`, which embeds typescript-go). It is deferred only to keep this change scoped. Two things to know before turning it on: type-aware rules sit outside oxlint's semver guarantee, so `oxlint` and `oxlint-tsgolint` must be pinned and upgraded together; and `--type-aware --type-check` can fold in typescript-go's own diagnostics, which may eventually replace the separate `tsc --noEmit` step.
