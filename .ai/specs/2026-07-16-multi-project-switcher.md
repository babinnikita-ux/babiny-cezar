# Multi-project switcher

## TLDR

Running cezar in three repos means three terminal tabs and three memorized `localhost` ports, and in VPS mode the other two are simply unreachable. This spec adds a per-user instance registry under `~/.cezar` that every running instance writes itself into, and a loopback reverse proxy so the cockpit you already have open can drive another project's instance at `/p/<id>/…`. The repo chip in the sidebar becomes a project dropdown listing the live, health-checked peers. Each cezar stays a separate process owning its own queue, workers and worktrees — switching projects forwards HTTP, it never re-roots a server or stops a queue. The whole feature is behind `CEZ_MULTI_PROJECT=1`; unset, cezar behaves exactly as it does today.

## Problem Statement

cezar is per-repo by construction and that is right: one process, one repo root, one worktree pool, one queue. The cost is that the cockpit has no idea other cockpits exist.

- **You lose the ports.** `pickPort` (`src/index.ts:144-159`) scans 50 ports up from 4321 and prints the winner once, at boot. Three days later the terminal tab is gone and the port with it.
- **The one existing answer is a client-side port scan, and it is already broken.** The bookmarklet brute-forces `fetch` against ports 4321–4330 (`web/app/src/lib/bookmarklet.ts:18-33`), then matches `repo.remote` by substring and falls back to "first alive cockpit" (`|| rs[0]`). `pickPort` scans 50 ports, so instances 11–50 are invisible to it, and the fallback can silently target the wrong repo.
- **VPS mode makes discovery impossible from the browser.** Every instance binds `127.0.0.1` (`src/server/server.ts:1272-1280`). When the cockpit is viewed over the network (`CEZ_REMOTE=1`), the browser can reach exactly one origin — the one that was port-forwarded. Peer instances are unreachable, so a browser-side scan or redirect cannot work at all.
- **Switching is manual and lossy.** Today it means finding the terminal, reading the port, typing a new URL — and you lose your place.

Evidence this matters: the bookmarklet exists *because* "which cezar serves this repo" is already a question worth code. It answers it with a scan, badly, and only in local mode.

## Proposed Solution

Two mechanisms, both dormant unless `CEZ_MULTI_PROJECT=1`.

1. **A registry as a side effect of running.** On boot, after `pickPort` resolves the real port, the instance writes `~/.cezar/instances/<id>.json` with its repo root, branch, port, pid and version. On shutdown it deletes it. Nobody edits this file, nobody configures it; delete the directory and it rebuilds on next boot.
2. **A loopback reverse proxy.** The cockpit mounts `ALL /p/:instanceId/*` and forwards to `127.0.0.1:<port>` for the instance with that id — target resolved from the registry, never from the request. The browser keeps talking to one origin; the server does the reaching.

The sidebar repo chip becomes a `DropdownMenu` when live peers exist, and stays exactly the chip it is today when they don't.

### Why the proxy, and not the two alternatives

**Rejected — browser redirect to `localhost:<peerPort>`.** Nearly free locally: no server work, no base paths. It dies on VPS mode, where peers bind loopback and the browser can reach only the forwarded origin. Building a switcher that silently doesn't work in hosted mode is not worth the saved code.

**Rejected — in-process re-root (one server, N repos).** This is the "load the other project's context into this instance" shape, and it is the expensive one. `repoRoot` is a `ServerDeps` field (`src/server/server.ts:55`) that ~50 routes close over as an invariant; the runs store, skills discovery, and the worktree pool are all rooted through it. Making it mutable turns every route into a "which repo am I?" question, and — decisively — the queue and its live agent processes belong to the instance. Switching context would either stop the current project's queue or force one process to own two queues. Isolated instances with their own workers already work; the proxy keeps that property and adds only I/O forwarding.

**Chosen — reverse proxy.** Works identically in local and VPS mode, because the server reaches loopback peers the browser can't. Preserves process isolation: the proxying instance's queue keeps running untouched while you drive another project through it. And the transport is tractable — see below.

### Why the SSE concern doesn't bite

The upgrade problem that makes proxies painful does not exist here: **there are no WebSockets in cezar.** A repo-wide grep finds no `WebSocket`, `socket.io`, or `node-pty`; the sole `xterm` hit is a Linux terminal-emulator binary name in `src/server/open-in-terminal.ts:49`. The "Terminal" action shells out to the OS terminal app via `openInTerminal` (`src/server/open-in-terminal.ts:16-56`) and returns plain JSON (`server.ts:690-711`).

That leaves plain HTTP plus exactly two long-lived endpoints, both built with Hono's `streamSSE` (`server.ts:998`, `server.ts:1050`; the route registrations are at `:995` and `:1049`). Forwarding is a `ReadableStream` passthrough on global `fetch` — the response body streams; nothing needs buffering. Both endpoints heartbeat a `ping` every 15s, which keeps idle timeouts off our back. No new dependency: the repo already uses global `fetch` (Node ≥20) and ships only `hono`, `@hono/node-server`, `yaml`, `zod`. **Do not reach for `undici`** — it is present in `node_modules` only as a transitive dev dependency of `jsdom` and would not install for consumers of the published tarball.

