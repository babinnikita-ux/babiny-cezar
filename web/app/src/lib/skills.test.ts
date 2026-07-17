import { describe, expect, it } from 'vitest'

import type { Skill, WorkflowDef } from '@/api/types'

import {
  bumpSkillUsage,
  filterSkills,
  fuzzyMatch,
  isProjectSkill,
  multiWordFilter,
  orderSkills,
  orderSkillsByUsage,
  skillKeywords,
  skillUsedBy,
} from './skills'

const skill = (over: Partial<Skill> & Pick<Skill, 'name' | 'source'>): Skill => ({
  body: '',
  path: `/skills/${over.name}.md`,
  ...over,
})

describe('isProjectSkill / orderSkills (#377)', () => {
  it('classifies every server source value', () => {
    expect(isProjectSkill(skill({ name: 'a', source: 'ai' }))).toBe(true)
    expect(isProjectSkill(skill({ name: 'b', source: 'cezar' }))).toBe(true)
    expect(isProjectSkill(skill({ name: 'c', source: 'agents' }))).toBe(true)
    expect(isProjectSkill(skill({ name: 'd', source: 'global' }))).toBe(false)
    expect(isProjectSkill(skill({ name: 'e', source: 'team' }))).toBe(false)
  })

  it('orders project before global/team, stably within each half', () => {
    const ordered = orderSkills([
      skill({ name: 'g1', source: 'global' }),
      skill({ name: 'p1', source: 'agents' }),
      skill({ name: 'g2', source: 'team' }),
      skill({ name: 'p2', source: 'ai' }),
    ])
    expect(ordered.map((s) => s.name)).toEqual(['p1', 'p2', 'g1', 'g2'])
  })
})

describe('orderSkillsByUsage (#408: frequency sort, shared by both composers)', () => {
  const skills = [
    skill({ name: 'g1', source: 'global' }),
    skill({ name: 'p1', source: 'agents' }),
    skill({ name: 'g2', source: 'global' }),
    skill({ name: 'p2', source: 'ai' }),
  ]

  it('#1: sorts most-selected first within each locality half', () => {
    const ordered = orderSkillsByUsage(skills, { g2: 5, p2: 9, p1: 1 })
    // Locality first (project before global), frequency descending within each half.
    expect(ordered.map((s) => s.name)).toEqual(['p2', 'p1', 'g2', 'g1'])
  })

  it('#2: with no usage data, keeps the plain project-first fallback (stable ties)', () => {
    expect(orderSkillsByUsage(skills, undefined).map((s) => s.name)).toEqual(['p1', 'p2', 'g1', 'g2'])
    expect(orderSkillsByUsage(skills, {}).map((s) => s.name)).toEqual(['p1', 'p2', 'g1', 'g2'])
  })

  it('#2: ties (equal counts) also keep locality-then-server order, never flattened', () => {
    const ordered = orderSkillsByUsage(skills, { g1: 3, p1: 3, g2: 3, p2: 3 })
    expect(ordered.map((s) => s.name)).toEqual(['p1', 'p2', 'g1', 'g2'])
  })

  it('an unselected skill sorts below any selected one in its half', () => {
    const ordered = orderSkillsByUsage(skills, { g1: 2 })
    expect(ordered.map((s) => s.name)).toEqual(['p1', 'p2', 'g1', 'g2'])
  })

  it('a skill named after an Object.prototype member counts 0, not the inherited function', () => {
    // `usage` comes from JSON.parse (the ui-state GET), so it carries Object.prototype: a plain
    // `usage[name]` lookup returns the INHERITED function for these names, `??` does not catch a
    // non-nullish function, and the comparator goes NaN — which silently corrupts the order.
    const usage = JSON.parse('{"p1": 5}') as Record<string, number>
    const ordered = orderSkillsByUsage(
      [
        skill({ name: 'constructor', source: 'ai' }),
        skill({ name: 'toString', source: 'ai' }),
        skill({ name: 'p1', source: 'ai' }),
      ],
      usage,
    )
    expect(ordered.map((s) => s.name)).toEqual(['p1', 'constructor', 'toString'])
  })
})

describe('bumpSkillUsage (#408: the ui-state skillUsage reducer)', () => {
  it('starts a fresh count at 1 from an undefined map', () => {
    expect(bumpSkillUsage(undefined, 'om-fix')).toEqual({ 'om-fix': 1 })
  })

  it('increments an existing count without touching other entries', () => {
    expect(bumpSkillUsage({ 'om-fix': 2, 'om-review': 7 }, 'om-fix')).toEqual({
      'om-fix': 3,
      'om-review': 7,
    })
  })

  it('adds a new entry alongside existing ones', () => {
    expect(bumpSkillUsage({ 'om-fix': 1 }, 'om-review')).toEqual({ 'om-fix': 1, 'om-review': 1 })
  })

  it('a skill named after an Object.prototype member starts at 1, not string garbage', () => {
    // Same inherited-property trap as the sort: `usage['toString'] ?? 0` would yield the
    // function, and `fn + 1` a string — which the server's bounded schema now rejects with a 400.
    expect(bumpSkillUsage(JSON.parse('{}') as Record<string, number>, 'toString')).toEqual({ toString: 1 })
    expect(bumpSkillUsage(undefined, 'constructor')).toEqual({ constructor: 1 })
  })
})

