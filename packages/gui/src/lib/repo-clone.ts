import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const exec = promisify(execFile);

const REPOS_DIR = join(homedir(), '.cezar', 'repos');

/**
 * Env var the in-repo credential helper reads the GitHub token from.
 *
 * The secret never lands in the remote URL (`.git/config`) or in any git
 * process's argv (`/proc/<pid>/cmdline`): `origin` is set to a token-less URL
 * and a tiny credential helper hands git `x-access-token:<token>` over stdin,
 * pulling the password from this env var at run time. Subsequent in-process
 * git calls (fetch/push via @cezar/core) inherit the same env, so they
 * authenticate without re-embedding the token anywhere on disk.
 */
const TOKEN_ENV = 'CEZAR_GIT_TOKEN';

// Shell credential helper: emits the username/password git's credential
// protocol expects, reading the password from $CEZAR_GIT_TOKEN at run time.
// Persisting this in .git/config is safe — it carries no secret, only the
// name of the env var to read. The leading `!` marks it as a shell command.
const CREDENTIAL_HELPER =
  `!f() { echo username=x-access-token; echo "password=$${TOKEN_ENV}"; }; f`;

/**
 * Ensures a local clone of the repo exists and is up-to-date.
 * Returns the absolute path to the repo root.
 *
 * Clones to ~/.cezar/repos/<owner>-<repo>. If already cloned,
 * fetches latest from origin.
 *
 * Authentication is supplied via a credential helper that reads the token from
 * the process environment, so the token is never written to disk (the remote
 * URL stays token-less) or exposed in the process listing (it is not passed as
 * a git argument). The token is exported into `process.env` for the lifetime of
 * the process so later in-process git operations (fetch/push) reuse it.
 */
export async function ensureRepoClone(
  owner: string,
  repo: string,
  githubToken: string,
  baseBranch: string = 'main',
): Promise<string> {
  await mkdir(REPOS_DIR, { recursive: true });

  const repoDir = join(REPOS_DIR, `${owner}-${repo}`);
  // Token-less remote — the credential helper supplies auth at run time.
  const remoteUrl = `https://github.com/${owner}/${repo}.git`;

  // Expose the token to the credential helper (this process and the in-process
  // git operations that follow). Never embedded in a URL or argv.
  process.env[TOKEN_ENV] = githubToken;

  if (existsSync(join(repoDir, '.git'))) {
    // Migrate any pre-existing token-bearing remote to the token-less URL and
    // install the credential helper so on-disk config never carries the secret.
    await exec('git', ['remote', 'set-url', 'origin', remoteUrl], { cwd: repoDir });
    await exec('git', ['config', 'credential.helper', CREDENTIAL_HELPER], { cwd: repoDir });
    await exec('git', ['fetch', 'origin'], { cwd: repoDir });
    await exec('git', ['checkout', baseBranch], { cwd: repoDir }).catch(() => {
      // branch might not exist locally yet
      return exec('git', ['checkout', '-b', baseBranch, `origin/${baseBranch}`], { cwd: repoDir });
    });
    await exec('git', ['reset', '--hard', `origin/${baseBranch}`], { cwd: repoDir });
  } else {
    // `-c credential.helper=...` carries no secret (only the helper that reads
    // $CEZAR_GIT_TOKEN), so it is safe in argv. Persist it afterwards too so
    // fetch/push reuse it.
    await exec('git', [
      '-c', `credential.helper=${CREDENTIAL_HELPER}`,
      'clone', '--depth', '50', '--branch', baseBranch, remoteUrl, repoDir,
    ]);
    await exec('git', ['config', 'credential.helper', CREDENTIAL_HELPER], { cwd: repoDir });
  }

  return repoDir;
}