Two SSE details the proxy must get right, because Hono does **not** hand them to us:

- **`streamSSE` sets no `x-accel-buffering` header.** It sets `content-type: text/event-stream`, `cache-control: no-cache`, `connection: keep-alive` and `transfer-encoding: chunked`, and nothing else. In VPS mode there is usually an nginx/Caddy in front, and absent `x-accel-buffering: no` it will buffer the stream and the cockpit goes mute. **The proxy adds that header itself** on `text/event-stream` responses.
- **Hop-by-hop headers must be stripped in both directions.** Two of the four headers `streamSSE` sets (`connection`, `transfer-encoding`) are hop-by-hop; re-emitting the upstream's copies verbatim on our own response is the classic proxy corruption bug.

## Architecture

### Components

| Component | File | Responsibility |
|---|---|---|
| Path helper | `src/paths.ts` (new) | Resolve `~/.cezar` (`CEZ_HOME` override for tests). First shared home-path helper in the repo. |
| Registry | `src/instances/registry.ts` (new) | `writeEntry()`, `removeEntry()`, `readEntries()`. Owns the file format and the atomic write. |
| Discovery | `src/instances/discover.ts` (new) | Version-filter, probe, prune. Caches the result. |
| Proxy | `src/server/proxy.ts` (new) | `ALL /p/:instanceId/*` → `127.0.0.1:<port>`. |
| Liveness route | `src/server/server.ts` (edit) | `GET /api/instance` — cheap, no subprocesses. |
| Capability | `src/server/capabilities.ts` (edit) | `multiProject: env.CEZ_MULTI_PROJECT === '1'`. |
| Registration | `src/index.ts` (edit) | Register after `pickPort`; deregister in `shutdown`. |
| API | `src/server/server.ts` (edit) | `GET /api/projects`; mount the proxy above the SPA catch-all. |
| Base path | `web/app/src/api/client.ts` (edit) | Derive `apiBase` from the URL prefix; `withBase()` for raw URLs. |
| UI | `web/app/src/components/app-shell.tsx` (edit) | Chip → `DropdownMenu` when peers exist. |

### Registration lifecycle

Registration lands in `src/index.ts` immediately after `const port = await pickPort(preferredPort)` (`index.ts:115`) — the port is the one field that cannot be known earlier.

Deregistration hooks the existing `shutdown` (`index.ts:129-134`), which today is:

```ts
const shutdown = () => { store.flush(); process.exit(0); };
```

`process.exit(0)` is synchronous, so **the unlink must be sync** (`unlinkSync`) or it will not run. This follows `store.flush()`'s precedent of doing sync work in the exit path.

Crash-safety is the reader's job, not the writer's. A `SIGKILL`ed instance leaves a stale file; that is expected and handled by discovery under a strict rule (below).

### Liveness: a cheap endpoint, not `/api/health`

**`/api/health` must not be polled.** It looks free and isn't: the route (`server.ts:299-304`) awaits `detectEnvironment()`, which is `Promise.all([probeClaude(), probeCodex(), probeOpencode(), probeGh(), probeGit()])` (`src/core/backend-detect.ts:20-21`) — five uncached `exec` calls with a 10s timeout each — plus `getRepoInfo()` (2–4 `git` shell-outs) and `loadConfig()`. The "health must never block" comment at `server.ts:315-316` scopes only the `forge` field's `gh` shell-out; it is not a claim about the route. Three instances discovering each other on a 10s timer would spawn roughly five processes per second, forever, in every idle cockpit. This is the trap the naive design walks into.

So this spec adds **`GET /api/instance`**: `{ id, version, repoRoot, branch }`, read from memory, no subprocesses, no git. That is the probe target.

New peers have it; old ones don't — and that's fine, because **the version gate is decided from the registry file before any network call.** The file records the version of the process that wrote it, so a version-skewed peer is classified without a probe, and only same-version peers (which by definition have `/api/instance`) are ever probed.

The probe cross-checks `repoRoot` **and** `id` against the entry. This is what catches **port reuse after a crash**: instance B dies without deregistering, instance C boots and `pickPort` hands it B's port. C answers on B's port with C's identity, the mismatch is caught, and the switch never lands on the wrong repo. **This cross-check is not optional.** It also disarms the `pickPort` race (the window between `index.ts:115-116`, where `canListen` at `:152-159` has already closed its probe socket before the server binds) — the loser simply never answers.

### The pruning rule (why one file per instance stays lock-free)

The lock-free property survives only under a rule the obvious design breaks. A reader that unlinks any entry whose probe fails will, sooner or later, delete a **live but slow** peer's file — and since registration is boot-only, that instance stays invisible until it restarts.

The invariant is therefore:

> **A file is only ever written by its owner. It is only ever deleted by its owner — or by a reader that has proven the owner no longer exists.**

