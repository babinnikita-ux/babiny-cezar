import { afterEach, describe, expect, it } from 'vitest'

import { clearDraftText, readDraft, resetDraft, writeDraft } from './new-task-draft'

afterEach(resetDraft)

describe('the new-task draft store', () => {
  it('starts empty with the never-chosen sentinels', () => {
    expect(readDraft()).toEqual({
      text: '',
      source: null,
      runner: null,
      model: null,
      variants: 1,
      planFirst: false,
    })
  })

  it('round-trips a draft and hands out copies, not the stored object', () => {
    writeDraft({
      text: 'fix it',
      source: { source: 'skill', ref: 'om-fix' },
      runner: 'codex',
      model: 'gpt-5-codex',
      variants: 2,
      planFirst: false,
    })
    const first = readDraft()
    expect(first.text).toBe('fix it')
    first.text = 'mutated'
    expect(readDraft().text).toBe('fix it')
  })

  it('clearDraftText spends the text but keeps the picker choices (legacy keeps its pills)', () => {
    writeDraft({
      text: 'shipped',
      source: { source: 'workflow', ref: 'quick-task' },
      runner: null,
      model: 'opus',
      variants: 3,
      planFirst: true,
    })
    clearDraftText()
    expect(readDraft()).toEqual({
      text: '',
      source: { source: 'workflow', ref: 'quick-task' },
      runner: null,
      model: 'opus',
      variants: 3,
      planFirst: true,
    })
  })
})
