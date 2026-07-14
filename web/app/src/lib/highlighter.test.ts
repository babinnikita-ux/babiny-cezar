import { describe, expect, it } from 'vitest'

import { canonicalLang, highlight, highlightSync, isPlainLang, supportedLanguages } from './highlighter'

/**
 * The Shiki singleton, exercised for real: the JS regex engine is pure JS, so jsdom runs the
 * actual highlighter — no stubbing. The first `highlight` call cold-boots the core through the
 * same dynamic imports the browser uses.
 */
describe('highlighter singleton', () => {
  it('maps fence aliases onto the grammar allowlist, and unknown infos onto null', () => {
    expect(canonicalLang('ts')).toBe('typescript')
    expect(canonicalLang('TS')).toBe('typescript')
    expect(canonicalLang('bash')).toBe('shellscript')
    expect(canonicalLang('sh')).toBe('shellscript')
    expect(canonicalLang('python')).toBe('python')
    expect(canonicalLang('wat-is-this')).toBeNull()
    expect(isPlainLang('')).toBe(true)
    expect(isPlainLang('plaintext')).toBe(true)
    expect(isPlainLang('ts')).toBe(false)
  })

  it('answers unknown fence languages synchronously with plaintext — never a crash', () => {
    const result = highlightSync('hello <world>', 'not-a-language')
    expect(result).toEqual({
      tokens: [[{ content: 'hello <world>' }]],
      fg: 'var(--syn-var)',
      bg: 'transparent',
    })
  })

  it('highlights TypeScript through the CSS-variable theme — colors are var(--syn-*), never hex', async () => {
    const result = await highlight('const x = "hi" // note', 'ts')
    const tokens = result.tokens[0]!
    const colors = new Set(tokens.map((t) => t.color))
    expect(colors.has('var(--syn-key)')).toBe(true) // const
    expect(colors.has('var(--syn-str)')).toBe(true) // "hi"
    expect(colors.has('var(--syn-com)')).toBe(true) // the comment
    for (const color of colors) {
      expect(color).toMatch(/^var\(--syn-[a-z]+\)$/)
    }
    expect(result.bg).toBe('transparent')
  })

  it('is resident after the first load: the same language then highlights synchronously', async () => {
    await highlight('let a = 1', 'ts')
    const sync = highlightSync('let b = 2', 'typescript')
    expect(sync).not.toBeNull()
    expect(sync!.tokens[0]!.some((t) => t.color === 'var(--syn-key)')).toBe(true)
  })

  it('multi-line code keeps its line structure (heights are predictable pre-highlight)', async () => {
    const result = await highlight('const a = 1\nconst b = 2\n', 'ts')
    expect(result.tokens).toHaveLength(3) // two lines + the trailing empty one
  })

  it('names every supported spelling exactly once each', () => {
    const langs = supportedLanguages()
    expect(langs).toContain('ts')
    expect(langs).toContain('typescript')
    expect(langs).toContain('plaintext')
    expect(new Set(langs).size).toBe(langs.length)
  })
})
