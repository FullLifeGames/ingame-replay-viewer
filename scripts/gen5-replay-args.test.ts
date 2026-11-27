import { describe, expect, it } from 'vitest'

import { readReplayOptions } from './gen5-replay-args.ts'

const NOW = 1_000_000
const ID = 'gen5ou-2718717830'

// Scene: the integrator plays a test replay whole (#110): the first run, a second run against
// the first one's marks, and a smoke run of the first blocks.
describe('readReplayOptions', () => {
  it('plays the replay as run 1 for 90 minutes, a frame every 30 frames, every block', () => {
    expect(readReplayOptions(['--replay', ID], NOW)).toEqual({
      team: { from: 'replay', id: ID, turns: undefined },
      label: `nosave-direct-${ID}-replay-r1`,
      deadlineMs: NOW + 90 * 60_000,
      run: 1,
      every: 30,
      blocks: undefined,
      against: undefined,
    })
  })

  it('takes the run, the frames, the first blocks, the minutes and the marks to compare with', () => {
    const args = ['--replay', ID, '--run', '2', '--every', '10', '--blocks', '30']
    const against = `build/gen5/runs/nosave-direct-${ID}-replay-r1.json`
    expect(readReplayOptions([...args, '--minutes', '30', '--against', against], NOW)).toEqual({
      team: { from: 'replay', id: ID, turns: undefined },
      label: `nosave-direct-${ID}-replay-r2`,
      deadlineMs: NOW + 30 * 60_000,
      run: 2,
      every: 10,
      blocks: 30,
      against,
    })
  })

  it('refuses a run with no replay', () => {
    expect(() => readReplayOptions([], NOW)).toThrow(
      new Error('gen5-replay plays a test replay: give it --replay <id>.'),
    )
  })

  it('refuses an id outside the rule of the moment script', () => {
    expect(() => readReplayOptions(['--replay', 'Gen5OU'], NOW)).toThrow(
      new Error(
        `--replay takes a test replay's id, lower-case letters and digits with single hyphens between them, not "Gen5OU".`,
      ),
    )
  })

  it('refuses minutes that are not positive', () => {
    expect(() => readReplayOptions(['--replay', ID, '--minutes', '0'], NOW)).toThrow(
      new Error('--minutes takes a positive number, not "0".'),
    )
  })

  it('refuses a run, frames or blocks that are not whole numbers from 1', () => {
    expect(() => readReplayOptions(['--replay', ID, '--run', '0'], NOW)).toThrow(
      new Error('--run takes a whole number from 1, not "0".'),
    )
    expect(() => readReplayOptions(['--replay', ID, '--every', '2.5'], NOW)).toThrow(
      new Error('--every takes a whole number from 1, not "2.5".'),
    )
    expect(() => readReplayOptions(['--replay', ID, '--blocks', 'all'], NOW)).toThrow(
      new Error('--blocks takes a whole number from 1, not "all".'),
    )
  })

  it('refuses an option it does not know', () => {
    expect(() => readReplayOptions(['--replay', ID, '--scene', 'hits'], NOW)).toThrow(
      "Unknown option '--scene'",
    )
  })
})
