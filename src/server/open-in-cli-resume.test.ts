import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStore } from '../runs/store.js';
import type { RunManager } from '../workflows/run.js';
import { openInTerminal } from './open-in-terminal.js';

// The terminal launcher actually spawns a process (osascript/cmd/x-terminal-emulator) — mocked
// so this suite exercises only the command construction, never a real terminal window.
vi.mock('./open-in-terminal.js', () => ({ openInTerminal: vi.fn(async () => true) }));

const mockOpenInTerminal = vi.mocked(openInTerminal);

const { createApp } = await import('./server.js');

/**
 * `POST /api/runs/:id/open-in` with a `cli:<runner>` target (#402 follow-up): picking the
 * agent CLI that matches the run's own runner resumes THIS run's session — the same
 * `resumeCommand` mapping the client mirrors in run-actions.ts. Every other case (a foreign
 * runner, or no session yet) launches the CLI fresh rather than guessing at a cross-backend
 * resume: a Claude session id means nothing to `codex resume`, so cross-runner picks and
 * sessionless runs both degrade to a plain launch instead of erroring.
 */
describe('POST /api/runs/:id/open-in — agent CLI resume vs fresh launch', () => {
  let repoRoot: string;
  let store: RunStore;
  const savedRemote = process.env.CEZ_REMOTE;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'cez-open-in-cli-'));
    store = RunStore.open(join(repoRoot, '.ai/cezar'));
    delete process.env.CEZ_REMOTE;
    mockOpenInTerminal.mockClear();
  });

  afterEach(() => {
    store.flush();
    rmSync(repoRoot, { recursive: true, force: true });
    if (savedRemote === undefined) delete process.env.CEZ_REMOTE;
    else process.env.CEZ_REMOTE = savedRemote;
  });

  const app = () => createApp({ repoRoot, store, manager: {} as RunManager, version: '0.0.0-test' });

  const makeRun = (runner: 'claude' | 'codex' | 'opencode' | undefined, sessionId?: string) => {
    const run = store.createRun({
      title: 't',
      workflow: 'quick-task',
      task: 'do it',
      runner,
      steps: [{ id: 'work', name: 'Work', kind: 'agent' }],
    });
    if (sessionId) store.updateStep(run.id, 'work', { sessionId });
    return run;
  };

  const openIn = (runId: string, target: string) =>
    app().request(`/api/runs/${runId}/open-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target }),
    });

  it.each([
    ['claude', 'cli:claude', 'claude --resume sess-1'],
    ['codex', 'cli:codex', 'codex resume sess-1'],
    ['opencode', 'cli:opencode', 'opencode --session sess-1'],
  ] as const)('the %s CLI resumes its own %s session', async (runner, target, expected) => {
    const run = makeRun(runner, 'sess-1');
    const res = await openIn(run.id, target);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { command: string }).command).toBe(expected);
    expect(mockOpenInTerminal).toHaveBeenCalledWith(expect.any(String), expected);
  });

  it('a legacy run with no runner recorded resumes as Claude (pre-runner-choice default)', async () => {
    const run = makeRun(undefined, 'sess-1');
    const res = await openIn(run.id, 'cli:claude');
    expect(((await res.json()) as { command: string }).command).toBe('claude --resume sess-1');
  });

  it("cross-runner: a CLI that is not the run's own launches fresh — no cross-backend resume attempted", async () => {
    const run = makeRun('claude', 'sess-1');
    const res = await openIn(run.id, 'cli:codex');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { command: string }).command).toBe('codex');
    expect(mockOpenInTerminal).toHaveBeenCalledWith(expect.any(String), 'codex');
  });

  it('no session yet: even the matching CLI launches fresh instead of erroring', async () => {
    const run = makeRun('opencode', undefined);
    const res = await openIn(run.id, 'cli:opencode');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { command: string }).command).toBe('opencode');
  });

  it('hosted mode (CEZ_REMOTE=1) 409s before any session lookup, CLI or not', async () => {
    process.env.CEZ_REMOTE = '1';
    const run = makeRun('claude', 'sess-1');
    const res = await openIn(run.id, 'cli:claude');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('hosted mode');
    expect(mockOpenInTerminal).not.toHaveBeenCalled();
  });
});
