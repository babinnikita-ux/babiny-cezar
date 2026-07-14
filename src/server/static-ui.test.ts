import { describe, expect, it } from 'vitest';
import {
  ASSET_CACHE_CONTROL,
  assetContentType,
  resolveGetRequest,
  resolveIndexHtml,
  type GetTarget,
  type IndexTarget,
} from './static-ui.js';

describe('resolveIndexHtml', () => {
  const cases: Array<{
    name: string;
    distExists: boolean;
    legacyRequested: boolean;
    target: IndexTarget;
    hint: boolean;
  }> = [
    { name: 'built app present → the React cockpit', distExists: true, legacyRequested: false, target: 'dist', hint: false },
    { name: '?legacy=1 escapes to the old UI even when built', distExists: true, legacyRequested: true, target: 'legacy', hint: false },
    { name: 'never built → the old UI still works, with a hint', distExists: false, legacyRequested: false, target: 'legacy', hint: true },
    { name: 'never built + ?legacy=1 → the old UI, no hint (it was asked for)', distExists: false, legacyRequested: true, target: 'legacy', hint: false },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(resolveIndexHtml({ distExists: c.distExists, legacyRequested: c.legacyRequested })).toEqual({
        target: c.target,
        hint: c.hint,
      });
    });
  }
});

describe('resolveGetRequest', () => {
  const cases: Array<{
    name: string;
    path: string;
    distExists?: boolean;
    legacyRequested?: boolean;
    target: GetTarget;
  }> = [
    // Deep links cold-load: every route in the spec's map is the SPA's, not a 404.
    { name: '/ → the shell', path: '/', target: 'dist' },
    { name: '/tasks/x → the shell (deep link)', path: '/tasks/x', target: 'dist' },
    { name: '/tasks/x/changes → the shell (tab in the path)', path: '/tasks/x/changes', target: 'dist' },
    { name: '/settings/skills → the shell', path: '/settings/skills', target: 'dist' },
    // react-router owns the 404 — it is the only side that knows the route map.
    { name: '/nope → the shell, which renders the 404 route', path: '/nope', target: 'dist' },
    // The bookmarklet target moves to the React composer; ?legacy=1 still escapes.
    { name: '/new → the shell', path: '/new', target: 'dist' },
    { name: '/new?legacy=1 → the legacy page (saved bookmarklets keep an escape hatch)', path: '/new', legacyRequested: true, target: 'legacy' },

    // Never shadow the API: an unknown /api path must 404 as JSON, not as HTML.
    { name: '/api/runs → passthrough', path: '/api/runs', target: 'passthrough' },
    { name: '/api/runs/x/events (SSE) → passthrough', path: '/api/runs/x/events', target: 'passthrough' },
    { name: '/api/nope → passthrough, so it keeps its own 404', path: '/api/nope', target: 'passthrough' },
    { name: '/api → passthrough', path: '/api', target: 'passthrough' },
    // …but /api-ish paths that are not the API are just routes.
    { name: '/apidocs → the shell (not an /api path)', path: '/apidocs', target: 'dist' },

    // The static routes registered before the catch-all keep their files.
    { name: '/assets/index-abc123.js → passthrough', path: '/assets/index-abc123.js', target: 'passthrough' },
    { name: '/app.js (legacy) → passthrough', path: '/app.js', target: 'passthrough' },
    { name: '/style.css (legacy) → passthrough', path: '/style.css', target: 'passthrough' },
    { name: '/open-mercato.svg → passthrough', path: '/open-mercato.svg', target: 'passthrough' },
    // Passthrough is about ownership, not about the build being there.
    { name: '/app.js with no build → still passthrough', path: '/app.js', distExists: false, target: 'passthrough' },

    // No build → the legacy page, never a 404: `npx cezar-cli` is zero-config.
    { name: '/tasks/x with no build → the legacy page', path: '/tasks/x', distExists: false, target: 'legacy' },
    { name: '/ with no build → the legacy page', path: '/', distExists: false, target: 'legacy' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(
        resolveGetRequest({
          path: c.path,
          distExists: c.distExists ?? true,
          legacyRequested: c.legacyRequested ?? false,
        }).target,
      ).toBe(c.target);
    });
  }

  it('hints about the missing build only for requests it actually serves', () => {
    const opts = { distExists: false, legacyRequested: false };
    expect(resolveGetRequest({ path: '/tasks/x', ...opts }).hint).toBe(true);
    // An /api or asset caller is not a person who could run `npm run build:web`.
    expect(resolveGetRequest({ path: '/api/runs', ...opts }).hint).toBe(false);
    expect(resolveGetRequest({ path: '/assets/index-abc123.js', ...opts }).hint).toBe(false);
  });
});

describe('assetContentType', () => {
  const cases: Array<[string, string]> = [
    ['index-D1sxO2Tm.js', 'text/javascript; charset=utf-8'],
    ['index-VovY6R-i.css', 'text/css; charset=utf-8'],
    ['open-mercato-toBr6SOa.svg', 'image/svg+xml'],
    ['inter-latin-wght-normal-Dx4kXJAl.woff2', 'font/woff2'],
    ['logo-abc123.PNG', 'image/png'],
    ['something-abc123.bin', 'application/octet-stream'],
    ['noextension', 'application/octet-stream'],
  ];

  for (const [file, type] of cases) {
    it(`${file} → ${type}`, () => {
      expect(assetContentType(file)).toBe(type);
    });
  }
});

describe('ASSET_CACHE_CONTROL', () => {
  it('marks hashed assets immutable for a year', () => {
    expect(ASSET_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
  });
});