Proof of death is `process.kill(pid, 0)` throwing `ESRCH`. A reader unlinks **only** when the pid is dead **and** the probe failed. A slow peer has a live pid, so its file is never touched; it is skipped for this cycle and returns on the next. A recycled pid makes the check conservative (we keep a file we could have dropped), never destructive. Because the pid is provably gone, there is no concurrent writer to race — no lock needed. Q4 (one runtime, one world) is what makes the pid check meaningful.

Because the check runs **server-side over loopback**, it works in VPS mode and does not depend on the `/api/health` CORS shim (`server.ts:289-298`) — that shim exists for browser-side bookmarklets and is untouched here.

### Proxy routing and the base path

The proxy mounts as `app.all('/p/:instanceId/*', …)`, registered **above the SPA catch-all** `app.get('*', …)` at `server.ts:1267`, which is documented as "Last, so every route above still wins". Middleware is a thin precedent but an established one — `app.use()` appears exactly once already (`server.ts:289`), for the health CORS shim.

**The `/p/*` route is mounted unconditionally, flag or no flag.** With the flag off it answers 404 `{ error }` for `/p/*/api/*` and redirects `/p/<id>/` to `/`. This is not symmetry for its own sake: `resolveGetRequest` (`src/server/static-ui.ts:39-45`) only passes through `/api`-prefixed and static paths, so an unmounted `/p/…` falls to the catch-all and gets **200 + the SPA shell**. A stale `/p/<id>/` bookmark would then load the cockpit, derive `apiBase=/p/<id>`, and receive HTML for every API call — a silently broken cockpit instead of a clean 404.

**Two things are proxied differently, and the distinction is load-bearing:**

- `/p/<id>/api/*` → forwarded to the peer.
- `/p/<id>/` and other non-API paths → **served locally by this instance's shell.** They must *not* be forwarded: the peer's `index.html` references its own hash-stamped `/assets/index-<peerHash>.js`, which this origin does not have, and the switch would white-screen. The bundle is always ours; only the API is theirs.

The cockpit is currently same-origin *and* base-less. `web/app/src/api/client.ts:46-56` states the doctrine outright: "there is no base URL to configure and no cross-origin case to get wrong". **This spec keeps same-origin and changes only the second half**: a base *path* appears, but every request still goes to the origin that served the bundle. That docblock must be updated in the same commit rather than quietly falsified.

Most of the change is contained because every `fetch` funnels through `send()` (`client.ts:127`, the module's only `fetch` call):

```ts
// Derived once, from the URL that served this bundle.
const apiBase = /^\/p\/[a-f0-9]{8}/.exec(window.location.pathname)?.[0] ?? ''
```

`send()` prefixes `apiBase`; the ~50 root-relative literals at the call sites stay untouched. Four sites bypass `send()` and need `withBase()` explicitly:

1. `global-events.tsx:30` — `EventSource('/api/events')`.
2. `run-events.ts:91` — per-run `EventSource`.
3. `runFileRawUrl` (`client.ts:286`) — returns a raw URL string consumed by `<img src>` in `routes/task-git/file-preview.tsx:91`.
4. **Server-supplied `ThreadImage.url`** — rendered at `routes/task-thread/thread-items.tsx:62,449`. This one originates in the *peer's* NDJSON as a root-absolute `/api/runs/:id/images/…` path and **cannot** be fixed inside `send()`; it must be prefixed at the render boundary.

React Router takes `basename={apiBase}` so client-side navigation keeps the prefix, and assets stay at `/assets/*` on the shared origin.

Chosen over an `X-Cez-Project` header (a one-line change in `send()`, but `EventSource` cannot set headers, and a header/cookie makes the URL lie — refresh loses the project, deep links break, and two tabs on two projects fight). The path is honest, refresh-safe, tab-safe and shareable.

### Timeouts

The probe gets an 800ms `AbortController` — generous now that `/api/instance` does no work. Proxied requests need their own policy, since a peer that accepts a connection and then wedges would otherwise hang this instance's request forever:

- **Headers timeout: 10s.** If the peer hasn't produced response headers by then, 504 `{ error }`.
- **No body timeout.** An SSE stream is *supposed* to stay open for hours; a blanket body timeout would kill the feature. The 15s `ping` heartbeat is the liveness signal, and the client's existing `EventSource` retry loop (`global-events.tsx:108-209`) already handles a stream that dies.

### Version skew — the sharp edge

Under the proxy, **instance A's React bundle talks to instance B's server**. If A is v1.2 and B is v1.5, the UI runs against an API it was not built for. This is the failure Storybook Composition hit and now warns about explicitly (see Research).

Policy: **exact version match to switch.** A mismatched peer is listed but disabled, with the reason shown ("cezar v1.5 — restart this cockpit to switch"). Silent skew would produce zod validation failures at random boundaries and look like data corruption. Given both instances are the same user's, on the same machine, the fix is trivial and the strictness is cheap. The version is read from the registry file, so this costs no network call.

### Data flow

```
cez serve (repo A) ──register──► ~/.cezar/instances/<idA>.json
cez serve (repo B) ──register──► ~/.cezar/instances/<idB>.json
                                          │
browser ──► A:4321 /api/projects ─────────┤ read files → version-filter → probe /api/instance over loopback
        ◄── [{id, name, branch, switchable}]
        │
        └─► A:4321 /p/<idB>/api/runs ──proxy──► 127.0.0.1:4322 /api/runs   (B's own queue, untouched)
            A:4321 /p/<idB>/api/events ──SSE passthrough──► 127.0.0.1:4322 /api/events
            A:4321 /p/<idB>/           ──served locally──► A's own shell + assets
```

### Transport to the UI

Peer state reaches the browser over the existing `/api/events` SSE connection as a `projects` event, not a client-side poll. The query layer sets `refetchInterval: false` as doctrine (`web/app/src/api/query-client.ts:5-35`: "freshness comes from the stream invalidating these queries — not from polling"), and `queries.ts:143-146` is the comment a reviewer will cite against a new interval. The *server* polls — it re-reads the registry and re-probes on a ~10s `unref()`'d timer (matching `store.ts`'s debounce timer precedent) and emits `projects` only when the set changes. "Every cezar polls the file" holds; the polling just lives where it can also probe over loopback.

