# Babiny Cezar adapter

`adapter.mjs` is the Babiny-specific boundary around the upstream Cezar
server. It is deliberately kept outside `packages/cezar` so upstream updates
can be merged with a small, reviewable policy seam.

The adapter provides:

- HMAC-SHA256 validated GitHub `issues` intake with repository/event allowlists;
- compatibility for `BABINY_AGENT_JOB_V1` issue definitions;
- atomic durable idempotency/reconciliation state;
- repository routing and explicit Claude/Codex profiles;
- a bounded workflow: implementation → local gate → read-only review → fix →
  local gate → final read-only review;
- the Family Bot route bootstraps a disposable `.venv` in the isolated worktree,
  installs `.[dev]`, and runs `.venv/bin/python -m pytest -q`; a Node gate is
  rejected fail-closed for that repository;
- draft-PR handoff and exact-PR-head CI polling;
- loopback-only `/api/status` and `/healthz` responses containing only the
  public status contract; `/api/status` and its `/status` alias require the
  dedicated `Authorization: Bearer <token>` credential while `/healthz`
  remains unauthenticated for local service health checks.

The status contract may additionally expose only the allowlisted active profile
fields `activeAgent`, `activeModel`, and `activeRole`. It never exposes session
IDs, prompts, transcripts, environment values, or credentials. Before a PR
exists, `ciState` remains `unknown`; after a PR exists it is derived from the
exact PR head checks.

The webhook secret, status token, and runtime JSON are deployment files, never
repository files. Configure `statusTokenFile` as an absolute path readable only
by the adapter service account. The adapter fails closed before listening when
that token is missing or invalid. It has no generic command endpoint and does
not proxy raw Cezar run records, prompts, diffs, transcripts, environment
values, or credentials.
