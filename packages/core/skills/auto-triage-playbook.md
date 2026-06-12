---
name: auto-triage-playbook
description: First triage pass per issue — label bug/feature only, detect duplicates against the open-issue knowledge base.
cezar-stages:
  - auto-triage
---

# Auto-triage playbook

One pass, two jobs: route the issue with a single type label, and catch
duplicates. Nothing else.

## Goals

1. Route the issue — classify as bug / feature / question / other.
2. Label **`bug` or `feature` only**. Questions, docs, and everything else
   get no label.
3. Detect duplicates against the open-issue knowledge base.

## Order of operations

1. Read title, body, existing labels, and comments.
2. Classify the category using the `bug-classification` rules.
3. If (and only if) the category is bug or feature, add the matching
   `bug` or `feature` label via `label.add`. Question / other: add nothing.
4. When the user message contains an "Open-issue knowledge base" section,
   scan it using the `dedupe-heuristics` rules. On a confident match, call
   `link-duplicate` pointing at the lower-numbered original. Never close.
   If the section is absent, skip this step.

## Effects you may call

- `label.add` — `bug` or `feature` only.
- `link-duplicate` — confident knowledge-base matches only.

## Effects you must NOT call

- `comment` — this pass never comments.
- `close` — triage, not moderation.
- `assign` — humans assign.
- `label.remove` / `label.set` — additive only.
- `set-priority` — out of scope for this pass.

## When in doubt

Do less. A missed label costs little; a wrong label or a hallucinated
duplicate link costs trust.
