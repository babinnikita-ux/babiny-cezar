# Publishable Cezar React components for composable embedding

> Companion to `.ai/specs/2026-07-23-independent-server-web-packages.md`.
> That spec deliberately excluded the reusable-React-components half of #557; this spec owns
> that half. It also consumes the shared transcript boundary designed in
> `.ai/specs/2026-07-21-shared-session-renderer.md`.

## TLDR

Cezar's cockpit is a private React SPA, not a component library. Even after the server, web
application, and API contract were separated into `packages/{cezar,web,api-client}`, another
application still cannot install Cezar and compose its task list, task creator, live session,
changes, repository, GitHub, workflow, skill, inbox, or settings surfaces.

Add a fourth workspace, `packages/react`, published as
`@open-mercato/cezar-react`. It exports connected feature components backed by an explicit
`CezarClient`, selected client-independent presentation components, an isolated
`CezarProvider`, scoped compiled CSS, a router-neutral navigation contract, and an optional
React Router adapter. The private `@open-mercato/cezar-web` cockpit becomes the reference
consumer of exactly those public exports.

The dependency direction is:

```text
@open-mercato/cezar-web (private reference cockpit)
                    |
                    v
@open-mercato/cezar-react (public React components)
                    |
                    v
@open-mercato/cezar-api-client (public transport and contract)
```

The API client must be stabilized and published before, or in the same release as, the React
package. The component package never imports private SPA modules, assumes a root URL, creates a
global client, or changes the host application's document styles.

## Resolved decisions (confirmed with owner 2026-07-27)

1. **Create a separate public React package.**
   `@open-mercato/cezar-react` owns the embeddable contract.
   `@open-mercato/cezar-web` remains the private executable/reference SPA. Publishing the
   existing web workspace as both an application and a library is rejected because its router,
   boot process, providers, and internal modules would become accidental public API.
2. **Expose every major cockpit area.** The first public release covers tasks, new-task
   creation, live sessions and review, task changes/files/commits, repository views, GitHub,
   workflows, skills, inbox, project settings, global settings, the shell, and a complete
   cockpit composition. It is not a task-session-only package.
3. **Connected components are the primary API.** A consumer supplies one `CezarClient` to
   `CezarProvider`; feature components fetch, subscribe, mutate, retry, and reconcile through
   that provider. Selected presentation components such as `SessionTranscript` and `Diff`
   remain client-independent and accept typed props.
4. **Core components are router-neutral.** They navigate through semantic
   `CezarLocation` values and an injected navigation adapter. An optional `/router` entry point
   integrates with React Router without creating or owning the host's `BrowserRouter`.
5. **Cezar's visual design is the default, isolated beneath one root.** Consumers import a
   compiled stylesheet. All selectors, utilities, resets, typography, scroll behavior, and
   appearance attributes are scoped beneath `.cezar-root`; documented `--cezar-*` custom
   properties let the host retheme it.
6. **The client and query runtime are explicit and instance-scoped.** There is no module-level
   API client or cache. `CezarProvider` creates an isolated TanStack Query client by default and
   accepts one when the host deliberately wants to supply it.
7. **Customization is intentional rather than exhaustive.** Major components expose
   `className`, semantic callbacks, action interception where useful, and a small set of
   documented slots such as header actions, empty state, or footer. Internal shadcn primitives,
   Radix wrappers, table rows, and private orchestration components are not public.
8. **The API client is published first or atomically with React.** The React package depends at
   runtime on `@open-mercato/cezar-api-client`; npm must never receive a React package whose
   dependency remains private.
9. **The shipped cockpit uses the public contract.** Every standard cockpit screen is composed
   from the same exports available to another application. A second private rendering path is
   not allowed.
10. **React 19 is the first-release peer floor.** The current cockpit is on React 19, so the
    initial peer contract is `react >=19 <20` and `react-dom >=19 <20`. Broader compatibility
    may be added only after it has its own cold-consumer and behavior coverage.

## Problem statement

The package split from the independent-server spec created the correct coarse dependency
boundary but not a reusable UI boundary:

- `packages/web/package.json` is private and builds an application rather than a library.
- `packages/web/src/app.tsx` constructs its own query client, global event provider,
  appearance providers, `BrowserRouter`, shell, routes, notifications, and toast outlet as one
  root composition.
