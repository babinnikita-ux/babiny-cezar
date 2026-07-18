# Publishing — stable releases and npm previews

How cezar reaches npm. Two paths, deliberately separate
(spec: `.ai/specs/2026-07-18-npm-preview-publish.md`, issue #482):

- **Stable releases** (`latest`) are **owner-driven**: a maintainer runs
  `npm publish` from a tagged checkout of both `.` and `alias-cezar/`. CI never
  moves `latest`.
- **Previews** are **CI-driven**: the `publish-snapshot` job in
  [`ci.yml`](../.github/workflows/ci.yml) publishes a snapshot of both packages
  after every fully green `verify` run.

## Preview channels

| Event | Version (example) | dist-tag | Install |
|---|---|---|---|
| same-repo PR, CI green | `0.1.5-pr482.123` | `pr-482` | `npx cezar-cli@0.1.5-pr482.123` |
| push to `develop` | `0.1.5-develop.124` | `develop` | `npx cezar-cli@develop` |
| push to `main` | `0.1.5-main.125` | `main` | `npx cezar-cli@main` |

Version scheme: `<base>-<channel>.<run_number>`, with `.<run_attempt>` appended
on re-runs so no publish ever collides. Prerelease versions under explicit
dist-tags are invisible to a plain `npx cezar-cli`, which keeps resolving
`latest`.

Both packages publish in lockstep — the scoped implementation package first,
then the unscoped `cezar-cli` alias with its dependency **pinned to the exact
snapshot version** — so a preview always runs exactly the code it was built
from. Names are read from the checked-out manifests at publish time, never
hardcoded.

On every PR snapshot the job upserts one sticky comment (marker
`<!-- cezar-npm-preview -->`) with the exact copy-pasteable commands. When a PR
closes, [`npm-preview-cleanup.yml`](../.github/workflows/npm-preview-cleanup.yml)
best-effort removes its `pr-<N>` dist-tag from both packages (the versions
themselves stay — npm allows unpublish only within 72 hours, and untagged
prereleases are inert).

## Pieces

| Piece | Role |
|---|---|
| `src/release/snapshot.ts` | pure decisions: channel/version/dist-tag, manifest stamping, install lines (unit-tested) |
| `scripts/release-snapshot.mjs` | orchestrator: stamps manifests, `npm publish --tag <channel> --provenance`, emits result JSON (`--dry-run` supported; e2e-tested) |
| `ci.yml` → `publish-snapshot` | gate (`needs: verify`), same-repo guard, provenance permissions, sticky PR comment, step summary |
| `npm-preview-cleanup.yml` | dist-tag removal on PR close |

Guards: the job runs only for pushes and same-repo PRs (fork PRs get no
secrets, and `computeSnapshot` re-checks the head repo as defense in depth);
the dist-tag is always explicit so a snapshot can never become `latest`;
concurrency is non-cancellable so a publish never stops halfway between the
two packages. **Without the `NPM_TOKEN` secret the job degrades to a loud dry
run and stays green** — the pipeline is safe to merge before the admin setup
below is done.

## One-time admin setup

On **npmjs.com** (as an owner of the npm org and of the `cezar-cli` package):

1. Verify the org exists and your user is an **Owner**.
2. Give the org control of the unscoped alias (unscoped packages attach to
   orgs via teams) — run as the current `cezar-cli` owner:
   `npm access grant read-write <org>:developers cezar-cli`.
3. Create a **granular access token**: *Read and write*; packages and scopes =
   the org scope (allow publishing new packages in it — the first scoped
   publish comes from CI) **plus** the `cezar-cli` package; set an expiry per
   your policy (CI fails loudly with `E401`/`E404` when it lapses).
4. For both packages: Settings → *Publishing access* → **"Require two-factor
   authentication or an automation or granular access token"** (CI publishes
   with the token; humans still need 2FA).

On **GitHub** (this repository):

5. Settings → Secrets and variables → Actions → new repository secret
   **`NPM_TOKEN`** with the token from step 3.
6. Nothing else — the workflows declare their own `permissions:` blocks, so
   repo-level Actions defaults can stay read-only.

After the first stable publish under a new package name (post-rename only):

7. Publish a final forwarding patch of the old scoped package and deprecate
   it: `npm deprecate <old-name> "moved to <new-name> — npx cezar-cli still works"`.

## Verifying a preview

- The PR's sticky comment (or the job's step summary for branch pushes) has
  the exact command — e.g. `npx cezar-cli@0.1.5-pr482.123`.
- `npm view cezar-cli dist-tags` shows every active channel.
- Server flows accept pinned previews too:
  `npx cezar-cli@<version> server-deploy --platform <id>`
  (see [Remote access](server-install/README.md)).
