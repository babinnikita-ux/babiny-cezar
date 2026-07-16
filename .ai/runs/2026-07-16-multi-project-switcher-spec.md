# Execution plan: multi-project switcher spec

**Source doc:** `.ai/specs/2026-07-16-multi-project-switcher.md` (this run ships it)

## Goal

Land the reviewed feature spec for multi-project support (per-user `~/.cezar` instance
registry + loopback reverse proxy + sidebar project dropdown) as a design document. No
implementation — the spec's own Implementation Plan is the future work.

## Scope

- Add exactly one file: `.ai/specs/2026-07-16-multi-project-switcher.md`.

## Non-goals

- Any code change. This PR is the design record only.
- The AGENTS.md zero-config doctrine — split into its own docs PR by explicit decision.

## Risks

- None to runtime: docs-only, adds a new file under `.ai/specs/`. The validation gate is
  a diff re-read; the repo has no markdown linter wired into `validation.commands`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Ship the spec

- [ ] 1.1 Add the reviewed spec file under `.ai/specs/`