- Major route components import application-local API functions, query hooks, project router
  helpers, providers, toasts, navigation hooks, and other route modules. Importing one route
  directly would depend on private wiring that another application cannot correctly reproduce.
- The cockpit's stylesheet contains document-level height, overflow, typography, scrollbar,
  reset, and theme rules. Loading it unchanged would take over the embedding application's
  document.
- Radix portals currently assume the application owns the document-level overlay surface.
- `@open-mercato/cezar-api-client` is private and currently exposes a partial typed Hono client
  plus shared DTO/protocol/helpers. Much of the rich request, subscription, cache, and error
  layer still lives in `packages/web/src/api`.
- The current SPA assumes root-relative routes and same-origin service access. An embed needs a
  configurable service authority and a host-owned URL/layout.

Copying route components into another application is not an acceptable workaround: it forks
the reducer, live-update behavior, capability degradation, tool presentation, styling, and bug
fixes that the public package is meant to centralize.

## Existing contracts to preserve

- The zero-config local cockpit remains the default product. No environment variable, config
  file, account, proxy, or remote service becomes required.
- `@open-mercato/cezar` remains the server and CLI package and continues to ship the built
  reference cockpit under `web/dist`.
- The API wire surface, legacy aliases, versioned routes, project scoping, SSE vocabulary, and
  WebSocket demand-driven subscription rules remain governed by
  `.ai/specs/2026-07-23-independent-server-web-packages.md`, `AGENT_PROTOCOL.md`, and
  `BACKWARD_COMPATIBILITY.md`.
- `@open-mercato/cezar-api-client` remains Node-free by construction.
- The shared `SessionTranscript` is the one session rendering pipeline for both main and
  sub-agent sessions. This spec publishes that boundary; it does not create another transcript
  renderer.
- The current cockpit URL scheme and visual behavior remain compatibility baselines for the
  private reference application.
- Light, dark, system, accent, density, mobile safe-area, keyboard, focus, and reduced-motion
  behavior remain supported.

## Goals

- Another React application can install the public API-client and React packages and render any
  major Cezar feature without importing from the repository or copying source.
- A consumer can arrange major features in its own layout and drive navigation without using
  React Router.
- A consumer that wants the standard cockpit can mount one `CezarCockpit` and, optionally, the
  React Router adapter beneath any base path.
- Connected components share one explicit client, project scope, query runtime, live-event
  runtime, capability state, storage adapter, navigation adapter, and appearance boundary.
- Presentational exports remain usable with supplied typed data and no service connection.
- Cezar's default design renders correctly without the consumer installing or configuring
  Tailwind.
- Host styles and Cezar styles do not take over one another.
- The reference cockpit consumes the public package so parity is architectural rather than
  documented intention.
- Packed-package tests prove the public exports work outside the npm workspace.
- Public types and subpath exports follow semver; private implementation remains freely
  refactorable.

## Non-goals

- No framework-neutral Web Component, iframe API, Vue/Svelte wrapper, or non-React renderer.
- No public export of every shadcn primitive, Radix wrapper, hook, utility, row renderer, or
  private route component.
- No visual redesign of the cockpit.
- No server wire, persistence, workflow, runner, or agent-protocol change solely for packaging.
- No requirement that a host use Cezar's shell, routes, project switcher, query client, storage,
  theme, or notifications.
- No first-release guarantee of server-side rendering. Package modules must be safe to import
  without touching browser globals, but interactive rendering remains a browser capability.
- No promise that arbitrary private CSS selectors or DOM structure are stable. Public
  component props, callbacks, slots, semantic attributes, entry points, and documented
  `--cezar-*` tokens are the contract.
- No compatibility promise for React versions below 19 in the first release.

## Alternatives considered

### Publish `@open-mercato/cezar-web` as both application and library

Rejected. It minimizes initial file movement but makes application boot, root routing, lazy
route chunks, same-origin defaults, and private provider composition part of a published
contract. A consumer importing one component could also pull application-only dependencies
and behavior. The private reference SPA and public library have different responsibilities and
need separate manifests and export maps.

### Ship an iframe or custom element

Rejected as the primary contract. It provides strong runtime and style isolation but cannot
compose a task list beside a host panel, put a session inside a host detail view, or replace the
standard shell with the host's navigation. It solves whole-application embedding, not reusable
React components.

