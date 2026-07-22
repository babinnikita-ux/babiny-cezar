import type {
  AgentEvent,
  AgentRunResult,
  AgentRunSpec,
  AgentRunner,
  AgentSession,
  SessionOptions,
} from './agent-runner.js';
import { ClaudeCliRunner, mockClaudePath } from './claude-cli-runner.js';

export interface PiRunnerOptions {
  /** Override the binary name/path; defaults to `pi` on PATH (`CEZ_PI_BIN`). */
  bin?: string;
  /** Wall-clock timeout for a run (ms); per-spec `timeoutMs` still wins. */
  timeoutMs?: number;
}

/**
 * `AgentRunner` over the `pi` coding CLI (#387). `pi` drives an autonomous
 * multi-turn session over headless stream-json on stdin/stdout — the same wire
 * shape the Claude runner already speaks — and selects its model with the
 * canonical `provider/model` string (e.g. `anthropic/claude-opus-4-8`), the
 * form {@link toBackendModel} hands it (pi has no default provider, so a bare
 * model id is rejected loudly upstream rather than silently defaulted).
 *
 * Because the wire protocol matches Claude's, this runner delegates the proven
 * session machinery (multi-turn stdin, EOF watchdog, wall-clock kill switch,
 * normalized {@link AgentEvent} emission) to a {@link ClaudeCliRunner} bound to
 * pi's binary — the ONE difference past the seam is the `backend` id and which
 * binary is spawned. No pi-specific wire type leaks past `AgentRunner`.
 *
 * `CEZ_PI_BIN` overrides the binary; `CEZ_DRY_RUN=1` swaps in the bundled mock
 * (shared with the Claude runner) so the cockpit / store / GUI can be exercised
 * without a real pi install or burning tokens. Tool access is default-deny
 * (`--allowedTools`), inherited from the delegated stream-json runner.
 */
export class PiRunner implements AgentRunner {
  readonly backend = 'pi' as const;

  /**
   * The delegate. Its own `backend` reads `'claude'` and is deliberately never consulted —
   * `PiRunner.backend` is the seam's identity, and the inner instance exists only for its
   * stream-json transport. Nothing reads `inner.backend`; a `backend` that reached the store
   * or the UI would come from this class, so the contradiction stays contained here.
   */
  private readonly inner: ClaudeCliRunner;

  constructor(opts: PiRunnerOptions = {}) {
    const bin =
      opts.bin ??
      process.env.CEZ_PI_BIN ??
      (process.env.CEZ_DRY_RUN === '1' ? mockClaudePath() : 'pi');
    // `envBackend: 'pi'` — the delegate spawns PI's binary, and buildChildEnv is least-privilege
    // per backend, so the child must be scoped to pi's credential allowlist (the multi-provider
    // set a `provider/model` id can name), not to claude's Anthropic-only one.
    this.inner = new ClaudeCliRunner({ bin, timeoutMs: opts.timeoutMs, envBackend: this.backend });
  }

  run(spec: AgentRunSpec, onEvent?: (event: AgentEvent) => void): Promise<AgentRunResult> {
    return this.inner.run(spec, onEvent);
  }

  startSession(
    spec: AgentRunSpec,
    onEvent?: (event: AgentEvent) => void,
    opts?: SessionOptions,
  ): AgentSession {
    return this.inner.startSession(spec, onEvent, opts);
  }

  interrupt(): Promise<void> {
    return this.inner.interrupt();
  }
}