### Security

The proxy is the first code that makes one instance reach another, so the trust boundary deserves naming.

- **The target is never taken from the request.** `instanceId` selects a registry entry; the port comes from that entry. A request cannot name a host or port. This is the whole SSRF story, and it is why the design resolves through the registry instead of accepting `?port=`.
- **`instanceId` is a path segment and a filename**, so it gets the treatment CODE_REVIEW.md demands of any user string reaching a path: pinned to `^[a-f0-9]{8}$` at the zod schema *and* the route, and resolved by matching `readEntries()` output — never by `join(dir, id + '.json')`.
- **Loopback only.** Targets are always `127.0.0.1:<port>`; any entry that isn't is dropped on read.
- **`~/.cezar` is per-user**, created `0700`, entries `0600`. It contains repo paths and ports — no secrets — but it is the input to the proxy's target resolution, so its integrity matters more than its confidentiality.
- **VPS mode widens exposure by design.** With `CEZ_REMOTE=1` and `CEZ_MULTI_PROJECT=1`, whoever reaches the forwarded cockpit reaches every registered peer through it. They are all the same user's projects, and cezar has no auth model today — but this turns one exposed instance into N, and that is exactly why the feature is flag-gated rather than on by default. The `.env.example` prose must say this.
- **`open-in-*` stays honest.** `open-in-cli`/`open-in`/`open-targets` act on the *server's* machine and are already gated by `CEZ_REMOTE=1` via `capabilities.ts:26`. Proxied requests hit the peer's own capability check with the peer's own env, which is the correct answer: the peer decides what it will do on its own host.

### Runtime scope (Q4)

**One runtime, one world.** A WSL2 instance writes `/home/you/.cezar`; a native Windows instance writes `C:\Users\you\.cezar`. They are different registries and they do not see each other. No `/mnt/c` bridging, no `\\wsl$` paths, no host tagging. `node:os` `homedir()` resolves correctly on each, so the code is identical and the boundary is simply where the filesystem already puts it. Each world is self-consistent: the proxy reaches loopback peers within its own runtime, which is where the instances it can see actually live. It is also what makes the pid-liveness rule sound — every peer we can see is a process in our own process namespace.

This is also why the path is literal `~/.cezar` on every platform rather than XDG or `%LOCALAPPDATA%`: one rule, no per-platform branch, and it matches how the existing (unabstracted) cache path already behaves — `skills-remote.ts:45-55` hardcodes `join(homedir(), '.cache', 'cez', …)` with no XDG and no Windows handling. Refactoring that onto the new helper is **out of scope**; the helper is written so it can adopt it later.

## Data Model

### `~/.cezar/instances/<id>.json` (Q5 — one file per instance)

You asked for a single JSON file; I'm recommending one file per instance instead, for one reason: **this repo has no cross-process locking of any kind.** `todos.ts:37-54` is an in-process promise-chain mutex; both atomic-write helpers are private (`store.ts:409-419`, `todos.ts:99-104`); there are no lockfiles and no `flock` anywhere. A shared `instances.json` means N processes doing read-modify-write on one file, and two cezars booting together silently lose an entry. Correctness would require inventing a lock primitive the codebase has never needed.

One file per instance makes that problem vanish under the pruning rule above: writes never collide because each process writes only its own file, and deletes never race because a reader deletes only after proving the owner is gone. It is still "a JSON file per instance under `~/.cezar`", and it degrades better too — a corrupt file affects exactly one entry.

```jsonc
{
  "id": "a3f1c8d2",        // ^[a-f0-9]{8}$ — filename, proxy path segment, probe cross-check
  "pid": 41233,
  "port": 4322,
  "repoRoot": "/Users/you/Projects/other-repo",
  "repoName": "other-repo", // basename(repoRoot); denormalized so readers don't recompute
  "branch": "main",
  "version": "1.4.0",       // decides switchability without a network call
  "startedAt": "2026-07-16T10:12:03.000Z"
}
```

