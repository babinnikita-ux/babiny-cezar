import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStore } from '../runs/store.js';
import type { RunManager, StartRunInput } from '../workflows/run.js';
import type { WorkflowDef } from '../workflows/types.js';
import { createApp } from './server.js';

describe('POST /api/todos/:id/start actionability', () => {
  let repoRoot: string;
  let dataDir: string;
  let store: RunStore;
  let app: Hono;
  let startRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'cez-todos-api-'));
    dataDir = join(repoRoot, '.ai/cezar');
    mkdirSync(dataDir, { recursive: true });
    store = RunStore.open(dataDir);
    startRun = vi.fn((workflow: WorkflowDef, input: StartRunInput) =>
      store.createRun({ title: 'follow-up', workflow: workflow.name, task: input.task, steps: [] }),
    );
    app = createApp({
      repoRoot,
      store,
      manager: { startRun } as unknown as RunManager,
      version: '0.0.0-test',
    });
  });

  afterEach(() => {
    store.flush();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  const writeTodos = (items: unknown[]) =>
    writeFileSync(join(dataDir, 'todos.json'), JSON.stringify(items), 'utf8');

  it('rejects a legacy note without a skill or prompt instead of spawning quick-task', async () => {
    writeTodos([{ id: 'note', summary: 'Manually QA the PR' }]);

    const res = await app.request('/api/todos/note/start', { method: 'POST' });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'follow-up is not runnable' });
    expect(startRun).not.toHaveBeenCalled();
  });

  it('honors explicit non-runnable intent even when a suggestion is present', async () => {
    writeTodos([{ id: 'note', summary: 'For reference', suggestedPrompt: 'do it', runnable: false }]);

    const res = await app.request('/api/todos/note/start', { method: 'POST' });

    expect(res.status).toBe(409);
    expect(startRun).not.toHaveBeenCalled();
  });

  it('keeps legacy suggested prompts runnable', async () => {
    writeTodos([{ id: 'task', summary: 'Fix it', suggestedPrompt: 'Fix the retry' }]);

    const res = await app.request('/api/todos/task/start', { method: 'POST' });

    expect(res.status).toBe(201);
    expect(startRun).toHaveBeenCalledOnce();
  });
});
