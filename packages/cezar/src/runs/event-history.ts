import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { z } from 'zod';

import {
  RUN_HISTORY_PAGE_ITEMS,
  type RunEvent,
  type RunHistoryContext,
  type RunHistoryEvent,
  type RunHistoryPage,
} from '@open-mercato/cezar-contract';

const READ_CHUNK_BYTES = 64 * 1024;
const MAX_CURSOR_BYTES = 2_048;

const pageCursorSchema = z.object({
  v: z.literal(1),
  kind: z.literal('page'),
  beforeSeq: z.number().int().positive(),
});

const liveCursorSchema = z.object({
  v: z.literal(1),
  kind: z.literal('live'),
  offset: z.number().int().nonnegative(),
  boundarySeq: z.number().int().nonnegative(),
});

export class HistoryCursorError extends Error {
  readonly status: 400 | 409;

  constructor(status: 400 | 409, message: string) {
    super(message);
    this.name = 'HistoryCursorError';
    this.status = status;
  }
}

function encodeCursor(value: z.infer<typeof pageCursorSchema> | z.infer<typeof liveCursorSchema>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): unknown {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_BYTES) {
    throw new HistoryCursorError(400, 'invalid history cursor');
  }
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new HistoryCursorError(400, 'invalid history cursor');
  }
}

export function decodePageCursor(cursor: string): z.infer<typeof pageCursorSchema> {
  const parsed = pageCursorSchema.safeParse(decodeCursor(cursor));
  if (!parsed.success) throw new HistoryCursorError(400, 'invalid history cursor');
  return parsed.data;
}

export function decodeLiveCursor(cursor: string): z.infer<typeof liveCursorSchema> {
  const parsed = liveCursorSchema.safeParse(decodeCursor(cursor));
  if (!parsed.success) throw new HistoryCursorError(400, 'invalid live cursor');
  return parsed.data;
}

function parseLine(line: string): RunHistoryEvent | null {
  try {
    const value = JSON.parse(line) as Partial<RunHistoryEvent>;
    return typeof value.seq === 'number' && typeof value.type === 'string' && typeof value.ts === 'string'
      ? (value as RunHistoryEvent)
      : null;
  } catch {
    return null;
  }
}

interface CanonicalItem {
  key: string;
  firstSeq: number;
  lastSeq: number;
}

const STANDALONE_TYPES = new Set([
  'user-message',
  'note',
  'lifecycle',
  'error',
  'session.error',
  'image',
  'check-output',
  'ask.requested',
  'provider-auth-required',
]);

