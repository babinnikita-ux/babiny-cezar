/**
 * Regression tests for issue #345 — user-pasted screenshots must be persisted
 * like agent ones and referenced from the transcript, while the base64 bytes
 * stay out of the NDJSON log (BACKWARD_COMPATIBILITY.md surface #1/#2).
 *
 * Run with: npm test  (node --import tsx --test test/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunStore } from '../src/runs/store.js';
import { RunManager } from '../src/workflows/run.js';
import type { ContentBlock } from '../src/core/agent-runner.js';

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function setup() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'cezar-test-'));
  const store = RunStore.open(join(repoRoot, '.ai/cezar'));
  const manager = new RunManager(store, repoRoot);
  const run = store.createRun({
    title: 'test',
    workflow: 'task',
    task: 'test task',
    steps: [{ id: 'task', name: 'task', kind: 'agent' }],
  });
  // Inject a live session the way execute() would have — sendMessage refuses
  // to run without one.
  const state = {
    cancelled: false,
    interrupt: () => undefined,
    cwd: repoRoot,
    currentStepId: 'task',
    session: { open: true, sendMessage: () => true, end: () => undefined },
  };
  (manager as unknown as { active: Map<string, unknown> }).active.set(run.id, state);
  return { repoRoot, store, manager, run };
}

test('sendMessage persists pasted images and references them from the user-message event', () => {
  const { repoRoot, store, manager, run } = setup();
  try {
    const content: ContentBlock[] = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PNG_B64 } },
      { type: 'text', text: 'look at these' },
    ];
    assert.equal(manager.sendMessage(run.id, content), true);

    const evt = store.readEvents(run.id).find((e) => e.type === 'user-message');
    assert.ok(evt, 'user-message event appended');
    assert.equal(evt.text, 'look at these');
    assert.equal(evt.imageCount, 2, 'legacy imageCount field kept');
    const images = evt.images as Array<{ name: string; url: string }>;
    assert.equal(images.length, 2);
    assert.deepEqual(images[0], {
      name: 'pasted-1.png',
      url: `/api/runs/${run.id}/images/pasted-1.png`,
    });
    assert.deepEqual(images[1], {
      name: 'pasted-2.jpg',
      url: `/api/runs/${run.id}/images/pasted-2.jpg`,
    });

    for (const img of images) {
      const file = join(repoRoot, '.ai/cezar/runs', `${run.id}-images`, img.name);
      assert.ok(existsSync(file), `${img.name} written to the run's images dir`);
    }

    const ndjson = readFileSync(join(repoRoot, '.ai/cezar/runs', `${run.id}.ndjson`), 'utf8');
    assert.ok(!ndjson.includes(PNG_B64), 'base64 bytes never enter the NDJSON log');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('sendMessage without images keeps the old event shape (no images field)', () => {
  const { repoRoot, store, manager, run } = setup();
  try {
    assert.equal(manager.sendMessage(run.id, [{ type: 'text', text: 'just text' }]), true);
    const evt = store.readEvents(run.id).find((e) => e.type === 'user-message');
    assert.ok(evt);
    assert.equal(evt.imageCount, 0);
    assert.ok(!('images' in evt), 'no empty images field on text-only messages');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