Written atomically (tmp + `renameSync`), following the house pattern. `id` is random (not the pid) so a recycled pid can never alias an entry, and so the proxy path is stable for the process's lifetime. `branch` is a boot-time snapshot and may go stale — the dropdown re-reads it from the probe response, which is authoritative; the file's copy is the pre-probe fallback for display.

Every string field carries a zod `.max()` bound (CODE_REVIEW.md requires it). Reading follows the house rule from `store.ts`: **corrupt or unparseable degrades to skipped, never throws.** Unknown fields are ignored and every new field must be optional, so a newer instance's entry still parses in an older reader.

### `GET /api/instance` (new, cheap)

```jsonc
{ "id": "a3f1c8d2", "version": "1.4.0", "repoRoot": "/Users/you/Projects/other-repo", "branch": "main" }
```

In-memory only. No subprocess, no git, no config read. This is a probe target, not a status page.

### `GET /api/projects` response

```jsonc
{
  "enabled": true,          // mirrors capabilities.multiProject
  "current": { "id": "…", "name": "cezar", "branch": "feat/x" },
  "peers": [
    { "id": "b7d2c1a0", "name": "other-repo", "branch": "main", "version": "1.4.0", "switchable": true },
    { "id": "c9e4f0b1", "name": "old-repo", "branch": "main", "version": "1.2.0", "switchable": false,
      "reason": "cezar v1.2.0 — restart this cockpit to switch" }
  ]
}
```

Dead peers are absent, not listed-and-greyed (Q3). Version-skewed peers *are* listed but not switchable — the distinction matters: "not running" is not actionable from here, "wrong version" is.

`enabled` mirrors `capabilities.multiProject`; the capability object is the single source of truth and `/api/projects` reads it rather than re-testing the env.

### `/api/health`

The route's own top-level shape is unchanged. Note one **additive** consequence: health returns `capabilities: capabilities()` (`server.ts:318`), so `multiProject` appears inside that object for free. Additive is safe — but the field is real, and BACKWARD_COMPATIBILITY.md §2 calls health "the most externally-depended-on JSON in the app", so it gets written down rather than discovered later. Discovery does not read it; `version` (`server.ts:309`) and `repoRoot` were the only things it might have wanted, and both now come from the registry file and `/api/instance`.

## API Contracts

| Route | Shape | Notes |
|---|---|---|
| `GET /api/instance` | above | New. Cheap by contract — adding a shell-out here silently breaks discovery. |
| `GET /api/projects` | above | `{ enabled: false, current, peers: [] }` when the flag is off. Never 404s — the UI asks unconditionally. |
| `ALL /p/:instanceId/*` | see below | Mounted unconditionally. |
| SSE `projects` event on `/api/events` | `{ peers: [...] }` | Emitted only on change. |

Proxy behaviour: forwards method, path suffix, query, body and headers minus hop-by-hop; streams the response back; strips hop-by-hop from the response and adds `x-accel-buffering: no` on `text/event-stream`. Errors follow the house `{ error }` convention exactly — 400 malformed id, 404 unknown/dead id, 409 version skew, 502 peer refused, 504 headers timeout, and 404 for `/p/*/api/*` when the flag is off.

## UI/UX

The chip today (`app-shell.tsx:239-246`) is a truncating mono line reading `{name} / {branch}`, `ml-auto` in a **fixed 264px sidebar** with ~150px of usable width, sitting beside `<BrandTile />` and the "cezar" wordmark. Space is the binding constraint.

- **No peers (or flag off):** unchanged. Same chip, same markup, no dropdown affordance. This is the common case and it must not regress.
- **Peers exist:** the chip becomes a `DropdownMenuTrigger` — same text, plus a `ChevronDownIcon`. `components/tools-menu.tsx` is the precedent for a chip-shaped trigger (status dot + label + chevron) and the house primitive is `@/components/ui/dropdown-menu`, already used by `OpenInMenu` and `ActionsKebab` in `run-header.tsx:37-43`.
- **Menu contents:** current project first (checked), then peers by name — each showing name, branch, and a disabled row with its reason when version-skewed. Selecting a peer navigates to `/p/<id>/`.
- **Naming collisions are real** — `basename(repoRoot)` is not unique (`~/work/api` and `~/personal/api`). When two names collide, disambiguate with the parent directory segment.
- **Accessibility and theming** come from the Radix primitive; the trigger must stay keyboard-reachable and the chevron must not break the truncation.

Switching is a full page load: the bundle re-mounts under the new basename and rebuilds its SSE connection. That is honest and cheap (~one page load), and the URL now names the project.

## Edge Cases & Failure Scenarios

