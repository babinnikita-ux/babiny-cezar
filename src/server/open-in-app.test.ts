import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: (...args: unknown[]) => spawnMock(...args) };
});

import { agentCliRunner, detectOpenTargets, openFileInDefaultApp, openInApp } from './open-in-app.js';

describe('detectOpenTargets', () => {
  it('always offers a file manager and a terminal, first', () => {
    const targets = detectOpenTargets();
    expect(targets[0]?.id).toBe('finder');
    expect(targets[1]?.id).toBe('terminal');
    // Ids are unique.
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
  });
});

describe('openInApp', () => {
  it('rejects an unknown target instead of launching anything', async () => {
    expect(await openInApp('not-a-real-editor', process.cwd())).toBe(false);
  });
});

/**
 * `openFileInDefaultApp`'s ARGUMENT SURFACE (#365). The path it receives is worktree content —
 * a filename some cloned repo or coding agent chose — so these tests pin the one property that
 * makes that safe: the filename is handed to the launcher as a single, un-re-parsed argument,
 * and never to a process that interprets shell metacharacters in its command line.
 */
describe('openFileInDefaultApp — the OS launcher argument surface', () => {
  const realPlatform = process.platform;
  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true });

  beforeEach(() => {
    spawnMock.mockReset();
    // A child that never errors: runDetached resolves true after its settle window.
    spawnMock.mockReturnValue({ once: vi.fn(), unref: vi.fn() });
  });
  afterEach(() => setPlatform(realPlatform));

  // A name that is legal on NTFS and in git, and that clears the route's image allowlist.
  const HOSTILE = 'a&calc&.png';

  it('never routes a filename through cmd.exe on Windows (BatBadBut/CVE-2024-27980)', async () => {
    setPlatform('win32');
    await openFileInDefaultApp(`C:\\dev\\proj\\${HOSTILE}`);

    const [bin, args] = spawnMock.mock.calls[0] as [string, string[]];
    // cmd re-parses its command line, and libuv only quotes args containing space/tab/quote —
    // so `&` in a space-free path would survive into cmd and execute. Any launcher but cmd.
    expect(bin).not.toBe('cmd');
    expect(bin).toBe('explorer');
    // The whole path stays exactly one argv entry — never split, never interpolated.
    expect(args).toEqual([`C:\\dev\\proj\\${HOSTILE}`]);
  });

  it('passes the path as a lone argv entry on macOS and Linux too', async () => {
    for (const [platform, bin] of [
      ['darwin', 'open'],
      ['linux', 'xdg-open'],
    ] as const) {
      spawnMock.mockClear();
      setPlatform(platform);
      await openFileInDefaultApp(`/repo/${HOSTILE}`);

      const [calledBin, args] = spawnMock.mock.calls[0] as [string, string[]];
      expect(calledBin).toBe(bin);
      expect(args).toEqual([`/repo/${HOSTILE}`]);
    }
  });

  it('spawns without a shell, so no metacharacter is ever interpreted', async () => {
    setPlatform('linux');
    await openFileInDefaultApp('/repo/x.png');

    const opts = spawnMock.mock.calls[0]?.[2] as { shell?: unknown } | undefined;
    expect(opts?.shell).toBeFalsy();
  });
});

describe('agentCliRunner', () => {
  it('maps cli:<runner> ids to the runner, and rejects everything else', () => {
    expect(agentCliRunner('cli:claude')).toBe('claude');
    expect(agentCliRunner('cli:codex')).toBe('codex');
    expect(agentCliRunner('cli:opencode')).toBe('opencode');
    expect(agentCliRunner('vscode')).toBeNull();
    expect(agentCliRunner('terminal')).toBeNull();
    expect(agentCliRunner('cli:bogus')).toBeNull();
  });
});