### Publish only low-level visual primitives

Rejected. It would make every consumer rebuild data fetching, mutation behavior, cache keys,
live reconciliation, project scope, capability handling, and navigation. The connected
feature is the reusable unit; leaf primitives are implementation details unless they have
independent value, as `Diff` and `SessionTranscript` do.

## Architecture

### Package roles

#### `@open-mercato/cezar-api-client`

The browser-safe transport and contract package. It owns:

- `createCezarClient`;
- the stable `CezarClient` interface;
- configurable base URL, headers, authentication, and transport injection;
- workspace-level and project-scoped domain operations;
- `ApiError`;
- DTO and agent-protocol types;
- SSE parsing/subscriptions and reconnect primitives;
- the ref-counted WebSocket topic bus;
- project-scope path helpers;
- optional raw typed Hono RPC access.

React components depend on stable domain operations, not directly on Hono's generated property
chain. This prevents a route-registration refactor from leaking across every component. Raw RPC
remains available for advanced consumers and contract work.

The client package has no React, DOM-at-import-time, Node runtime, cache, theme, or navigation
dependency. Browser transport constructors are resolved lazily or injected.

#### `@open-mercato/cezar-react`

The public React component package. It owns:

- `CezarProvider` and its contexts;
- query hooks and cache-key definitions;
- connected feature components;
- selected presentation components;
- live-event controllers and query reconciliation;
- semantic navigation contracts;
- the optional React Router adapter;
- appearance, storage, notification, and portal adapters;
- scoped compiled CSS and packaged font assets;
- the standard `CezarShell` and `CezarCockpit` compositions.

It may depend on browser UI libraries, but each feature entry point must remain independently
tree-shakeable. It may not import any path owned by `packages/web`.

#### `@open-mercato/cezar-web`

The private reference application. Its responsibilities shrink to:

- create the service client for the bundled same-origin case;
- select the standard storage, notifications, and browser-router adapters;
- mount `CezarCockpit`;
- retain the static document and pre-paint boot script;
- produce `packages/cezar/web/dist` for the server package.

Application-specific redirects and backward-compatible top-level URLs may live here or in the
public router adapter when they are generally useful. Feature rendering cannot be duplicated
here.

#### `@open-mercato/cezar`

Unchanged in role: server, CLI, headless runner, and owner of the bundled reference-cockpit
artifact. It must not gain a runtime React dependency.

### Workspace layout

```text
packages/
  api-client/
    src/
      client.ts
      domains/
      protocol/
      subscriptions/
      utils/
  react/
    package.json
    src/
      core/
        provider.tsx
        navigation.ts
        runtime.ts
        storage.ts
        appearance.tsx
        portal.tsx
      features/
        tasks/
        session/
        git/
        github/
        workflows/
        skills/
        inbox/
        settings/
        shell/
      router/
      styles/
      index.ts
  web/
    src/
      app.tsx
      main.tsx
      routes.tsx
```

The exact file split may become finer during implementation, but the direction is fixed:
feature implementation moves into `packages/react`; `packages/web` is a consumer.

## Public package surface

### Export map

The first public release exposes these stable entry points:

| Entry point | Public exports |
| --- | --- |
| `@open-mercato/cezar-react` | `CezarProvider`, provider props, adapters, public shared types |
| `@open-mercato/cezar-react/tasks` | `TaskList`, `TaskOverview`, `NewTask` |
| `@open-mercato/cezar-react/session` | `TaskSession`, `SessionTranscript`, `RunHeader`, `ReviewControls` |
| `@open-mercato/cezar-react/git` | `TaskChanges`, `TaskFiles`, `TaskCommits`, `RepositoryView`, `Diff` |
| `@open-mercato/cezar-react/github` | `GitHubView`, `GitHubList`, `GitHubDetail` |
| `@open-mercato/cezar-react/workflows` | `WorkflowList`, `WorkflowEditor` |
| `@open-mercato/cezar-react/skills` | `SkillsBrowser`, `SkillDetail` |
| `@open-mercato/cezar-react/inbox` | `Inbox` |
| `@open-mercato/cezar-react/settings` | `ProjectSettings`, `GlobalSettings` |
| `@open-mercato/cezar-react/shell` | `CezarShell`, `CezarCockpit` |
| `@open-mercato/cezar-react/router` | `CezarRouter`, React Router adapter helpers |
| `@open-mercato/cezar-react/styles.css` | compiled isolated theme, utilities, and component styles |

