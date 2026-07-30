import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { RunEvent } from '@open-mercato/cezar-contract';
import {
  HistoryCursorError,
  canonicalSessionItems,
  deriveRunContextEvents,
  readEventsAfterLiveCursor,
  readRunHistoryPage,
} from './event-history.ts';

const dirs: string[] = [];

function fixture(events: Array<Partial<RunEvent> & Pick<RunEvent, 'seq' | 'type'>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cez-history-'));
  dirs.push(dir);
  const file = join(dir, 'run.ndjson');
  writeFileSync(
    file,
    events.map((event) => JSON.stringify({ ts: '2026-07-30T00:00:00.000Z', ...event })).join('\n') + '\n',
  );
  return file;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('canonicalSessionItems', () => {
  it('collapses v2 lifecycle snapshots and suppresses v1 tool twins in a mixed turn', () => {
    const events = [
      { seq: 1, ts: 'x', type: 'turn.started', turnId: 't1' },
      { seq: 2, ts: 'x', type: 'tool-call', id: 'tool-1', tool: 'Bash' },
      { seq: 3, ts: 'x', type: 'item.started', item: { kind: 'tool', id: 'tool-1' } },
      { seq: 4, ts: 'x', type: 'tool-result', toolCallId: 'tool-1' },
      { seq: 5, ts: 'x', type: 'item.completed', item: { kind: 'tool', id: 'tool-1' } },
      { seq: 6, ts: 'x', type: 'note', message: 'done' },
    ] satisfies RunEvent[];
    expect(canonicalSessionItems(events).map(({ key }) => key)).toEqual([
      'v2::tool-1',
      'standalone:6',
    ]);
  });
});

describe('readRunHistoryPage', () => {
  it('returns exactly the newest 100 items and pages the older remainder', async () => {
    const events: Array<Partial<RunEvent> & Pick<RunEvent, 'seq' | 'type'>> = [
      { seq: 1, type: 'turn.started', turnId: 't1' },
    ];
    for (let seq = 2; seq <= 151; seq += 1) {
      events.push({
        seq,
        type: 'item.completed',
        item: { kind: 'message', id: `m-${seq}`, role: 'assistant', text: String(seq) },
      });
    }
    const file = fixture(events);
    const newest = await readRunHistoryPage(file);
    expect(newest.itemCount).toBe(100);
    expect(newest.hasOlder).toBe(true);
    expect(newest.events.at(-1)?.seq).toBe(151);
    expect(newest.olderCursor).toBeTypeOf('string');

    const older = await readRunHistoryPage(file, newest.olderCursor);
    expect(older.itemCount).toBe(50);
    expect(older.hasOlder).toBe(false);
    expect(older.events.at(-1)?.seq).toBe(51);
    expect(older.newerCursor).toBeTypeOf('string');
  });

  it('degrades a missing transcript to an empty live page', async () => {
    const page = await readRunHistoryPage('/no/such/transcript.ndjson');
    expect(page).toMatchObject({ events: [], itemCount: 0, asOfSeq: 0, hasOlder: false });
    expect(page.liveCursor).toBeTypeOf('string');
  });

  it('rejects malformed cursors without touching a path from cursor data', async () => {
    await expect(readRunHistoryPage('/no/such/transcript.ndjson', 'not-json')).rejects.toMatchObject({
      name: 'HistoryCursorError',
      status: 400,
    });
  });

  it('reads only the bounded tail of a deterministic 50,000-item transcript', async () => {
    const events: Array<Partial<RunEvent> & Pick<RunEvent, 'seq' | 'type'>> = [];
    for (let index = 0; index < 50_000; index += 1) {
      const seq = index * 2 + 1;
      events.push({ seq, type: 'turn.started', turnId: `t-${index}` });
      events.push({
        seq: seq + 1,
        type: 'item.completed',
        item: { kind: 'message', id: `m-${index}`, role: 'assistant', text: `message ${index}` },
      });
    }
    const file = fixture(events);
    let measured: { fileSize: number; bytesRead: number; retainedEvents: number } | undefined;
    const result = await readRunHistoryPage(file, undefined, (value) => {
      measured = value;
    });
    expect(result.itemCount).toBe(100);
    expect(result.events.length).toBeLessThanOrEqual(202);
    expect(measured).toBeDefined();
    expect(measured!.fileSize).toBe(statSync(file).size);
    expect(measured!.bytesRead).toBeLessThan(measured!.fileSize / 10);
    expect(measured!.retainedEvents).toBeLessThan(1_000);
  });
});

describe('live cursor replay and compact context', () => {
  it('replays only persisted lines appended after the captured live cursor', async () => {
    const file = fixture([
      { seq: 1, type: 'turn.started', turnId: 't1' },
      { seq: 2, type: 'note', message: 'before' },
    ]);
    const page = await readRunHistoryPage(file);
    appendFileSync(file, JSON.stringify({ seq: 4, ts: 'x', type: 'note', message: 'after gap' }) + '\n');
    const replay = await readEventsAfterLiveCursor(file, page.liveCursor);
    expect(replay.boundarySeq).toBe(2);
    expect(replay.events.map(({ seq }) => seq)).toEqual([4]);
  });

  it('returns 409 when a valid live cursor points beyond a replaced transcript', async () => {
    const file = fixture([
      { seq: 1, type: 'note', message: 'long enough to capture an offset' },
    ]);
    const page = await readRunHistoryPage(file);
    writeFileSync(file, '');
    await expect(readEventsAfterLiveCursor(file, page.liveCursor)).rejects.toEqual(
      expect.objectContaining<Partial<HistoryCursorError>>({ status: 409 }),
    );
  });

  it('keeps the latest plan and selector-relevant task lifecycle in chronological order', async () => {
    const file = fixture([
      { seq: 1, type: 'plan.updated', entries: [{ content: 'old', status: 'pending' }] },
      { seq: 2, type: 'turn.started', turnId: 't1' },
      {
        seq: 3,
        type: 'item.started',
        item: { kind: 'tool', id: 'task-1', toolKind: 'task', status: 'running' },
      },
      { seq: 4, type: 'plan.updated', entries: [{ content: 'new', status: 'in_progress' }] },
      {
        seq: 5,
        type: 'item.updated',
        item: { kind: 'tool', id: 'child-1', parentItemId: 'task-1', status: 'running' },
      },
    ]);
    const context = await deriveRunContextEvents(file);
    expect(context.asOfSeq).toBe(5);
    expect(context.contextEvents.map(({ seq }) => seq)).toEqual([2, 3, 4, 5]);
  });
});
