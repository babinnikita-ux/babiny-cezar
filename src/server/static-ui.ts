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
