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

/** The format an id names: `gen1ou` for `smogtours-gen1ou-995161`. */
const formatOf = (id: string) => /^(?:smogtours-)?(gen[123]ou)-\d+$/.exec(id)?.[1]

describe('the test replays', () => {
  // Five Gen 3 replays from Smogon tournaments (#2), a Gen 3 ladder replay with a multi-hit move
  // (#15), and one Gen 1 and one Gen 2 replay from Smogon tournaments (#60).
  it('are seven tournament replays and one from the ladder', () => {
    expect(replays.filter(({ file }) => file.startsWith('smogtours-'))).toHaveLength(7)
    expect(replays).toHaveLength(8)
  })

  it('hold six Gen 3 replays, one Gen 1 and one Gen 2', () => {
    const formats = replays.map(({ file }) => formatOf(file))
    expect(formats.filter((format) => format === 'gen3ou')).toHaveLength(6)
    expect(formats.filter((format) => format === 'gen1ou')).toHaveLength(1)
    expect(formats.filter((format) => format === 'gen2ou')).toHaveLength(1)
  })

  it.each(replays)('$file is a saved Gen 1, 2 or 3 OU singles replay', ({ file, replay }) => {
    expect(replay.id).toBe(file)
    expect(replay.id).toMatch(/^(smogtours-)?gen[123]ou-\d+$/)
    expect(replay.formatid).toBe(formatOf(file))
    expect(replay.log.split('\n')).toContain('|gametype|singles')
  })

  it.each(COVERED_KINDS)('cover %s (|%s|)', (_scene, kind) => {
    expect(kinds).toContain(kind)
  })
})
