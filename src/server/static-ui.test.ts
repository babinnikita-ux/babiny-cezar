import { describe, expect, it } from 'vitest';
import { ASSET_CACHE_CONTROL, assetContentType, resolveIndexHtml, type IndexTarget } from './static-ui.js';

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
