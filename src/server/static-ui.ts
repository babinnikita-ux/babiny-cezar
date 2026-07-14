/** Which browser UI a request for `/` gets.
 *
 *  Two UIs coexist until phase R7 retires the legacy one (spec
 *  `.ai/specs/2026-07-14-cockpit-ui-redesign.md`): the React cockpit built to
 *  `web/dist`, and the vanilla `web/index.html` + `/app.js` + `/style.css`.
 */
export type IndexTarget = 'dist' | 'legacy';

export interface IndexResolution {
  target: IndexTarget;
  /** True when the built app is missing — the caller logs a one-line build hint. */
  hint: boolean;
}

/** Pick the UI for `/`, given whether the build exists and whether the caller
 *  asked for the legacy escape hatch (`?legacy=1`).
 *
 *  The built app wins when it is there; a checkout that never ran
 *  `npm run build:web` still gets a working cockpit (the legacy one), because
 *  `npx cezar-cli` must never need a build step on the user's machine.
 */
export function resolveIndexHtml(opts: { distExists: boolean; legacyRequested: boolean }): IndexResolution {
  const { distExists, legacyRequested } = opts;
  return {
    target: distExists && !legacyRequested ? 'dist' : 'legacy',
    // Only worth saying when the build is what's missing — an explicit
    // ?legacy=1 is a choice, not a misconfiguration.
    hint: !distExists && !legacyRequested,
  };
}

/** `passthrough` = not the SPA's to answer: `/api/*` keeps its JSON/SSE behavior
 *  and its own 404s, and the files with dedicated static routes keep being
 *  served by them. */
export type GetTarget = IndexTarget | 'passthrough';

export interface GetResolution {
  target: GetTarget;
  hint: boolean;
}

/** Paths owned by routes registered before the catch-all: the built app's
 *  hashed bundles and the legacy page's own assets (which `?legacy=1` needs). */
function isStaticAsset(path: string): boolean {
  return (
    path.startsWith('/assets/') ||
    path === '/app.js' ||
    path === '/style.css' ||
    path === '/open-mercato.svg'
  );
}

/** Decide what any GET gets, so every route in the spec's map (`/tasks/:id/changes`,
 *  `/settings/skills`, …) cold-loads and survives a refresh — that is what makes a
 *  cockpit URL pasteable.
 *
 *  Unknown paths deliberately resolve to the shell, not a 404: react-router owns
 *  the 404 (it is the only side that knows the route map). Everything the server
 *  itself owns — `/api/*` and the static files above — passes through untouched.
 */
export function resolveGetRequest(opts: {
  path: string;
  distExists: boolean;
  legacyRequested: boolean;
}): GetResolution {
  const { path, distExists, legacyRequested } = opts;
  if (path === '/api' || path.startsWith('/api/') || isStaticAsset(path)) {
    return { target: 'passthrough', hint: false };
  }
  return resolveIndexHtml({ distExists, legacyRequested });
}

const ASSET_TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  woff: 'font/woff',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
};

/** Content type for a hashed file under `web/dist/assets/`. */
export function assetContentType(file: string): string {
  return ASSET_TYPES[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** Vite fingerprints every filename under `assets/`, so the bytes behind a URL
 *  can never change — cache them for a year. */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
