# e2e fixtures

`thread-run.ndjson` is a REAL transcript, not an authored one: the verbatim NDJSON a
CEZ_DRY_RUN=1 cezar (this branch, R2 protocol emitters active) persisted for a quick-task run
that received one follow-up message and was then finished. It is the documented mixed-file
state — v1 lines (`lifecycle`, `note`, `text`, `tool-call`, `user-message`, …) and protocol-v2
events (`item.*`, `turn.*`, `session.*`) interleaved on one `seq` clock, including the v1
twins that follow their v2 items (the thread reducer's dedup case).

The initial task deliberately carries NO `mock:` marker, so the mock's scripted first turn
emits real tool items (a `Bash` execute card with output, a `Screenshot` card with a persisted
image — Step 1.2's material); the follow-up message carries `mock:md`, so the second turn is
the markdown-rich reply the Streamdown/Shiki assertions pin.

Alongside the transcript:

- `thread-run.record.json` — the run's verbatim `runs.json` entry from the same dry run (the
  store's zod-checked shape). The spec loads it as-is, overriding only `titleSummary` (a
  legitimate user PATCH).
- `thread-run-images/` — the `<id>-images/` directory the run persisted; the transcript's
  `image` line points into it via `/api/runs/<id>/images/…`.

To regenerate: build, boot `CEZ_DRY_RUN=1 node dist/index.js serve --repo <tmp-git-repo>`,
POST a run whose task has no `mock:` marker, POST one `/messages` reply containing `mock:md`
once it waits, POST `/finish` (twice: the mock's turn 1 touches `notes.md`, so the run parks
at `review` first — the second finish accepts it), then copy `<tmp>/.ai/cezar/runs/<id>.ndjson`,
`<id>-images/` and the `runs.json` entry here.
