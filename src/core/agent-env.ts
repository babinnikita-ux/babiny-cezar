/**
 * Least-privilege environment for spawned agent backends (#427).
 *
 * Every backend used to inherit the FULL parent environment
 * (`{ ...process.env, ...spec.env }`), handing `GITHUB_TOKEN`,
 * `ANTHROPIC_API_KEY`, `AWS_*` and any other host secret to a process an
 * attacker-controlled prompt can drive. Instead we build an explicit,
 * curated child env: a base allowlist of the non-secret vars a shell / dev
 * toolchain genuinely needs, plus the specific auth vars the chosen backend
 * requires, plus cezar's own `CEZ_*` namespace and the per-run `spec.env`.
 * Everything else — notably arbitrary secrets — is dropped by default.
 *
 * Zero-config: the safe env is the default and needs no configuration. Two
 * opt-in escape hatches (both read from the host env, both off by default):
 *   - `CEZ_ENV_PASSTHROUGH=A,B,C` forwards those extra named vars;
 *   - `CEZ_AGENT_ENV_FULL=1` restores the legacy full-`process.env` behavior.
 */

import type { AgentBackend } from './agent-runner.js';

/** Exact var names always forwarded — non-secret, needed by shells/tools. */
const BASE_ALLOW_NAMES: ReadonlySet<string> = new Set([
  // Core shell / process identity
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'LNAME',
  'PWD',
  'OLDPWD',
  'SHLVL',
  'HOSTNAME',
  'HOST',
  'HOSTTYPE',
  'MACHTYPE',
  'OSTYPE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'TZ',
  // Locale
  'LANG',
  'LANGUAGE',
  // Terminal / display
  'TERM',
  'TERMINFO',
  'COLORTERM',
  'COLUMNS',
  'LINES',
  'CLICOLOR',
  'FORCE_COLOR',
  'NO_COLOR',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XAUTHORITY',
  // ssh agent socket/pid — a path + pid, not a credential (git over ssh)
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  // Editors / pagers
  'EDITOR',
  'VISUAL',
  'PAGER',
  'LESS',
  'MANPATH',
  'INFOPATH',
  // Git plumbing that is not a secret
  'GIT_PAGER',
  'GIT_EDITOR',
  'GIT_TERMINAL_PROMPT',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_EXEC_PATH',
  // Proxies (both cases)
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'FTP_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'ftp_proxy',
  'all_proxy',
  'no_proxy',
]);

/** Safe prefix families — dev toolchains that agents drive (node, python,
 *  rust, go, java, …). A name here still drops if it matches a secret
 *  pattern (e.g. `NODE_AUTH_TOKEN`, `CARGO_REGISTRY_TOKEN`). */
const BASE_ALLOW_PREFIXES: readonly string[] = [
  'LC_',
  'XDG_',
  'LESS_',
  // Node / JS
  'NODE_',
  'NPM_CONFIG_',
  'NVM_',
  'PNPM_',
  'YARN_',
  'BUN_',
  'DENO_',
  'VOLTA_',
  'FNM_',
  'COREPACK_',
  // Python
  'PYENV',
  'PYTHON',
  'PIP_',
  'PIPENV_',
  'POETRY_',
  'VIRTUAL_ENV',
  'CONDA_',
  'UV_',
  // Ruby
  'RBENV',
  'RUBY',
  'GEM_',
  'BUNDLE_',
  // Rust
  'RUSTUP_',
  'CARGO_',
  'RUST_',
  // Go
  'GOPATH',
  'GOROOT',
  'GOBIN',
  'GOCACHE',
  'GOMODCACHE',
  'GOFLAGS',
  'GOPROXY',
  'GOPRIVATE',
  'GOTOOLCHAIN',
  'GOOS',
  'GOARCH',
  'GOENV',
  'GOWORK',
  'GO111MODULE',
  // JVM / Android / Kotlin
  'JAVA',
  'JDK_',
  'MAVEN_',
  'GRADLE_',
  'KOTLIN_',
  'ANDROID_',
  'SDKMAN_',
  // .NET / other
  'DOTNET_',
  'NUGET_',
  'SWIFT',
  'XCODE',
  'HOMEBREW_',
  'ASDF_',
  'MISE_',
  'COMPOSER_',
];