The export map rejects private deep paths. Adding a file under `src/features` does not publish
it. A new public component requires an explicit barrel/export-map change, documentation, type
coverage, and packed-consumer coverage.

### Provider

The core provider contract is:

```ts
export interface CezarProviderProps {
  client: CezarClient
  projectId?: string | null
  queryClient?: QueryClient
  navigation?: CezarNavigationAdapter
  storage?: CezarStorage
  notifications?: CezarNotifications
  theme?: 'light' | 'dark' | 'system'
  accent?: 'lime' | 'violet'
  density?: 'comfortable' | 'compact' | 'ultra'
  className?: string
  onError?: (error: ApiError) => void
  onAuthRequired?: (error: ApiError) => void
  children: ReactNode
}
```

`projectId` selects the project scope for connected descendants. `null` or absence means the
boot/default project contract, preserving the unscoped local-cockpit behavior. The complete
cockpit may control this value while showing a project switcher; an embedded feature can stay
bound to the host-selected project.

The provider creates an isolated `QueryClient` when none is supplied. It creates no
module-global cache or transport. Cache keys include a stable client identity and project
scope so two services or projects cannot collide inside a supplied cache.

The provider renders a `.cezar-root` element and a descendant portal container. It owns the
appearance attributes only for that subtree.

### Client construction

The stable construction surface supports remote, same-origin, test, and wrapped transports:

```ts
const client = createCezarClient({
  baseUrl: 'https://cezar.example.test',
  auth: {
    getToken: () => session.accessToken,
  },
  headers: {
    'X-Host-Product': 'sandbox',
  },
  fetch: hostFetch,
})
```

`auth.getToken` may return the current token or a promise of it. The React package does not own
credential persistence. A `401` becomes `ApiError` and invokes `onAuthRequired`; the host
decides whether to display its login, refresh a token, or navigate elsewhere.

The client groups operations by stable domains:

```text
client.workspace
client.runs
client.workflows
client.skills
client.repository
client.github
client.settings
client.events
client.rpc
```

Project-aware operations use the provider's scope rather than accepting a raw URL prefix at
every call. The internal representation may use `client.forProject(projectId)`, scoped options,
or both, but React components see one typed project-aware client from context.

### Connected and presentation components

Connected components:

- read client, project, cache, live runtime, capabilities, navigation, storage, appearance, and
  notifications from the provider;
- own their query and mutation lifecycles;
- render accessible loading, empty, unavailable, retry, and failure states;
- accept direct identifiers such as `runId`, `workflowId`, or GitHub item number;
- emit semantic navigation and action callbacks;
- never require the standard shell.

Presentation components:

- accept typed values and callbacks through props;
- do not fetch, subscribe, navigate, or mutate through hidden globals;
- may still use the provider's appearance/portal boundary when mounted beneath it;
- document any provider requirement explicitly.

`SessionTranscript` and `Diff` are presentation-first exports. `TaskSession` and `TaskChanges`
are their connected feature counterparts.

### Common customization contract

Every major component accepts `className`. Components expose semantic callbacks where the host
may need interception, such as:

- `onNavigate`;
- `onSelectRun`;
- `onCreated`;
- `onReview`;
- `onOpenFile`;
- `onOpenExternal`;
- `onProjectChange`.

A component may expose a typed `slots` prop only for stable composition regions with clear
layout ownership, such as `headerActions`, `empty`, or `footer`. Slot props carry the data and
actions needed by that region. Arbitrary internal component replacement and render-prop access
to private state are excluded from the first release.

## Feature coverage

