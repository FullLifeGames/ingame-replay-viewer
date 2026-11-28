// The kind census: every line kind @pkmn/protocol knows has exactly one place. A kind on no place
// would leave its lines to "no rule for", unexplained; a kind on two places says two things.
import { Protocol } from '@pkmn/protocol'
import { describe, expect, it } from 'vitest'

import { NAMED_KINDS, noRuleReason } from './census'
import { dropReasonOfKind } from './drops'
import { ruleFor } from './rules/index'

type Named = typeof NAMED_KINDS

const KINDS = Object.keys(Protocol.ARGS) as Protocol.ArgName[]

// `dropReasonOf` decides `||` by its text. `|player|` and `|-singleturn|` (Roost's) have a rule
// and drop by their line too; the rule is their place. `|detailschange|` drops a Mega's lines by
// their line too; the named list is its place.
const BY_LINE: readonly Protocol.ArgName[] = ['||']

function placesOf(kind: Protocol.ArgName, named: Named = NAMED_KINDS): string[] {
  const reason = dropReasonOfKind(kind)
  const entry = named[kind]
  return [
    ...(ruleFor(kind) === undefined ? [] : ['a rule']),
    ...(reason === undefined ? [] : [`the drop reason ${reason}`]),
    ...(BY_LINE.includes(kind) ? ['a drop by its line'] : []),
    ...(entry === undefined ? [] : [`the named list (${entry.group})`]),
  ]
}

describe('the kind census', () => {
  it('reads the kinds from @pkmn/protocol', () => {
    expect(KINDS.length).toBeGreaterThan(100)
    expect(KINDS).toContain('|move|')
  })

  it('finds every kind exactly one place', () => {
    const misplaced = KINDS.map((kind) => [kind, placesOf(kind)] as const)
      .filter(([, places]) => places.length !== 1)
      .map(([kind, places]) => `${kind} on ${places.join(' and ') || 'no place'}`)
    expect(misplaced).toEqual([])
  })

  it('counts a kind with a rule that is also named in two places', () => {
    const named: Named = { '|move|': { group: 'newer generation', reason: 'a test' } }
    expect(placesOf('|move|', named)).toEqual(['a rule', 'the named list (newer generation)'])
  })

  it('counts a kind on no place as none', () => {
    expect(placesOf('|init|', {})).toEqual([])
  })

  it('gives a kind its reason from the list, and "no rule for" a kind off it', () => {
    expect(noRuleReason('|-fieldstart|')).toMatch(/^a field condition starting: /)
    expect(noRuleReason('|move|')).toBe('no rule for |move|')
  })

  it('groups a kind that only Gen 4 and later log apart from the refused formats (#86)', () => {
    expect(NAMED_KINDS['|-fieldstart|']?.group).toBe('newer generation')
    expect(NAMED_KINDS['|-candynamax|']?.group).toBe('newer generation')
    expect(NAMED_KINDS['|swap|']?.group).toBe('refused format')
  })

  it('gives Terastallization a rule and takes it off the named list (#88)', () => {
    expect(ruleFor('|-terastallize|')).toBeDefined()
    expect(NAMED_KINDS['|-terastallize|']).toBeUndefined()
  })

  it('gives Mega Evolution a rule and keeps the other forme changes on the named list (#125)', () => {
    expect(ruleFor('|-mega|')).toBeDefined()
    expect(NAMED_KINDS['|-mega|']).toBeUndefined()
    expect(NAMED_KINDS['|detailschange|']?.reason).toMatch(/other than Mega Evolution/)
  })

  it('gives every named kind a reason', () => {
    const silent = Object.entries(NAMED_KINDS).filter(([, entry]) => entry.reason.trim() === '')
    expect(silent).toEqual([])
  })
})
