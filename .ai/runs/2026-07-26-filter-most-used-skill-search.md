# Execution Plan: Filter Most-Used Skill Search

Source doc: .ai/specs/2026-07-26-filter-most-used-skill-search.md

## Goal

Make every grouped skill picker filter the complete catalog before partitioning matching skills into Most used, Project, and Global tiers.

## Scope

- Add one shared grouped search-and-tier helper in `web/app/src/lib/skills.ts`.
- Adopt it in New Task, GitHub hand-off, and Prompt Templates skill pickers.
- Add helper and interaction regressions that preserve empty-query ordering.
- Validate the cockpit and exercise the affected UI flows.

## Non-goals

- Changing usage counting, the five-entry Most used cap, picker visuals, or non-skill search surfaces.
- Changing server APIs, persisted state, workflows, or skill discovery.

## Risks

- Disabling cmdk filtering requires every picker to render only helper-filtered arrays; interaction tests will catch accidental unfiltered groups.
- The helper must preserve the existing empty-query order; unit tests will pin the #519 contract.

## Implementation Plan

### Phase 1: Shared contract and consumers

1. Add the grouped search-and-tier helper and focused unit coverage.
2. Migrate New Task and GitHub hand-off pickers with interaction regressions.
3. Migrate Prompt Templates to controlled search and add its interaction regression.

### Phase 2: Verification

4. Run the configured validation gate and fix any failures.
5. Run browser QA across the affected grouped skill pickers and attach evidence to the implementation PR.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared contract and consumers

- [ ] 1.1 Add the grouped search-and-tier helper and focused unit coverage.
- [ ] 1.2 Migrate New Task and GitHub hand-off pickers with interaction regressions.
- [ ] 1.3 Migrate Prompt Templates to controlled search and add its interaction regression.

### Phase 2: Verification

- [ ] 2.1 Run the configured validation gate and fix any failures.
- [ ] 2.2 Run browser QA across the affected grouped skill pickers and attach evidence to the implementation PR.