| Area | Connected public surface | Selected presentation surface |
| --- | --- | --- |
| Tasks | task overview/list, filters, archive/title actions | task status/diff-stat display where independently useful |
| New task | task composer, workflow/skill/runner/model selection, plan review | composer building blocks only when they have a stable standalone contract |
| Session | run loading, replay/live stream, follow-up, asks, agents, plan, review | session transcript, run header, review controls |
| Task git | changes, files, commits, commit/push/PR actions | diff and file/commit displays |
| Repository | repository changes, branches, commits | diff/file presentation shared with task git |
| GitHub | list/filter/detail, checks/comments/changes, hand-to-agent actions | item/detail presentation where stable |
| Workflows | list, editor, validation, create/update/delete | workflow editor subregions only when stable |
| Skills | search, detail, import/update state | skill detail |
| Inbox | attention queue and actions | no additional first-release primitive |
| Settings | project and global section registries and panels | settings field only if a second public consumer appears |
| Shell | desktop/mobile navigation, project switcher, banners, command palette | shell layout slots |

All listed connected areas must be available before the package loses `private`. The migration
may land feature by feature while private.

## Navigation and routing

### Semantic location

Core feature components do not import React Router. Navigation uses:

```ts
export type CezarLocation =
  | { area: 'tasks' }
  | { area: 'new-task'; template?: string }
  | {
      area: 'task'
      runId: string
      tab?: 'session' | 'changes' | 'files' | 'commits'
    }
  | { area: 'repository'; section?: 'changes' | 'branches' | 'commits' }
  | { area: 'github'; kind?: 'issue' | 'pr'; number?: number }
  | { area: 'workflows'; workflowId?: string }
  | { area: 'skills'; skillId?: string }
  | { area: 'inbox' }
  | {
      area: 'settings'
      scope: 'project' | 'global'
      section?: string
    }

export interface CezarNavigationAdapter {
  href(target: CezarLocation): string | undefined
  navigate(target: CezarLocation, options?: { replace?: boolean }): void
}
```

`href` preserves anchor behavior, including open-in-new-tab and link copying. When it returns
`undefined`, a component may render a button that calls `navigate`.

An individual component-level callback takes precedence over the provider adapter for the
corresponding action. This lets a host intercept a selection without replacing navigation for
the rest of the subtree.

### Complete compositions

Without a router:

```tsx
<CezarProvider client={client} projectId={projectId}>
  <CezarCockpit
    location={location}
    onNavigate={setLocation}
    onProjectChange={setProjectId}
  />
</CezarProvider>
```

With the optional adapter:

```tsx
<CezarProvider client={client} projectId={projectId}>
  <CezarRouter basePath="/automation/cezar">
    <CezarCockpit onProjectChange={setProjectId} />
  </CezarRouter>
</CezarProvider>
```

`CezarRouter` consumes an existing React Router context. It never creates `BrowserRouter` and
therefore never owns browser history. It maps semantic locations onto Cezar's current
project-aware route scheme beneath `basePath`, preserving deep links and query/hash state. As a
descendant of `CezarProvider`, it supplies the navigation/location adapter for its subtree and
overrides no client, project, cache, or appearance context.

The private reference application supplies `basePath="/"` and retains all backward-compatible
redirects required by the cockpit.

## Styling and layout isolation

### Compiled stylesheet

Consumers import:

```ts
import '@open-mercato/cezar-react/styles.css'
```

They do not install Tailwind, add Cezar source paths to a scanner, or copy a token file. The
published stylesheet contains the styles needed by every public entry point.

All ordinary selectors, generated utility selectors, reset rules, typography, scrollbars, and
animations are scoped beneath `.cezar-root`. No selector targets the host's `html`, `body`,
application root, or unscoped element tree.

`@font-face` rules use Cezar-specific family names and packaged font assets. They do not change
the host's font-family.

### Theme contract

The provider boundary carries `data-cezar-theme`, `data-cezar-accent`, and
`data-cezar-density`. System theme observation updates only that boundary.

Documented custom properties use the `--cezar-*` namespace:

```css
.host-cezar {
  --cezar-primary: var(--host-brand);
  --cezar-background: var(--host-surface);
  --cezar-radius-md: 6px;
}
```

The public token list covers color roles, typography families, radii, shadows, and density.
Private intermediate tokens may change without semver impact.

### Portals

Dialogs, sheets, popovers, command menus, tooltips, and toasts render into a provider-owned
portal element beneath `.cezar-root`, not directly under `document.body`. This preserves theme
and selector scope while retaining Radix focus trapping, Escape behavior, overlay interaction,
and focus restoration.

The provider may accept a deliberate portal-container override for a host with an established
overlay layer. The target must still carry the Cezar root/theme boundary.

