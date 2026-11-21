import { describe, expect, it } from 'vitest'

import { builtSeriesProblems } from './build-series.ts'

const SERIES = [
  '0001-replay-takes-over-battle-main.patch',
  '0002-hide-hp-numbers.patch',
  '0003-boot-into-replay.patch',
]
const COPIED = ['include/replay_slot.h', 'src/replay_boot.c', 'src/replay_interpreter.c']
const info = (series: readonly string[], copied: readonly string[]) => ({
  series: series.map((name) => ({ name, sha256: '00' })),
  copied,
})

describe('builtSeriesProblems', () => {
  it('finds nothing in a build of the whole series with the boot file', () => {
    expect(builtSeriesProblems(info(SERIES, COPIED), SERIES)).toEqual([])
  })

  // build/rom/ once held such a build: vanilla Emerald animates, so the frames alone pass.
  it('names the series a build lacks and the one it should have', () => {
    expect(builtSeriesProblems(info([], COPIED), SERIES)).toEqual([
      'build/rom/build-info.json lists the series (none), rom/gen3/patches/series names ' +
        `${SERIES.join(', ')}: run npm run rom:build`,
    ])
  })

  it('names a series in another order', () => {
    const [problem] = builtSeriesProblems(info([...SERIES].reverse(), COPIED), SERIES)
    expect(problem).toMatch(/^build\/rom\/build-info.json lists the series 0003-/)
  })

  it('names a build without src/replay_boot.c', () => {
    const copied = COPIED.filter((path) => path !== 'src/replay_boot.c')
    expect(builtSeriesProblems(info(SERIES, copied), SERIES)).toEqual([
      'build/rom/build-info.json does not list src/replay_boot.c among the copied files: ' +
        'run npm run rom:build',
    ])
  })

  it('reads a build-info.json without the two lists as empty', () => {
    expect(builtSeriesProblems({}, SERIES)).toHaveLength(2)
    expect(builtSeriesProblems(null, SERIES)).toHaveLength(2)
  })
})
