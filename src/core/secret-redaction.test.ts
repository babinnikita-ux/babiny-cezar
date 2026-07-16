import { describe, expect, it } from 'vitest';
import { collectSecretValues, redactDeep, redactSecrets, REDACTED } from './secret-redaction.js';

/**
 * #427: credentials must never be persisted to a run's NDJSON transcript.
 * Value-based redaction scrubs the host's own secret env values; pattern-based
 * redaction catches well-known token shapes from anywhere.
 */
describe('collectSecretValues', () => {
  it('collects values of secret-named vars, skips short and non-secret names', () => {
    const values = collectSecretValues({
      GITHUB_TOKEN: 'gho_averylongtokenvalue',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMIabcdefghij',
      PATH: '/usr/bin:/bin',
      SSH_AUTH_SOCK: '/tmp/ssh-abc/agent.1', // AUTH but allow-listed
      SHORT_TOKEN: 'abc', // too short
    });
    expect(values).toContain('gho_averylongtokenvalue');
    expect(values).toContain('wJalrXUtnFEMIabcdefghij');
    expect(values).not.toContain('/usr/bin:/bin');
    expect(values).not.toContain('/tmp/ssh-abc/agent.1');
    expect(values).not.toContain('abc');
  });
});

describe('redactSecrets', () => {
  it('scrubs concrete host secret values found in text', () => {
    const secrets = collectSecretValues({ GITHUB_TOKEN: 'gho_myrealsecrettoken1234' });
    const out = redactSecrets('run: gh auth uses gho_myrealsecrettoken1234 here', secrets);
    expect(out).not.toContain('gho_myrealsecrettoken1234');
    expect(out).toContain(REDACTED);
  });

  it('scrubs well-known token shapes even without knowing the env', () => {
    const line = [
      'gh: ghp_0123456789abcdefghijABCDEFGHIJ0123',
      'anthropic: sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
      'aws: AKIAIOSFODNN7EXAMPLE',
      'google: AIzaSyA0123456789abcdefghijklmnopqrstuv',
    ].join('\n');
    const out = redactSecrets(line, []);
    expect(out).not.toMatch(/ghp_|sk-ant|AKIA|AIza/);
    expect(out.match(new RegExp(REDACTED.replace(/[[\]]/g, '\\$&'), 'g'))?.length).toBe(4);
  });

  it('leaves non-secret text untouched', () => {
    expect(redactSecrets('the quick brown fox', [])).toBe('the quick brown fox');
  });
});

describe('redactDeep', () => {
  it('scrubs string leaves in nested event structures', () => {
    const event = {
      type: 'tool-result',
      result: 'export GITHUB_TOKEN=ghp_0123456789abcdefghijABCDEFGHIJ0123',
      item: { output: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz', nested: [{ text: 'safe' }] },
      seq: 3,
    };
    const out = redactDeep(event, []);
    expect(out.result).not.toContain('ghp_');
    expect((out.item as { output: string }).output).not.toContain('sk-ant');
    expect(out.seq).toBe(3); // non-strings preserved
    expect((out.item as { nested: Array<{ text: string }> }).nested[0]?.text).toBe('safe');
  });
});