### Layout

Feature components fill or size to their assigned container. They do not assume `100dvh`,
disable document scrolling, or change safe-area ownership.

`CezarCockpit` can fill its container and reproduce the standard desktop/mobile shell.
Full-height behavior applies to that container only. Scroll ownership stays inside the relevant
feature or shell region.

Shadow DOM is not used. Scoped selectors, namespaced tokens, and provider-owned portals give
the necessary isolation without breaking host theming, focus management, measurement, or
accessibility.

## Data flow and live behavior

```text
host creates CezarClient
          |
          v
    CezarProvider
 client · project · query cache · adapters · live runtime
          |
          +--------------------+
          |                    |
          v                    v
 connected feature      presentation component
 query/mutation/live        typed props only
          |
          v
 @open-mercato/cezar-api-client
 HTTP · SSE · WebSocket subscriptions
```

One provider subtree gets one live runtime for its client instance:

- the workspace/global event stream is mounted once when the connected subtree requires it;
- per-run SSE streams are demand-driven by mounted session consumers;
- WebSocket topic publishers retain the existing `0 -> 1` start and `1 -> 0` stop discipline;
- listeners are reference-counted so multiple mounted readers do not open duplicate sockets;
- reconnect uses bounded backoff;
- cached data remains visible while disconnected;
- reconnect and visibility restoration perform authoritative reconciliation.

Multiple explicit `CezarProvider` instances are independent by design. A host that wants one
runtime supplies one provider around all composed features.

Query keys include client identity, workspace/project scope, domain, and resource identity.
They never rely on the private SPA's current `'default'` convention alone.

## Storage, notifications, and browser capabilities

Appearance mirrors, drafts, dismissed banners, list preferences, and other browser state go
through a `CezarStorage` adapter. The default browser adapter uses namespaced keys derived from
the client identity and project scope. A memory adapter is available for tests and ephemeral
embeds.

Desktop notifications and external-opening behavior go through adapters. The component package
does not request notification permission, open native applications, or navigate the top-level
window without an explicit user action and a supporting capability.

Browser globals are resolved inside effects or event handlers. Importing a package entry point
in a non-DOM build must not throw.

## Errors, authentication, and capability degradation

- Network and non-success API responses become `ApiError` with status, safe message, request
  context, and parsed server error when available.
- Connected components retain cached data during transient failures and show a local retry
  state rather than crashing the host tree.
- `CezarProvider.onError` receives reportable failures after component-local handling.
- A `401` also invokes `onAuthRequired`. The component package does not prescribe token storage
  or force the reference cockpit's login UI on an embed.
- Authentication tokens are requested from the client auth adapter at request time and are
  never copied into React persistence by default.
- Capability-dependent actions use the server's capability response. An unavailable action is
  hidden or disabled with explanatory copy according to the existing cockpit behavior.
- Missing optional peers affect only their entry point: importing core/features does not
  require React Router.
- An unsupported or disconnected live channel degrades to cached HTTP data plus
  reconciliation; it does not make unrelated components unusable.
- Component error boundaries isolate unexpected rendering errors at the major-feature boundary
  in `CezarCockpit`. Individually embedded components may expose or include the same boundary
  without swallowing programmer errors in callbacks.

## Package and build contract

`@open-mercato/cezar-react` publishes ESM JavaScript, declaration files, CSS, and font assets.
Its export map lists every supported entry point. The package marks only its stylesheet as a
side effect so JavaScript feature imports remain tree-shakeable.

First-release peers:

```json
{
  "peerDependencies": {
    "react": ">=19 <20",
    "react-dom": ">=19 <20",
    "react-router": ">=7 <8"
  },
  "peerDependenciesMeta": {
    "react-router": {
      "optional": true
    }
  }
}
```

Only the `/router` entry point requires the optional React Router peer.
TanStack Query, Radix, icons, markdown/diff dependencies, and feature-specific libraries belong
to the React package that imports them. Feature subpaths and dynamic boundaries ensure that
importing tasks does not pull the markdown highlighter or workflow drag-and-drop implementation.

The root workspace build order becomes:

```text
api-client -> react -> cezar server -> web reference app -> package checks
```

The release publish order is:

```text
api-client -> react -> cezar server/CLI -> alias package
```

