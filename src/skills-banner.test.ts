import { describe, expect, it } from 'vitest';

import { SKILLS_BANNER_LINES } from './skills-banner.js';

describe('SKILLS_BANNER_LINES', () => {
  it('promotes open-mercato/skills with the one-liner install command', () => {
    const text = SKILLS_BANNER_LINES.join('\n');
    expect(text).toContain('open-mercato/skills');
    expect(text).toContain("npx skills add open-mercato/skills --skill '*'");
  });

  it('is a handful of short lines — a few lines in an already-chatty startup block', () => {
    expect(SKILLS_BANNER_LINES.length).toBeGreaterThan(0);
    expect(SKILLS_BANNER_LINES.length).toBeLessThanOrEqual(6);
    for (const line of SKILLS_BANNER_LINES) expect(line.length).toBeLessThanOrEqual(90);
  });
});
