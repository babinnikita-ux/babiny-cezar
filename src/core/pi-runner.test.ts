import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AgentEvent } from './agent-runner.js';
import { detectEnvironment } from './backend-detect.js';
import { createRunner } from './runner-factory.js';
import { PiRunner } from './pi-runner.js';

/**
 * The `pi` runner (#387): a new AgentBackend slotted into the runner seam as
 * ONE class. These lock the three seam-level guarantees the issue asks for —
 * the factory hands back a pi runner, detection degrades gracefully when the
 * pi CLI is absent, and a dry-run session emits the normalized `AgentEvent`
 * stream every backend shares (no pi-specific wire type leaks past the seam).
 */

describe('createRunner returns the pi runner', () => {
  it('maps the "pi" id to a PiRunner with backend "pi"', () => {
    const runner = createRunner('pi');
    expect(runner).toBeInstanceOf(PiRunner);
    expect(runner.backend).toBe('pi');
  });
});

describe('backend-detect handles an absent pi CLI', () => {
  const saved = { bin: process.env.CEZ_PI_BIN, dry: process.env.CEZ_DRY_RUN };

  beforeEach(() => {
    delete process.env.CEZ_DRY_RUN; // real probe, not the mock short-circuit
    process.env.CEZ_PI_BIN = join(tmpdir(), 'cez-pi-does-not-exist-xyz');
  });
  afterEach(() => {
    if (saved.bin === undefined) delete process.env.CEZ_PI_BIN;
    else process.env.CEZ_PI_BIN = saved.bin;
    if (saved.dry === undefined) delete process.env.CEZ_DRY_RUN;
    else process.env.CEZ_DRY_RUN = saved.dry;
  });

  it('reports pi as unavailable with a hint, and never rejects (no boot failure)', async () => {
    const checks = await detectEnvironment();
    const pi = checks.find((c) => c.name === 'pi');
    expect(pi).toBeDefined();
    expect(pi!.available).toBe(false);
    expect(pi!.hint).toContain('pi');
  });
});

describe('a dry-run pi session emits normalized AgentEvents', () => {
  const saved = process.env.CEZ_DRY_RUN;
  let cwd: string;

  beforeEach(() => {
    process.env.CEZ_DRY_RUN = '1'; // swap in the shared mock CLI
    cwd = mkdtempSync(join(tmpdir(), 'cez-pi-run-'));
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CEZ_DRY_RUN;
    else process.env.CEZ_DRY_RUN = saved;
    rmSync(cwd, { recursive: true, force: true });
  });

  it('streams text, a tool call/result and a terminal done over the mock', async () => {
    const runner = new PiRunner();
    expect(runner.backend).toBe('pi');

    const events: AgentEvent[] = [];
    const result = await runner.run(
      { userPrompt: 'investigate the login redirect bug', cwd, timeoutMs: 20_000 },
      (event) => events.push(event),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain('text');
    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
    // Every backend's stream is terminated by exactly one `done`.
    expect(types.filter((t) => t === 'done')).toHaveLength(1);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
