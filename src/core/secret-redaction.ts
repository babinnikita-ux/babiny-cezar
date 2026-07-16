/**
 * Redact credentials before they are persisted to a run's NDJSON transcript
 * (#427). Tool-result output is written verbatim to disk and served back over
 * the API, so the moment an agent runs a command whose output contains a
 * secret (`printenv`, `cat ~/.aws/credentials`, …) that secret would land in
 * `.ai/cezar/` — violating the "No secrets in state files" invariant
 * (AGENTS.md / CODE_REVIEW.md).
 *
 * Two complementary strategies:
 *   1. Value-based — the concrete values of the host's own secret-named env
 *      vars (GITHUB_TOKEN, ANTHROPIC_API_KEY, AWS_SECRET_ACCESS_KEY, …). If
 *      any of them appears in event text, it is scrubbed.
 *   2. Pattern-based — well-known token shapes (gh*, sk-*, AKIA*, AIza*,
 *      xox*-*) so secrets that never lived in cezar's own env are still caught.
 *
 * Zero-config: redaction is on by default; `CEZ_REDACT_SECRETS=0` opts out.
 */

export const REDACTED = '[REDACTED]';

/** Names whose value is a credential worth scrubbing from the transcript. */
const SECRET_VALUE_NAME_RE =
  /(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|APIKEY|API_KEY|PRIVATE_KEY|ACCESS_KEY|PASSPHRASE|_AUTH$|_AUTH_)/i;

/** Names matched above but whose value is NOT a secret (a socket path, a pid). */
const SECRET_VALUE_NAME_ALLOW: ReadonlySet<string> = new Set(['SSH_AUTH_SOCK', 'SSH_AGENT_PID']);

/** Below this length a "secret" value is too common to redact safely. */
const MIN_SECRET_LEN = 8;

/** Well-known credential shapes, independent of the host env. */
const TOKEN_PATTERNS: readonly RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub PAT / OAuth / server / user / refresh
  /github_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained PAT
  /sk-ant-[A-Za-z0-9-_]{20,}/g, // Anthropic
  /sk-[A-Za-z0-9-_]{20,}/g, // OpenAI & compatible
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /ASIA[0-9A-Z]{16}/g, // AWS temporary access key id
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /ya29\.[0-9A-Za-z_-]+/g, // Google OAuth access token
  /xox[baprs]-[0-9A-Za-z-]{10,}/g, // Slack
  /glpat-[0-9A-Za-z_-]{20,}/g, // GitLab PAT
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collect the concrete secret values present in `env` (deduped, longest
 *  first so a value that contains another is replaced whole). */
export function collectSecretValues(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < MIN_SECRET_LEN) continue;
    if (SECRET_VALUE_NAME_ALLOW.has(name)) continue;
    if (SECRET_VALUE_NAME_RE.test(name)) values.add(value);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

/** Replace every known secret value / token shape in `text` with `[REDACTED]`. */
export function redactSecrets(text: string, secretValues: readonly string[]): string {
  let out = text;
  for (const value of secretValues) {
    if (!out.includes(value)) continue;
    out = out.split(value).join(REDACTED);
  }
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

/**
 * Deep-copy `value`, redacting every string leaf. Structure/keys are
 * preserved; only string values (and string keys are left untouched — keys are
 * event field names, never secrets) are scrubbed.
 */
export function redactDeep<T>(value: T, secretValues: readonly string[]): T {
  if (typeof value === 'string') {
    return redactSecrets(value, secretValues) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, secretValues)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, secretValues);
    }
    return out as T;
  }
  return value;
}
