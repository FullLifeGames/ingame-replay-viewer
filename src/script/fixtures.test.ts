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

describe('the test replays', () => {
  // Five from Smogon tournaments (#2), and a ladder replay with a multi-hit move (#15).
  it('are five tournament replays and one from the ladder', () => {
    expect(replays.filter(({ file }) => file.startsWith('smogtours-'))).toHaveLength(5)
    expect(replays).toHaveLength(6)
  })

  it.each(replays)('$file is a saved ADV OU replay', ({ file, replay }) => {
    expect(replay.id).toBe(file)
    expect(replay.id).toMatch(/^(smogtours-)?gen3ou-\d+$/)
    expect(replay.formatid).toBe('gen3ou')
    expect(replay.log.split('\n')).toContain('|gametype|singles')
  })

  it.each(COVERED_KINDS)('cover %s (|%s|)', (_scene, kind) => {
    expect(kinds).toContain(kind)
  })
})