| Scenario | Behaviour |
|---|---|
| Peer crashed (`SIGKILL`, stale file) | Probe fails, pid dead → file unlinked, absent from the dropdown. |
| **Peer alive but slow** | Probe times out, pid alive → **skipped, file untouched**. Returns next cycle. Deleting it would hide a live instance until restart. |
| **Port reused by a different repo** | Probe answers with a different `id`/`repoRoot` → entry not offered. Unlinked only if its pid is also dead. |
| Peer dies *while* you're switched to it | In-flight requests 502; the SSE stream ends and the existing `EventSource` retry loop takes over. The UI surfaces "this project stopped" and offers the current project. No crash on either side. |
| Peer accepts then wedges | 504 after the 10s headers timeout. SSE bodies are exempt by design. |
| Version skew | Listed, disabled, reason shown. Never proxied. Decided from the file — no probe. |
| Front-end proxy buffers SSE (VPS) | Prevented: the proxy sets `x-accel-buffering: no` itself, since `streamSSE` does not. |
| `~/.cezar` unwritable (read-only home, container) | Registration fails silently → the instance is invisible to peers but fully functional. Boot must not fail. Log once at boot, not per attempt. |
| Corrupt entry file | Skipped, never throws (`store.ts` rule). Not unlinked — an unparseable file may belong to a live newer instance. |
| Two instances race `pickPort` onto one port | The loser never answers the probe → not offered. |
| Flag off, stale `/p/<id>/` bookmark | 404 for `/p/*/api/*`; `/p/<id>/` redirects to `/`. Never the SPA shell — see the routing note. |
| Flag off, everything else | No registration, no proxying, no dropdown. Byte-identical UX to today. |
| Peer at a different repo root, same name | Disambiguated by parent dir in the menu. |
| Proxied `open-in-*` in VPS mode | Peer's own `capabilities.ts` 409s it, correctly — the peer owns the decision about its own host. |

## Risks & Impact Review

- **Rollback is two different stories, and only one is a flag flip.** For the registry, proxy and dropdown (Phases 1, 3, 4), unsetting `CEZ_MULTI_PROJECT` makes every new path dead; delete `~/.cezar` and it rebuilds. **The base-path change (Phase 2) is not flag-covered**: `send()`, four URL sites and `basename={apiBase}` ship unconditionally, because the flag is a server-side capability and the bundle is one artifact. Its rollback is a code revert. That asymmetry is why it lands as its own phase and its own PR, ahead of anything that depends on it.
- **The base-path change is the one real regression risk** — it touches the path every request in the app takes. `apiBase` is `''` in the normal case and that must stay perfectly inert; the assertion that root-relative behaviour is byte-identical to today is the gate for Phase 2, not a nicety.
- **New class of state.** Everything today is repo-local under `.ai/cezar/` or a throwaway cache. `~/.cezar` is the first cross-repo, cross-process, shared surface — and it is a **cross-version file format**, since a v1.5 instance reads a v1.2 instance's file. Optional-field discipline is a compat rule here, not a style preference.
- **A doctrine is being amended, not broken.** `client.ts:46-56` says there is no base URL. Same-origin survives; base-less does not. The docblock changes in the same commit as the code.
- **`/api/instance` has a performance contract.** It exists to be polled. The obvious future "improvement" — enriching it with env checks or git info — would reintroduce C1's subprocess storm. The route needs a comment saying so.
- **VPS exposure multiplies** (see Security). Flag-gated, documented in `.env.example`.
- **Not owned here:** the `pickPort` TOCTOU race and the bookmarklet's 10-vs-50 port gap. Both are surfaced by this work, both are pre-existing, both are separately fixable. The registry gives the bookmarklet a better source than a port scan — a natural follow-up once this ships.
- **The zero-config principle is deliberately broader than this feature** and ships as its own docs PR, not inside this spec's implementation — it is a repo-wide law binding future work and deserves review as doctrine rather than a Phase 4 checkbox. The draft lives in the appendix below.

## Research — what the market leaders do

The closest analogue is **JupyterHub**, and it validates this design almost line for line: it spawns per-user servers on loopback and routes them through a single public proxy at `/user/<name>/*` (configurable-http-proxy). Same shape — one reachable origin, N loopback backends, path-prefix routing, a registry mapping route → port. What we skip is everything multi-*user*: auth, spawning, culling, and CHP as a separate Node process. We are single-user on one machine, so the proxy is ~60 lines in-process. What we take: health-checked routes and path-prefix over cookie routing.

**Storybook Composition** (refs to other running Storybooks, surfaced in one sidebar) is the closest UI analogue and contributes the sharpest lesson: it hit **version skew** — one Storybook's UI driving another's API — and now warns explicitly on mismatch. That is precisely our A-bundle/B-server exposure, and it is why version equality is a hard gate here rather than a nice-to-have. This is the one thing the naive design would have missed.

**kubectl contexts** (`~/.kube/config`) and **Docker contexts** (`~/.docker/contexts`) confirm the ergonomic: a per-user file listing reachable endpoints, plus a fast switch. Both are *user-edited config* — which is exactly the line we don't cross. Ours is a side effect of running, never authored, never migrated, safe to delete. That difference is the zero-config principle in one sentence.