`packages/web` stays private. API-client and React package versions are stamped in lockstep
with the release. The release pipeline continues to use the manifest's `private` flag as the
publication gate.

## Migration plan

Implementation is incremental, while publication waits for complete major-feature coverage.

### Phase 0 — Stabilize and publish the API client

- Move the rich request layer, `ApiError`, project-aware domain methods, run/workspace SSE, and
  the WebSocket topic bus from `packages/web/src/api` into `packages/api-client`.
- Complete the relevant route typing/single-source work from Phase 3 of
  `.ai/specs/2026-07-23-independent-server-web-packages.md`.
- Preserve same-origin defaults and the current reference cockpit behavior.
- Make the package public only when every operation required by the React package has a stable
  public type and packed-consumer coverage.

### Phase 1 — Private React package foundation

- Add `packages/react` as a private workspace.
- Add provider, adapters, cache-key namespace, live runtime, public types, export map, build,
  test, and scoped-style pipeline.
- Add dependency-direction checks that reject imports from `packages/web`.
- Add cold-consumer fixtures while the package remains private in release metadata.

### Phase 2 — Migrate feature families

Move and adapt features in dependency order:

1. tasks and task creation;
2. shared session renderer, connected task session, agents, plan, follow-up, asks, and review;
3. task changes/files/commits and repository views;
4. GitHub;
5. workflows and skills;
6. inbox and settings;
7. shell, project switching, command palette, banners, and complete cockpit.

Each family:

- moves its reusable implementation into `packages/react`;
- replaces private API and router imports with public provider/navigation contracts;
- adds a public subpath only for the approved exports;
- migrates `packages/web` to consume that subpath in the same change;
- retains focused behavior and visual coverage;
- remains independently tree-shakeable.

### Phase 3 — Reference application cutover

- Reduce `packages/web/src/app.tsx` to client/adapters/router creation and public composition.
- Remove private feature implementations and alternate render paths.
- Keep legacy URL redirects and bundled same-origin boot behavior.
- Run visual and E2E parity for every cockpit area.

### Phase 4 — Publish

- Verify every feature listed in the coverage table from a cold consumer.
- Pack API-client and React tarballs, install them outside the workspace, typecheck, build, and
  render a composed host fixture.
- Remove `private` from `packages/react` and, if not already done, `packages/api-client`.
- Publish in dependency order.
- Document installation, provider setup, individual feature composition, controlled cockpit,
  router integration, theming, auth, and version compatibility.

## Testing strategy

### Unit and type tests

- A typed fake `CezarClient` drives every connected component without a server.
- Every feature covers loading, success, empty, unavailable, retry, auth-required, and mutation
  failure behavior applicable to it.
- Public type tests compile documented examples and reject invalid identifiers, locations,
  slots, callbacks, and provider props.
- Exhaustive switches cover `CezarLocation` and public discriminated unions.
- Import-boundary tests reject references from `packages/react` to `packages/web` and reject
  Node imports in API-client.

### Integration tests

- Mount connected features against the real Hono application through an injected fetch.
- Verify workspace/default/project scope and cache isolation.
- Verify mutations patch or invalidate the correct scoped cache.
- Verify one global stream per provider, demand-driven run streams, WebSocket topic
  reference-counting, reconnect, visibility reconciliation, and cleanup on unmount.
- Verify `401`, other `ApiError` statuses, `onError`, `onAuthRequired`, and capability
  degradation.
- Verify provider-owned portals, focus restoration, Escape/overlay close, keyboard scrolling,
  and accessible labels.

### Styling and composition tests

- Build a host fixture with conflicting global element rules, Tailwind-like utility class names,
  light/dark styles, fonts, scrolling, and overlay z-index.
- Assert the host remains unchanged and Cezar renders with its scoped defaults.
- Assert documented `--cezar-*` overrides retheme only the provider subtree.
- Render two differently themed providers on one page.
- Render feature components in constrained panels and responsive containers.
- Verify portal content remains inside the correct theme/root boundary.

### Packed-consumer tests

- Pack API-client and React workspaces.
- Install both tarballs into a temporary application outside the monorepo.
- Typecheck and build:
  - a task-list-only embed;
  - a task list plus selected task session;
  - a workflow/skills composition;
  - a controlled complete cockpit without React Router;
  - a routed cockpit below a non-root base path.
