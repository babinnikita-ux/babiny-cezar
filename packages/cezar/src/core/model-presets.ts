import type { RunnerId } from './agent-runner.ts';
import { resolveModelIdentity } from './model-identity.ts';

/**
 * The model-preset ids each runner's picker offers — the ids of the web composer's
 * `MODELS_BY_RUNNER` (packages/web/src/routes/new-task-form.ts), hand-mirrored the same way the
 * API types are. `''` (auto) is implicit and never listed.
 *
 * This is a cross-runner GUARD, not a whitelist: models stay free-form everywhere (custom ids
 * and config presets must keep working), so the only thing ever rejected is a model that is
 * recognizably ANOTHER runner's preset — the corruption a client/server resolution mismatch
 * can produce (#401 review). Unknown ids never conflict (fail-open).
 *
 * OpenCode lists nothing here on purpose (#794): its models are discovered from the host
 * (`opencode-model-catalog.ts`), so any hard-coded list would be one release away from naming
 * models the user's provider does not have. Its half of the guard is the structural check in
 * {@link modelConflictsWithRunner} instead, which needs no vendor knowledge at all.
 */
export const KNOWN_PRESETS_BY_RUNNER: Record<RunnerId, readonly string[]> = {
  claude: [
    'opus',
    'sonnet',
    'haiku',
    'claude-fable-5',
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-haiku-4-5',
  ],
  codex: ['gpt-5.1-codex', 'gpt-5.1-codex-mini', 'gpt-5-codex'],
  opencode: [],
};

/** True when `model` is recognizably a preset of a runner OTHER than `runner` (and not also
 *  one of `runner`'s own presets), or when `runner` cannot resolve it to a model identity at
 *  all — an `anthropic/…` id handed to codex, or a bare id handed to provider-spanning
 *  OpenCode. `''`/unknown/custom ids that the runner CAN serve never conflict. */
export function modelConflictsWithRunner(model: string, runner: RunnerId): boolean {
  if (!model) return false;
  if (KNOWN_PRESETS_BY_RUNNER[runner]?.includes(model)) return false;
  // Structural half of the guard: `resolveModelIdentity` is the same fail-loud gate the run
  // wiring calls at start-up, so anything it refuses would have failed the run anyway. Catching
  // it here turns "the run dies a minute later" into "the request is refused now", and — unlike
  // a preset list — it keeps holding for models that do not exist yet.
  try {
    resolveModelIdentity(runner, model);
  } catch {
    return true;
  }
  return Object.entries(KNOWN_PRESETS_BY_RUNNER).some(
    ([other, presets]) => other !== runner && presets.includes(model),
  );
}
