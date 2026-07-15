# Notifications — R5

- 2026-07-15T04:52:00Z — run start (R5), 7 steps, executor-dispatch mode (om-auto-continue-pr-loop resume of PR #396, "until whole spec is fully implemented").
- 2026-07-15T07:25:00Z — decision (1.4): `@pierre/diffs` v1.2.12 evaluated and rejected — it imports `createHighlighter` from the full `shiki` bundle entry and keeps its own module-level highlighter singleton + `@pierre/theming` pipeline, with no seam to feed it our `shiki/core` singleton or `--syn-*`/`--diff-*` tokens (double Shiki instantiation + full-bundle pull, both forbidden by `lib/highlighter.ts`; 7.1 MB dist). `<Diff>` ships our own renderer behind the same facade props (`web/app/src/components/diff/`), zero new dependencies; a future engine swap happens inside `diff.tsx` only.