function stringField(event: RunEvent, key: string): string | undefined {
  const value = event[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Classify the source events into the same protocol-level item units the cockpit renders.
 *
 * Projection always operates on complete collected turns. A v2-covered turn suppresses its v1
 * tool twins; lifecycle snapshots sharing a step/item identity collapse to one item.
 */
export function canonicalSessionItems(events: readonly RunEvent[]): CanonicalItem[] {
  const items = new Map<string, CanonicalItem>();
  let turn = 0;
  let turnHasV2 = false;
  const v1Tools: Array<{ key: string; event: RunEvent }> = [];

  const upsert = (key: string, event: RunEvent) => {
    const existing = items.get(key);
    if (existing) {
      existing.firstSeq = Math.min(existing.firstSeq, event.seq);
      existing.lastSeq = Math.max(existing.lastSeq, event.seq);
    } else {
      items.set(key, { key, firstSeq: event.seq, lastSeq: event.seq });
    }
  };

  const flushTurn = () => {
    if (!turnHasV2) {
      for (const { key, event } of v1Tools) upsert(key, event);
    }
    v1Tools.length = 0;
    turnHasV2 = false;
  };

  for (const event of events) {
    if (event.type === 'user-message' || event.type === 'turn.started') {
      flushTurn();
      turn += 1;
    }
    if (event.type === 'item.started' || event.type === 'item.updated' || event.type === 'item.completed') {
      const raw = event.item;
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const id = (raw as { id?: unknown }).id;
        if (typeof id === 'string' && id !== '') {
          turnHasV2 = true;
          upsert(`v2:${event.stepId ?? ''}:${id}`, event);
        }
      }
      continue;
    }
    if (event.type === 'tool-call') {
      const id = stringField(event, 'id') ?? `seq:${event.seq}`;
      v1Tools.push({ key: `v1-tool:${turn}:${id}`, event });
      continue;
    }
    if (event.type === 'tool-result') {
      const id = stringField(event, 'toolCallId');
      const tool = id === undefined ? undefined : v1Tools.find(({ event: call }) => call.id === id);
      if (tool) tool.event = { ...tool.event, seq: event.seq };
      continue;
    }
    if (event.type === 'text') {
      upsert(`v1-text:${turn}:${event.seq}`, event);
      continue;
    }
    if (STANDALONE_TYPES.has(event.type)) upsert(`standalone:${event.seq}`, event);
  }
  flushTurn();
  return [...items.values()].sort((a, b) => a.firstSeq - b.firstSeq);
}

async function reverseEventsUntil(
  filePath: string,
  beforeSeq: number,
  wantedItems: number,
): Promise<{ events: RunHistoryEvent[]; fileSize: number; reachedStart: boolean }> {
  let fileSize = 0;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return { events: [], fileSize: 0, reachedStart: true };
  }
  if (fileSize === 0) return { events: [], fileSize, reachedStart: true };

  const handle = await open(filePath, 'r');
  let position = fileSize;
  let suffix = '';
  const reversed: RunHistoryEvent[] = [];
  let reachedStart = false;
  try {
    while (position > 0) {
      const length = Math.min(READ_CHUNK_BYTES, position);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      const text = buffer.subarray(0, bytesRead).toString('utf8') + suffix;
      const lines = text.split('\n');
      suffix = lines.shift() ?? '';
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const event = parseLine(lines[index]!);
        if (event && event.seq < beforeSeq) reversed.push(event);
      }
      const chronological = [...reversed].reverse();
      if (
        canonicalSessionItems(chronological).length >= wantedItems + 1 &&
        chronological.some((event) => event.type === 'user-message' || event.type === 'turn.started')
      ) {
        break;
      }
    }
    if (position === 0) {
      reachedStart = true;
      const event = parseLine(suffix);
      if (event && event.seq < beforeSeq) reversed.push(event);
    }
  } finally {
    await handle.close();
  }
  return { events: reversed.reverse(), fileSize, reachedStart };
}

function pageEventSlice(events: RunHistoryEvent[], selected: CanonicalItem[]): RunHistoryEvent[] {
  const firstSeq = selected[0]?.firstSeq;
  if (firstSeq === undefined) return [];
  let start = events.findIndex((event) => event.seq >= firstSeq);
  for (let index = start - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'user-message' || event.type === 'turn.started') {
      start = index;
      break;
    }
  }
  return events.slice(Math.max(0, start));
}

export async function readRunHistoryPage(filePath: string, cursor?: string): Promise<RunHistoryPage> {
  const beforeSeq = cursor === undefined ? Number.MAX_SAFE_INTEGER : decodePageCursor(cursor).beforeSeq;
  const scanned = await reverseEventsUntil(filePath, beforeSeq, RUN_HISTORY_PAGE_ITEMS);
  const canonical = canonicalSessionItems(scanned.events);
  const selected = canonical.slice(-RUN_HISTORY_PAGE_ITEMS);
  const hasOlder = canonical.length > selected.length || !scanned.reachedStart;
  const events = pageEventSlice(scanned.events, selected);
  const asOfSeq = events.reduce((max, event) => Math.max(max, event.seq), 0);
  const oldest = selected[0];
  return {
    events,
    itemCount: selected.length,
    ...(hasOlder && oldest ? { olderCursor: encodeCursor({ v: 1, kind: 'page', beforeSeq: oldest.firstSeq }) } : {}),
    ...(cursor !== undefined && events.length > 0
      ? { newerCursor: encodeCursor({ v: 1, kind: 'page', beforeSeq: Math.max(...events.map(({ seq }) => seq)) + 1 }) }
      : {}),
    liveCursor: encodeCursor({ v: 1, kind: 'live', offset: scanned.fileSize, boundarySeq: asOfSeq }),
    asOfSeq,
    hasOlder,
  };
}

