# Handoff — R6

## State

Run started; next Step 1.1. Same branch/PR #396. R5 complete (forge seam, git APIs, Changes/Files tabs, /git rebuild — see `../2026-07-15-cockpit-ui-r5-git-forge/HANDOFF.md`).

## Anchors

- Forge gating: `health.forge.available` (api/types mirrors + drift guards); env chips popover explains missing forge.
- cmdk primitives: command palette (R1) + composer autocomplete (R3) — reuse for #385 dropdowns.
- `deriveAttention` in `web/app/src/lib/attention.ts` is the single status grammar — notifications (1.7) must feed off it.
- Legacy behaviors to port live in `web/app.js` (github/inbox/skills/workflows tabs); APIs are protected shapes (BACKWARD_COMPATIBILITY.md).
- All prior gotchas hold (R1/R4/R5 handoffs).
