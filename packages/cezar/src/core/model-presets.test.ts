import { describe, expect, it } from 'vitest';
import { KNOWN_PRESETS_BY_RUNNER, modelConflictsWithRunner } from './model-presets.ts';

describe('modelConflictsWithRunner', () => {
  it('never rejects auto or a runner\'s own preset', () => {
    expect(modelConflictsWithRunner('', 'opencode')).toBe(false);
    expect(modelConflictsWithRunner('opus', 'claude')).toBe(false);
    expect(modelConflictsWithRunner('gpt-5.1-codex', 'codex')).toBe(false);
  });

  it('rejects another runner\'s preset', () => {
    expect(modelConflictsWithRunner('opus', 'codex')).toBe(true);
    expect(modelConflictsWithRunner('gpt-5.1-codex', 'claude')).toBe(true);
    expect(modelConflictsWithRunner('claude-opus-4-8', 'codex')).toBe(true);
    // …but an unlisted gateway id stays usable on claude, which supports them by design.
    expect(modelConflictsWithRunner('openai/gpt-5.4', 'claude')).toBe(false);
  });

  it('rejects a provider the runner cannot serve, without naming any model', () => {
    expect(modelConflictsWithRunner('anthropic/claude-opus-4-8', 'codex')).toBe(true);
    // A model that did not exist when this code was written is guarded just the same.
    expect(modelConflictsWithRunner('anthropic/claude-opus-9', 'codex')).toBe(true);
    expect(modelConflictsWithRunner('openai/gpt-5.4', 'codex')).toBe(false);
  });

  it('rejects a bare id for OpenCode, which cannot route one', () => {
    expect(modelConflictsWithRunner('opus', 'opencode')).toBe(true);
    expect(modelConflictsWithRunner('gpt-5.4', 'opencode')).toBe(true);
  });

  it('accepts every provider-qualified OpenCode id, including ones no release knows (#794)', () => {
    for (const model of ['openai/gpt-5.5-fast', 'anthropic/claude-sonnet-5', 'zed/some-future-model']) {
      expect(modelConflictsWithRunner(model, 'opencode')).toBe(false);
    }
  });

  it('keeps no hard-coded OpenCode catalog to drift', () => {
    expect(KNOWN_PRESETS_BY_RUNNER.opencode).toEqual([]);
  });
});