**Coder/Gitpod** proxy per-workspace over one origin — same conclusion as JupyterHub, at more cost than we need.

What they carry that we skip: auth, TLS termination, spawning/culling, cross-host routing, config files. What they get right that we're adopting: cheap dedicated liveness endpoints over rich status routes (JupyterHub), version-skew refusal (Storybook), path-prefix over cookie routing (both).

## Phasing

- **Phase 1 — Registry + discovery.** Instances register/deregister; `/api/instance` and `/api/projects` exist. No UI, no proxy. Nothing user-visible.
- **Phase 2 — Base path (unconditional).** `apiBase` plumbing lands alone, inert at `''`. Its own PR, because it is the only part the flag cannot protect.
- **Phase 3 — Proxy.** `/p/<id>/*` forwards; reachable by hand-typed URL.
- **Phase 4 — Dropdown + docs.**

Each phase leaves the app fully working. Phases 1, 3 and 4 are invisible with the flag unset; Phase 2 is invisible because `apiBase` is empty until a `/p/` URL exists.

## Implementation Plan

### Phase 1 — Registry + discovery

1. **`src/paths.ts`** — `cezarHomeDir()` → `process.env.CEZ_HOME ?? join(homedir(), '.cezar')`, `instancesDir()` → `<home>/instances`. Literal on every platform (Q4). `CEZ_HOME` exists so unit tests never touch a real home dir. Written so `skills-remote.ts` could adopt it later; do not refactor it now. *Test:* unit — default, and `CEZ_HOME` override.
2. **`src/instances/registry.ts`** — `writeEntry()` (mkdir `0700`, atomic tmp+`renameSync`, mode `0600`), `removeEntry()` (`unlinkSync`), `readEntries()` (readdir, zod-parse, skip corrupt). Schema: `id` `^[a-f0-9]{8}$`, `.max()` bounds on every string, new fields optional. *Test:* unit under `CEZ_HOME` — round-trip, corrupt file skipped, unwritable dir returns false without throwing, bad id rejected.
3. **`src/server/capabilities.ts`** — add `multiProject: env.CEZ_MULTI_PROJECT === '1'`, following the strict `=== '1'` convention and the existing pure-function-of-`env` shape (re-resolved per request, so flips are live and tests can toggle). Note this surfaces in `/api/health`'s `capabilities` object — additive, intended. *Test:* unit, both states.
4. **`GET /api/instance`** in `server.ts` — in-memory `{ id, version, repoRoot, branch }`. No `detectEnvironment()`, no git, no config. Comment the performance contract. *Test:* server unit — correct shape, and **asserts no subprocess is spawned** (the regression that would silently reintroduce the storm).
5. **`src/index.ts`** — generate the id, register after `pickPort` (`:115`) when the capability is on; `unlinkSync` in `shutdown` (`:129-134`, **must be sync**). Failures logged once and swallowed. *Test:* unit on the extracted helpers (`CEZ_HOME`-injected); the boot/`SIGTERM` round-trip belongs in `test/e2e/`, not the unit gate — AGENTS.md:32 says `npm test`/`test:unit` stay server-free.
6. **`src/instances/discover.ts`** — `listPeers()`: read entries, drop self and non-loopback; classify version mismatches from the file (no probe); probe the rest via `GET /api/instance` (800ms abort), cross-checking `id` **and** `repoRoot`; **unlink only when the probe failed and `process.kill(pid,0)` throws `ESRCH`**. *Test:* unit against a stub — dead peer unlinked; **slow peer with a live pid skipped and its file still on disk**; port-reused peer not offered; skewed peer listed unswitchable with zero network calls.
7. **`GET /api/projects`** — `{ enabled, current, peers }` reading `capabilities.multiProject`; `{ enabled: false, …, peers: [] }` when off. *Test:* server unit, both flag states.
8. **SSE `projects` event** — `unref()`'d ~10s timer re-running discovery, emitted on `/api/events` only when the peer set changes. *Test:* unit — emits on change, silent when stable.

### Phase 2 — Base path (its own PR)

9. **`web/app/src/api/client.ts`** — derive `apiBase` from `window.location.pathname` (`^/p/[a-f0-9]{8}`); prefix inside `send()`; export `withBase()`. Update the `:46-56` docblock: same-origin holds, base-less does not. *Test:* unit — `''` at root (**the critical assertion**: every existing path byte-identical to today), `/p/<id>` under a prefix, junk `/p/…` segment ignored.
10. **The four non-`send()` URL sites** — `withBase()` at `global-events.tsx:30`, `run-events.ts:91`, `runFileRawUrl` (`client.ts:286`), and the server-supplied `ThreadImage.url` at the render boundary in `thread-items.tsx:62,449`. *Test:* unit per site; the image ones assert a peer-supplied `/api/runs/…` URL renders prefixed.
11. **Router basename** — `basename={apiBase}` in `routes.tsx`. *Test:* unit; the full existing web suite must pass untouched.

### Phase 3 — Proxy

