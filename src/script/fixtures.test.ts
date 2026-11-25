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
] as const

function kindOf(line: string): string | undefined {
  return line.startsWith('|') ? line.split('|')[1] : undefined
}

const kinds = new Set(replays.flatMap(({ replay }) => replay.log.split('\n').map(kindOf)))

/**
 * The ids a test replay may have: a Gen 1 to 4 OU battle or random battle, from a Smogon
 * tournament (`smogtours-`) or the ladder. The group is the format the id names.
 */
const TEST_REPLAY_ID = /^(?:smogtours-)?(gen[1-4](?:ou|randombattle))-\d+$/

/** The format an id names: `gen1ou` for `smogtours-gen1ou-995161`. */
const formatOf = (id: string) => TEST_REPLAY_ID.exec(id)?.[1]

describe('the test replays', () => {
  // Five Gen 3 replays from Smogon tournaments (#2), a Gen 3 ladder replay with a multi-hit move
  // (#15), one Gen 1 and one Gen 2 replay from Smogon tournaments (#60), a Gen 3 and a Gen 2
  // ladder replay with Curse and, the Gen 3 one, Solar Beam in sun (#65), and a Gen 3 random
  // battle from the ladder with Shuckle's Wrap, a partial trap that runs for several turns (#71),
  // and two Gen 4 OU replays with Stealth Rock, one from a Smogon tournament with exact HP and one
  // from the ladder with HP in percent (#86).
  it('are eight tournament replays and five from the ladder', () => {
    expect(replays.filter(({ file }) => file.startsWith('smogtours-'))).toHaveLength(8)
    expect(replays).toHaveLength(13)
  })

  it('hold seven Gen 3 OU replays, one Gen 3 random battle, one Gen 1, two Gen 2 and two Gen 4', () => {
    const formats = replays.map(({ file }) => formatOf(file))
    expect(formats.filter((format) => format === 'gen3ou')).toHaveLength(7)
    expect(formats.filter((format) => format === 'gen3randombattle')).toHaveLength(1)
    expect(formats.filter((format) => format === 'gen1ou')).toHaveLength(1)
    expect(formats.filter((format) => format === 'gen2ou')).toHaveLength(2)
    expect(formats.filter((format) => format === 'gen4ou')).toHaveLength(2)
  })

  it.each(replays)(
    '$file is a saved Gen 1 to 4 singles replay, OU or random',
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
  ])('reads the format of %s as %s', (id, format) => {
    expect(formatOf(id)).toBe(format)
  })

  it.each(['gen6ou-1', 'gen3uu-1', 'gen3randomdoublesbattle-1', 'gen3ou', 'replay-gen3ou-1'])(
    'refuses %s, which names no test-replay format',
    (id) => {
      expect(formatOf(id)).toBeUndefined()
    },
  )
})
