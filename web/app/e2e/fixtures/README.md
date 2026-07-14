# e2e fixtures

`thread-run.ndjson` is a REAL transcript, not an authored one: the verbatim NDJSON a
CEZ_DRY_RUN=1 cezar (this branch, R2 protocol emitters active) persisted for a `mock:md`
quick-task run that received one follow-up message and was then finished. It is the documented
mixed-file state — v1 lines (`lifecycle`, `note`, `text`, `user-message`, …) and protocol-v2
events (`item.*`, `turn.*`, `session.*`) interleaved on one `seq` clock, including the v1
`text` twins that follow their v2 items (the thread reducer's dedup case).

To regenerate: boot `CEZ_DRY_RUN=1 node dist/index.js serve --repo <tmp-git-repo>`, POST a run
with a task containing `mock:md`, POST one `/messages` reply once it waits, POST `/finish`,
then copy `<tmp>/.ai/cezar/runs/<id>.ndjson` here.