- Verify package exports, CSS, fonts, optional-router behavior, peer errors, and absence of private
  deep imports.
- Inspect output chunks so a task-list-only build does not contain Shiki/Streamdown or dnd-kit.

### Reference-cockpit regression

- Run the existing typecheck, Vitest, `node:test`, build, package, and package-install gates.
- Run the real-browser cockpit E2E suite across tasks, new task, session, git, GitHub, workflows,
  skills, inbox, settings, project switching, theme, mobile navigation, and live updates.
- Preserve current route behavior and visual baselines unless a separate approved spec changes
  them.

## Security and privacy

- Client base URL, auth, and headers are explicit instance configuration.
- No token is logged, placed in a semantic navigation target, or persisted by the React package
  without a host adapter.
- The API client's remote-auth behavior remains governed by the independent-server spec.
- Scoped components do not weaken server origin, host, CSRF, CORS, or capability checks.
- Rich content continues through the existing safe markdown/diff rendering paths; the component
  package does not accept backend-authored HTML as trusted markup.
- External URLs and native-open actions retain validation and explicit user-action requirements.
- Multiple provider instances do not share cache, events, storage, or credentials unless the
  host deliberately supplies shared adapters.

## Risks and mitigations

### A broad public surface can freeze internals

Mitigation: publish feature-level contracts through explicit subpaths, keep leaf primitives and
route implementation private, use semantic callbacks and typed slots, and make the private
reference app consume the public API before release.

### API-client instability blocks React publication

Mitigation: Phase 0 is a hard dependency. The React manifest stays private until the complete
domain client is public and packed-consumer tested. Raw Hono RPC remains advanced; components
use stable domain methods.

### Route modules are currently highly coupled

Mitigation: migrate by feature family, replacing router/API globals at the boundary rather than
copying files wholesale. The private web app switches to the public feature in the same change,
preventing two long-lived versions.

### CSS leakage or host overrides break embeds

Mitigation: scope resets and generated utilities, namespace tokens, own portals beneath the
root, test hostile host CSS, and forbid document-level selectors in the published stylesheet.

### Bundle size grows when all features are available

Mitigation: stable feature subpaths, side-effect discipline, route/feature lazy loading in
`CezarCockpit`, and packed-consumer chunk assertions for known heavy libraries.

### Duplicate live connections or cache collisions

Mitigation: instance-scoped runtime, reference-counted subscriptions, client/project cache-key
namespaces, cleanup tests, and one provider around the standard composition.

### Reference cockpit behavior drifts during extraction

Mitigation: the reference cockpit consumes each public feature immediately, while existing
focused tests, route tests, screenshots, and real-browser E2E remain the compatibility gate.

## Acceptance criteria

The work is complete when:

1. `@open-mercato/cezar-api-client` and `@open-mercato/cezar-react` are public, installable npm
   packages with working packed-consumer fixtures.
2. A separate React 19 application can create one client, mount `CezarProvider`, and independently
   compose every major feature listed in this spec using only public imports.
3. Beneath the same provider, the application can mount `CezarCockpit` in controlled mode
   without React Router.
4. A React Router host can mount the optional adapter beneath a non-root base path and deep-link
   to project, task, repository, GitHub, workflow, skill, inbox, and settings locations.
5. Host document styles, typography, scrolling, theme, and portals remain unchanged outside
   `.cezar-root`.
6. Two providers can render different services/projects/themes on one page without cache,
   connection, storage, credential, or CSS leakage.
7. `@open-mercato/cezar-web` contains no private alternative implementation of a published
   feature and builds the standard cockpit entirely from public component exports.
8. The server/CLI package still ships and serves the cockpit, headless operation still works,
   and local zero-config behavior is unchanged.
9. A task-list-only consumer does not bundle unrelated markdown/highlighter or workflow
   drag-and-drop code.
10. Repository validation, packed-package tests, and the real-browser reference-cockpit suite
    pass.

## Design closure

No product-level design questions remain open. Exact internal file splits and mechanical
extraction order may adjust during implementation, but they may not weaken the package
direction, public feature coverage, router neutrality, explicit client boundary, style
isolation, publication gates, or acceptance criteria above.
