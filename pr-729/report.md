## 📸 UI QA evidence — PASS

**Verdict:** ✅ PASS — all required last-location startup, precedence, history, mobile, and stale-project checkpoints behaved as specified.
**Environment:** `http://127.0.0.1:36709` · role `local unauthenticated cockpit` · browser `agent-browser 0.32.1`
**Verified:** `spec/restore-last-location` @ `7aec1fbc`

### Scenario (P1 — last project location)

**Where to click:** `/`, `/p/cezar/git`, `/p/cezar/settings/agents`, and `/settings/global`

| # | Step | Expected | Observed | Result |
|---|------|----------|----------|--------|
| 1 | Open `/p/cezar/git?qa=fresh-7aec#changed` and wait for persistence. | Store the exact project, pathname, query string, and fragment. | Workspace UI state returned `cezar`, `/p/cezar/git`, `?qa=fresh-7aec`, and `#changed`. | ✅ |
| 2 | Open the exact bare `/`, then use browser Back. | Replace root with the saved route and keep transient root out of history. | The URL became `/p/cezar/git?qa=fresh-7aec#changed`; Back remained on that exact URL. | ✅ |
| 3 | Open explicit project Agents settings, visit global Settings, then restore at 390 × 844. | Explicit project navigation remains authoritative, global Settings does not overwrite it, and mobile remains usable. | UI state remained `/p/cezar/settings/agents?manual=fresh-7aec#config`; bare root restored it exactly and the Agents pane rendered without page or console errors. | ✅ |
| 4 | Seed a structurally valid route for a removed project, then open `/`. | Ignore stale state and fall back to the boot project. | The URL became `/p/42766454-3ead-4ea4-8f05-aab273e5cf8b/`; the Tasks empty state rendered without page or console errors. | ✅ |

### Screenshots

![Step 1 — explicit Git location](01-explicit-git-location.png)

![Step 2 — bare root restored](02-bare-root-restored.png)

![Step 3 — mobile restored Settings](03-mobile-restored-settings.png)

![Step 4 — missing-project fallback](04-missing-project-fallback.png)

### Notes for QA

- The disposable environment used `CEZ_DRY_RUN=1` and an isolated `CEZ_HOME`; it exercised no real agent credentials or developer workspace state.
- The host `/tmp` filesystem was inode-quota exhausted, so the browser provider used an isolated profile under `/dev/shm`. This was an infrastructure workaround only; the application build and state were unchanged.
- This was evidence-only QA. It did not add `qa-approved`, and `needs-qa` remains for human sign-off.
- The PR ships no committed browser-level integration test for this flow. The existing follow-up scenario on the PR remains applicable.
