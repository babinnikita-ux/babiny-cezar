# Handoff — R7

## State

Run started; next Step 1.1. Same branch/PR #396. R6 complete (GitHub tab, Inbox, Settings, Workflows builder, notifications — see `../2026-07-15-cockpit-ui-r6-views-settings/HANDOFF.md`).

## Anchors

- Legacy serving seam: `src/server/static-ui.ts` (`resolveIndexHtml`/`resolveGetRequest`) + the `serveShell`/static routes in `src/server/server.ts` — the only places that know the legacy page exists.
- The BC waiver in `BACKWARD_COMPATIBILITY.md` expires at R7 (spec §Compatibility policy) — retire it in 1.2.
- Protected surfaces stay protected: CLI flags, on-disk state readability, `/new` bookmarklet + launch-key contract, workflow YAML, skills formats, additive-only config.
- e2e harness: `web/app/e2e/agent-browser.ts` + shared dry-run env (`.ai/qa/test-env.json`); iPhone viewport pattern in `smoke.e2e.ts` (390×844).
- README gallery: 6 shots in `docs/screenshots/`, referenced at README.md lines ~40–43.
- All prior gotchas hold (R1–R6 handoffs).
