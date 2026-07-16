import { describe, expect, it } from 'vitest';
import { buildChildEnv, looksSecret } from './agent-env.js';

/**
 * #427: the spawned backend must NOT inherit the full host environment. It
 * gets a curated allowlist — safe shell/toolchain vars + the backend's own
 * auth + gh + cezar's `CEZ_*` — and nothing else.
 */
describe('buildChildEnv — least-privilege child env (#427)', () => {
  const HOST: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/dev',
    LANG: 'en_US.UTF-8',
    TERM: 'xterm',
    SSH_AUTH_SOCK: '/tmp/ssh-abc/agent.1',
    NODE_OPTIONS: '--max-old-space-size=4096',
    CARGO_HOME: '/home/dev/.cargo',
    // Secrets that must be dropped:
    AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    STRIPE_SECRET_KEY: 'sk_live_supersecretxxxxxxxx',
    NODE_AUTH_TOKEN: 'npm_tokenshouldnotleak',
    RANDOM_PASSWORD: 'hunter2hunter2',
  };

  it('forwards safe base + toolchain vars', () => {
    const env = buildChildEnv({ backend: 'claude', source: HOST });
    expect(env.PATH).toBe('/usr/bin:/bin');
    expect(env.HOME).toBe('/home/dev');
    expect(env.LANG).toBe('en_US.UTF-8');
    expect(env.TERM).toBe('xterm');
    expect(env.SSH_AUTH_SOCK).toBe('/tmp/ssh-abc/agent.1');
    expect(env.NODE_OPTIONS).toBe('--max-old-space-size=4096');
    expect(env.CARGO_HOME).toBe('/home/dev/.cargo');
  });

  it('drops arbitrary host secrets (AWS creds, stripe key, npm token, passwords)', () => {
    const env = buildChildEnv({ backend: 'claude', source: HOST });
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.NODE_AUTH_TOKEN).toBeUndefined(); // secret name beats NODE_ prefix
    expect(env.RANDOM_PASSWORD).toBeUndefined();
  });

  it('forwards the backend auth it genuinely needs, but not another backend’s', () => {
    const src = { ...HOST, ANTHROPIC_API_KEY: 'sk-ant-xyz', OPENAI_API_KEY: 'sk-openai-xyz' };
    const claude = buildChildEnv({ backend: 'claude', source: src });
    expect(claude.ANTHROPIC_API_KEY).toBe('sk-ant-xyz');
    expect(claude.OPENAI_API_KEY).toBeUndefined();

    const codex = buildChildEnv({ backend: 'codex', source: src });
    expect(codex.OPENAI_API_KEY).toBe('sk-openai-xyz');
    expect(codex.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('keeps GITHUB_TOKEN for the gh handoff and the CEZ_* namespace', () => {
    const src = {
      ...HOST,
      GITHUB_TOKEN: 'gho_token',
      CEZ_DRY_RUN: '1',
      CEZ_MOCK_ARGS_FILE: '/tmp/args',
    };
    const env = buildChildEnv({ backend: 'claude', source: src });
    expect(env.GITHUB_TOKEN).toBe('gho_token');
    expect(env.CEZ_DRY_RUN).toBe('1');
    expect(env.CEZ_MOCK_ARGS_FILE).toBe('/tmp/args');
  });

  it('applies extraEnv (spec.env) last so per-run vars always win', () => {
    const env = buildChildEnv({
      backend: 'claude',
      source: { ...HOST, PATH: '/host' },
      extraEnv: { CEZ_HANDOFF_FILE: '/runs/x.md', PATH: '/override' },
    });
    expect(env.CEZ_HANDOFF_FILE).toBe('/runs/x.md');
    expect(env.PATH).toBe('/override');
  });

  it('opt-in CEZ_ENV_PASSTHROUGH forwards named extras', () => {
    const src = { ...HOST, MY_TOOLCHAIN_DIR: '/opt/tc', CEZ_ENV_PASSTHROUGH: 'MY_TOOLCHAIN_DIR' };
    const env = buildChildEnv({ backend: 'claude', source: src });
    expect(env.MY_TOOLCHAIN_DIR).toBe('/opt/tc');
  });

  it('opt-in CEZ_AGENT_ENV_FULL=1 restores legacy full inheritance (escape hatch)', () => {
    const src = { ...HOST, CEZ_AGENT_ENV_FULL: '1' };
    const env = buildChildEnv({ backend: 'claude', source: src });
    expect(env.AWS_SECRET_ACCESS_KEY).toBe(HOST.AWS_SECRET_ACCESS_KEY);
  });
});

describe('looksSecret', () => {
  it('flags credential-shaped names', () => {
    for (const n of ['GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'FOO_API_KEY', 'DB_PASSWORD', 'NODE_AUTH_TOKEN']) {
      expect(looksSecret(n)).toBe(true);
    }
  });
  it('does not flag ordinary names', () => {
    for (const n of ['PATH', 'HOME', 'NODE_OPTIONS', 'CARGO_HOME', 'LANG']) {
      expect(looksSecret(n)).toBe(false);
    }
  });
});