function isContextEvent(event: RunHistoryEvent): boolean {
  if (
    event.type === 'plan.updated' ||
    event.type === 'turn.started' ||
    event.type === 'turn.completed' ||
    event.type === 'user-message' ||
    event.type === 'session.ended' ||
    event.type === 'session.error'
  ) {
    return true;
  }
  if (event.type === 'tool-call') return stringField(event, 'tool') === 'TodoWrite';
  if (event.type === 'tool-result') return true;
  if (event.type === 'item.started' || event.type === 'item.updated' || event.type === 'item.completed') {
    const raw = event.item;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
    const item = raw as { kind?: unknown; toolKind?: unknown; parentItemId?: unknown };
    return item.kind === 'tool' && (item.toolKind === 'task' || typeof item.parentItemId === 'string');
  }
  return false;
}

/** One bounded forward pass retaining only selector-relevant Plan/Agents source events. */
export async function deriveRunContextEvents(filePath: string): Promise<RunHistoryContext> {
  const contextEvents: RunHistoryEvent[] = [];
  let latestPlan: RunHistoryEvent | undefined;
  let asOfSeq = 0;
  try {
    const input = createReadStream(filePath, { encoding: 'utf8' });
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      const event = parseLine(line);
      if (!event) continue;
      asOfSeq = Math.max(asOfSeq, event.seq);
      if (event.type === 'plan.updated' || (event.type === 'tool-call' && stringField(event, 'tool') === 'TodoWrite')) {
        latestPlan = event;
        continue;
      }
      if (isContextEvent(event)) {
        contextEvents.push(event);
        // One current fan-out can be large, but unrelated structural history stays bounded.
        if (contextEvents.length > 2_000) contextEvents.splice(0, contextEvents.length - 2_000);
      }
    }
  } catch {
    return { contextEvents: [], asOfSeq: 0 };
  }
  if (latestPlan && !contextEvents.some(({ seq }) => seq === latestPlan.seq)) contextEvents.unshift(latestPlan);
  return { contextEvents: contextEvents.sort((a, b) => a.seq - b.seq), asOfSeq };
}

export async function readEventsAfterLiveCursor(filePath: string, cursor: string): Promise<{
  events: RunHistoryEvent[];
  boundarySeq: number;
}> {
  const decoded = decodeLiveCursor(cursor);
  let fileSize = 0;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    if (decoded.offset === 0) return { events: [], boundarySeq: decoded.boundarySeq };
    throw new HistoryCursorError(409, 'history cursor is no longer valid — reload the newest page');
  }
  if (decoded.offset > fileSize) {
    throw new HistoryCursorError(409, 'history cursor is no longer valid — reload the newest page');
  }
  if (decoded.offset === fileSize) return { events: [], boundarySeq: decoded.boundarySeq };
  const text = await new Promise<string>((resolve, reject) => {
    let value = '';
    const stream = createReadStream(filePath, { encoding: 'utf8', start: decoded.offset });
    stream.on('data', (chunk: string | Buffer) => {
      value += chunk.toString();
    });
    stream.on('end', () => resolve(value));
    stream.on('error', reject);
  });
  return {
    events: text.split('\n').map(parseLine).filter((event): event is RunHistoryEvent => event !== null),
    boundarySeq: decoded.boundarySeq,
  };
}

export async function validateLiveCursor(filePath: string, cursor: string): Promise<void> {
  const decoded = decodeLiveCursor(cursor);
  let fileSize = 0;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    if (decoded.offset === 0) return;
    throw new HistoryCursorError(409, 'history cursor is no longer valid — reload the newest page');
  }
  if (decoded.offset > fileSize) {
    throw new HistoryCursorError(409, 'history cursor is no longer valid — reload the newest page');
  }
}
