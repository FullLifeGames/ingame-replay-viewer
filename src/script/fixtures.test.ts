import { describe, expect, it } from 'vitest'

import { readReplay } from './replay'

const DIR = '../../test/fixtures/replays/'

const files = import.meta.glob('../../test/fixtures/replays/*.json', {
  eager: true,
  import: 'default',
})

const replays = Object.entries(files).map(([path, json]) => ({
  file: path.slice(DIR.length, -'.json'.length),
  replay: readReplay(json),
}))

// The scenes issue #2 asks the test replays to cover, as battle log line kinds.
const COVERED_KINDS = [
  ['switches', 'switch'],
  ['forced switches', 'drag'],
  ['faints', 'faint'],
  ['status', '-status'],
  ['stat raises', '-boost'],
  ['stat drops', '-unboost'],
  ['weather', '-weather'],
  ['entry hazards', '-sidestart'],
  ['a critical hit', '-crit'],
  ['a miss', '-miss'],
  ['a multi-hit move', '-hitcount'],
  ['Mega Evolution', '-mega'],
] as const

function kindOf(line: string): string | undefined {
  return line.startsWith('|') ? line.split('|')[1] : undefined
}

const kinds = new Set(replays.flatMap(({ replay }) => replay.log.split('\n').map(kindOf)))

/**
 * The ids a test replay may have: a Gen 1 to 6 or Gen 9 OU battle or random battle, from a
 * Smogon tournament (`smogtours-`) or the ladder. The group is the format the id names.
 */
const TEST_REPLAY_ID = /^(?:smogtours-)?(gen(?:[1-6]|9)(?:ou|randombattle))-\d+$/

/** The format an id names: `gen1ou` for `smogtours-gen1ou-995161`. */
const formatOf = (id: string) => TEST_REPLAY_ID.exec(id)?.[1]

describe('the test replays', () => {
  // Five Gen 3 replays from Smogon tournaments (#2), a Gen 3 ladder replay with a multi-hit move
  // (#15), one Gen 1 and one Gen 2 replay from Smogon tournaments (#60), a Gen 3 and a Gen 2
  // ladder replay with Curse and, the Gen 3 one, Solar Beam in sun (#65), and a Gen 3 random
  // battle from the ladder with Shuckle's Wrap, a partial trap that runs for several turns (#71),
  // and two Gen 4 OU replays with Stealth Rock, one from a Smogon tournament with exact HP and one
  // from the ladder with HP in percent (#86), and two Gen 5 OU replays that open with Team
  // Preview, one from a Smogon tournament and one from the ladder (#87), and two Gen 9 OU replays
  // with Terastallization, one from a Smogon tournament with Ivy Cudgel's looks and one from the
  // ladder with snow (#88), and two Gen 9 random battles from the ladder in which Zoroark's
  // Illusion ends, once on a hit it survives and once on a knock-out (#98), and two Gen 6 OU
  // replays with a Mega Evolution on each side, one from a Smogon tournament with Trace after Mega
  // Alakazam's and one from the ladder with Drought's sun after Mega Charizard Y's (#125).
  it('are eleven tournament replays and ten from the ladder', () => {
    expect(replays.filter(({ file }) => file.startsWith('smogtours-'))).toHaveLength(11)
    expect(replays).toHaveLength(21)
  })

  it('hold seven Gen 3 OU, one Gen 1, two each of Gen 2, 4, 5, 6 and 9 OU, and three random battles', () => {
    const formats = replays.map(({ file }) => formatOf(file))
    expect(formats.filter((format) => format === 'gen3ou')).toHaveLength(7)
    expect(formats.filter((format) => format === 'gen3randombattle')).toHaveLength(1)
    expect(formats.filter((format) => format === 'gen1ou')).toHaveLength(1)
    expect(formats.filter((format) => format === 'gen2ou')).toHaveLength(2)
    expect(formats.filter((format) => format === 'gen4ou')).toHaveLength(2)
    expect(formats.filter((format) => format === 'gen5ou')).toHaveLength(2)
    expect(formats.filter((format) => format === 'gen6ou')).toHaveLength(2)
    expect(formats.filter((format) => format === 'gen9ou')).toHaveLength(2)
    expect(formats.filter((format) => format === 'gen9randombattle')).toHaveLength(2)
  })

  it.each(replays)(
    '$file is a saved Gen 1 to 6 or Gen 9 singles replay, OU or random',
    ({ file, replay }) => {
      expect(replay.id).toBe(file)
      expect(replay.id).toMatch(TEST_REPLAY_ID)
      expect(replay.formatid).toBe(formatOf(file))
      expect(replay.log.split('\n')).toContain('|gametype|singles')
    },
  )

  it.each(COVERED_KINDS)('cover %s (|%s|)', (_scene, kind) => {
    expect(kinds).toContain(kind)
  })
})

describe('formatOf', () => {
  it.each([
    ['smogtours-gen1ou-995161', 'gen1ou'],
    ['gen3ou-2717564545', 'gen3ou'],
    ['gen3randombattle-2717609379', 'gen3randombattle'],
    ['smogtours-gen4ou-690421', 'gen4ou'],
    ['smogtours-gen5ou-862240', 'gen5ou'],
    ['smogtours-gen6ou-995596', 'gen6ou'],
    ['gen6ou-2719620803', 'gen6ou'],
    ['smogtours-gen9ou-886489', 'gen9ou'],
    ['gen9ou-2719598518', 'gen9ou'],
    ['gen9randombattle-2719775756', 'gen9randombattle'],
  ])('reads the format of %s as %s', (id, format) => {
    expect(formatOf(id)).toBe(format)
  })

  it.each([
    'gen7ou-1',
    'gen8ou-1',
    'gen3uu-1',
    'gen3randomdoublesbattle-1',
    'gen3ou',
    'replay-gen3ou-1',
  ])('refuses %s, which names no test-replay format', (id) => {
    expect(formatOf(id)).toBeUndefined()
  })
})