12. **`src/server/proxy.ts`** — `proxyHandler(deps)`: validate id (`^[a-f0-9]{8}$`, else 400); resolve via `listPeers()` (**never from the request**); 404 unknown/dead, 409 skew; forward method/path-suffix/query/body/headers minus hop-by-hop via global `fetch` with a 10s headers timeout (504); stream the body back; **strip hop-by-hop from the response** and add `x-accel-buffering: no` on `text/event-stream`; 502 on connection failure. *Test:* unit against a stub upstream — JSON round-trip; **SSE chunks stream through and the response carries `x-accel-buffering: no` and no upstream `connection`/`transfer-encoding`**; 400/404/409/502/504 paths; and **a request naming a foreign host/port cannot reach it**.
13. **Mount `app.all('/p/:instanceId/*')`** in `server.ts` **above the catch-all at `:1267`**, **unconditionally**: flag on → proxy; flag off → 404 `{ error }` for `/p/*/api/*`, redirect `/p/<id>/` → `/`. Flag on, non-API path → serve this instance's shell (never the peer's). *Test:* server unit — flag off ⇒ `/p/x/api/runs` is 404 JSON **not the SPA shell** (`static-ui.ts:39-45` would otherwise pass it to the catch-all); flag on ⇒ `/p/<id>/` returns our shell with our asset hashes; every existing route unaffected.

### Phase 4 — Dropdown + docs

14. **`useProjects()`** in `queries.ts` — `refetchInterval: false`, invalidated by the `projects` SSE event. Do not add an interval; `queries.ts:143-146` is the standing precedent. *Test:* unit — SSE event invalidates.
15. **`ProjectSwitcher`** — `DropdownMenu` from `@/components/ui/dropdown-menu`; plain chip when `peers` is empty. Collision-disambiguate by parent dir; disabled rows carry the skew reason. *Test:* unit — no peers ⇒ markup identical to today; peers ⇒ trigger + rows; skewed row disabled; collisions disambiguated.
16. **Wire into `app-shell.tsx:239-246`** via `app-shell-container.tsx` (keep `AppShell` presentational — it takes `repo?: RepoChip | null` today and should keep taking data, not fetching). Navigate to `/p/<id>/` on select. *Test:* unit + the existing app-shell suite.
17. **Peer-died handling** — surface the 502/stream-end as "this project stopped" with a way back. *Test:* unit against a stubbed failure.
18. **`.env.example`** — a `# ---- multi-project ----` section for `CEZ_MULTI_PROJECT=1`, matching the commented-out-with-prose style, stating the VPS exposure consequence. Mention `CEZ_HOME` under `testing / internal`.
19. **README** — `### Multi-project` under `## Configuration (optional)` (append near `:341`, before the `---`). Env vars live only in `.env.example` today, so a small env table here is a new precedent — keep it to `CEZ_MULTI_PROJECT` and `CEZ_REMOTE`.
20. **`BACKWARD_COMPATIBILITY.md`** — §6 requires a new compat surface to gain a section *first*. Add: the `~/.cezar` entry format (cross-version, optional-field rule), `/api/instance` and its cheapness contract, `/api/projects`, `/p/*`, the `projects` SSE event name, `CEZ_MULTI_PROJECT`, and health's new `capabilities.multiProject`.
21. **AGENTS.md** — a routing-table row for `~/.cezar` / multi-project pointing at `src/instances/`. (The zero-config principle section ships separately as a docs PR — see the appendix — since it is repo-wide doctrine, not part of this feature.)

### Validation

`npm run typecheck && npm test && npm run test:unit && npm run build && npm run test:package`, per AGENTS.md. Phases 2–4 touch the cockpit, so `npm run test:e2e` runs at spec completion — note its exit contract: `TEST_E2E_STATUS=skipped` exits 0 but is **not** a pass.

## Appendix — the zero-config principle (for AGENTS.md)

To be added as a top-level section:

> ## Zero config
>
> cezar ships no config file the user must create and no setting they must set before it works. Every capability is discovered from what is already there — the repo, the environment, `gh`, the running processes — or it degrades quietly to a smaller cezar. `.ai/cezar/config.json` is optional and every key has a working default; `.env` is never auto-loaded.
>
> New state may be **written**, never **required**: `.ai/cezar/`, `~/.cache/cez/`, `~/.cezar/`. Delete any of them and cezar rebuilds what it needs on the next run. State that a user must author, migrate, or repair is not state — it is configuration, and it needs a reason.
>
> Practical rules:
> - When a feature seems to need configuration, the design is wrong. Discover it, or default it.
> - Features that widen exposure or cost (network, other processes) are opt-in behind a `CEZ_*` flag, off by default — the zero-config default is also the safe default.
> - A missing dependency, an absent peer, a read-only home: degrade to a smaller working cockpit, never fail the boot.
> - Prefer a proxy-free, daemon-free mechanism when one exists — and when it doesn't, keep the mechanism invisible: no process to manage, no port to remember, no file to edit.
> - Never trade a working default for a knob.
