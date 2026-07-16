import { describe, expect, it } from 'vitest';
import { resumeCommand } from './server.js';

/**
 * Terminal quoting (#431): `resumeCommand` is the only variable spliced into a
 * shell command that openInTerminal hands to bash / AppleScript / `cmd /K`.
 * The session id is shell-quoted so metacharacters can never break out of the
 * argument (defense in depth — ids are UUID/CLI-minted today).
 */
describe('resumeCommand — session id shell-quoting', () => {
  it('quotes a normal session id per backend', () => {
    const id = '9f8e7d6c-1234-4abc-9def-0123456789ab';
    expect(resumeCommand(undefined, id)).toBe(`claude --resume '${id}'`);
    expect(resumeCommand('codex', id)).toBe(`codex resume '${id}'`);
    expect(resumeCommand('opencode', id)).toBe(`opencode --session '${id}'`);
  });

  it('neutralises shell metacharacters so they cannot break out of the argument', () => {
    const cmd = resumeCommand('claude', '$(touch /tmp/pwn); rm -rf ~ #');
    // Everything dangerous stays inside a single-quoted string.
    expect(cmd).toBe(`claude --resume '$(touch /tmp/pwn); rm -rf ~ #'`);
    expect(cmd.startsWith("claude --resume '")).toBe(true);
    expect(cmd.endsWith("'")).toBe(true);
  });

  it('escapes an embedded single quote (POSIX close-escape-reopen)', () => {
    expect(resumeCommand('claude', "a'b")).toBe(`claude --resume 'a'\\''b'`);
  });
});