/** Per-backend auth/config the runner genuinely needs, by prefix. */
const BACKEND_ALLOW_PREFIXES: Record<AgentBackend, readonly string[]> = {
  claude: ['ANTHROPIC_', 'CLAUDE_'],
  'claude-cli': ['ANTHROPIC_', 'CLAUDE_'],
  codex: ['OPENAI_', 'CODEX_', 'AZURE_OPENAI_'],
  opencode: [
    'OPENAI_',
    'ANTHROPIC_',
    'AZURE_OPENAI_',
    'OPENROUTER_',
    'GROQ_',
    'MISTRAL_',
    'GEMINI_',
    'GOOGLE_GENERATIVE_AI_',
    'DEEPSEEK_',
    'XAI_',
    'PERPLEXITY_',
    'TOGETHER_',
    'FIREWORKS_',
  ],
};

/** `gh` handoff (draft PRs) works in every backend — the one credential the
 *  project deliberately keeps in the environment (AGENTS.md "No secrets in
 *  state files": GITHUB_TOKEN stays in env, never on disk). */
const GH_ALLOW_NAMES: ReadonlySet<string> = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_HOST',
  'GH_ENTERPRISE_TOKEN',
  'GH_CONFIG_DIR',
]);

/**
 * Names that look like a credential. A prefix-family match is dropped when it
 * also matches this (so `NODE_AUTH_TOKEN` never rides in on `NODE_`), while
 * explicit backend/gh allow entries are forwarded regardless — that is where
 * the auth a backend needs deliberately lives.
 */
const SECRET_NAME_RE =
  /(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|_KEY$|_KEY_|APIKEY|API_KEY|PRIVATE_KEY|ACCESS_KEY|_AUTH$|_AUTH_|SESSION|COOKIE|PASSPHRASE)/i;

export function looksSecret(name: string): boolean {
  return SECRET_NAME_RE.test(name);
}

function matchesPrefix(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => name.startsWith(p));
}

export interface BuildChildEnvOptions {
  backend: AgentBackend;
  /** Per-run env (CEZ_HANDOFF_FILE etc.) — always applied, wins over host. */
  extraEnv?: Record<string, string>;
  /** Source env; defaults to `process.env`. */
  source?: NodeJS.ProcessEnv;
}

/**
 * Build the curated child environment for a spawned backend. `extraEnv`
 * (the runner's `spec.env`) is applied last so per-run vars always win.
 */
export function buildChildEnv(opts: BuildChildEnvOptions): NodeJS.ProcessEnv {
  const source = opts.source ?? process.env;
  const extra = opts.extraEnv ?? {};

  // Escape hatch: restore legacy full-inheritance (opt-in, off by default).
  if (source.CEZ_AGENT_ENV_FULL === '1') {
    return { ...source, ...extra };
  }

  const backendPrefixes = BACKEND_ALLOW_PREFIXES[opts.backend] ?? BACKEND_ALLOW_PREFIXES.claude;
  const passthrough = new Set(
    (source.CEZ_ENV_PASSTHROUGH ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (allow(name)) out[name] = value;
  }
  // Per-run env last — it is cezar's own, never a host secret, and must win.
  for (const [name, value] of Object.entries(extra)) out[name] = value;
  return out;

  function allow(name: string): boolean {
    // cezar's own namespace (CEZ_DRY_RUN plumbing, mock hooks, run wiring).
    if (name.startsWith('CEZ_')) return true;
    // Backend auth + gh handoff: forwarded even though they are secrets — the
    // backend cannot authenticate without them. They are still redacted before
    // anything reaches the on-disk NDJSON (see secret-redaction.ts).
    if (GH_ALLOW_NAMES.has(name)) return true;
    if (matchesPrefix(name, backendPrefixes)) return true;
    // Explicit opt-in passthrough.
    if (passthrough.has(name)) return true;
    // Base allowlist — exact names always, prefix families only when the name
    // is not itself credential-shaped.
    if (BASE_ALLOW_NAMES.has(name)) return true;
    if (matchesPrefix(name, BASE_ALLOW_PREFIXES) && !looksSecret(name)) return true;
    return false;
  }
}