describe('fuzzyMatch', () => {
  const table: Array<{ candidate: string; query: string; hit: boolean }> = [
    { candidate: 'om-fix-issue', query: '', hit: true },
    { candidate: 'om-fix-issue', query: 'fix', hit: true },
    { candidate: 'om-fix-issue', query: 'omfx', hit: true }, // subsequence
    { candidate: 'om-fix-issue', query: 'OMFX', hit: true }, // case-insensitive
    { candidate: 'om-fix-issue', query: 'xz', hit: false },
    { candidate: 'om-fix-issue', query: 'issuefix', hit: false }, // order matters
    { candidate: 'src/server/server.ts', query: 'srvts', hit: true },
  ]
  for (const { candidate, query, hit } of table) {
    it(`"${query}" ${hit ? 'finds' : 'does not find'} "${candidate}"`, () => {
      expect(fuzzyMatch(candidate, query)).toBe(hit)
    })
  }
})

describe('filterSkills (#380: filter without re-sorting — project-first survives any query)', () => {
  const skills = [
    skill({ name: 'global-deploy', source: 'global', description: 'Deploy from anywhere' }),
    skill({ name: 'project-deploy', source: 'ai' }),
    skill({ name: 'project-review', source: 'cezar', description: 'Review the diff' }),
  ]

  it('empty query keeps everything, project skills first', () => {
    expect(filterSkills(skills, '').map((s) => s.name)).toEqual([
      'project-deploy',
      'project-review',
      'global-deploy',
    ])
  })

  it('a query narrows but never reorders across the project/global split', () => {
    expect(filterSkills(skills, 'deploy').map((s) => s.name)).toEqual([
      'project-deploy',
      'global-deploy',
    ])
  })

  it('matches on the description as a fallback', () => {
    expect(filterSkills(skills, 'anywhere').map((s) => s.name)).toEqual(['global-deploy'])
  })

  it('no match → empty, never a throw', () => {
    expect(filterSkills(skills, 'zzz')).toEqual([])
  })
})

describe('multiWordFilter (#411: multi-keyword search for cmdk)', () => {
  it('empty search matches everything (score 1)', () => {
    expect(multiWordFilter('skill om-auto-review-pr', '')).toBe(1)
    expect(multiWordFilter('skill om-auto-review-pr', '   ')).toBe(1)
  })

  it('"auto review" matches "om-auto-review-pr" in the value', () => {
    expect(multiWordFilter('skill om-auto-review-pr /path', 'auto review')).toBeGreaterThan(0)
  })

  it('"verify ui" matches via keywords (name parts)', () => {
    expect(
      multiWordFilter('skill om-auto-verify-pr-ui', 'verify ui', ['om', 'auto', 'verify', 'pr', 'ui']),
    ).toBeGreaterThan(0)
  })

  it('every word must match — partial hits return 0', () => {
    expect(multiWordFilter('skill om-fix /path', 'fix deploy')).toBe(0)
  })

  it('matching is case-insensitive', () => {
    expect(multiWordFilter('skill Deploy /path', 'DEPLOY')).toBeGreaterThan(0)
  })
})

describe('skillKeywords', () => {
  it('splits hyphenated names into parts', () => {
    expect(skillKeywords('om-auto-review-pr')).toEqual(['om', 'auto', 'review', 'pr'])
  })

  it('includes the description when provided', () => {
    expect(skillKeywords('om-fix', 'Fix an issue')).toEqual(['om', 'fix', 'Fix an issue'])
  })

  it('works with a single-word name', () => {
    expect(skillKeywords('deploy', null)).toEqual(['deploy'])
  })
})

describe('skillUsedBy (the detail pane’s "Used by" breadcrumbs)', () => {
  const workflows: WorkflowDef[] = [
    {
      name: 'fix-and-verify',
      source: 'file',
      steps: [
        { id: 'fix', name: 'Fix', skill: 'om-fix' },
        { id: 'verify', skill: 'om-fix' }, // unnamed step → the id stands in
        { id: 'check', command: 'npm test' },
      ],
    },
    { name: 'ship-it', source: 'file', steps: [{ id: 'review', name: 'Review', skill: 'om-review' }] },
    { name: 'quick-task', source: 'built-in', steps: [] },
  ]

  it('lists every referencing step as "workflow › step", ids standing in for names', () => {
    expect(skillUsedBy(workflows, 'om-fix')).toEqual(['fix-and-verify › Fix', 'fix-and-verify › verify'])
    expect(skillUsedBy(workflows, 'om-review')).toEqual(['ship-it › Review'])
  })

  it('an unreferenced skill answers an empty list', () => {
    expect(skillUsedBy(workflows, 'om-unused')).toEqual([])
  })
})
