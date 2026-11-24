import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildPaths } from './rom-paths.ts'
import {
  parseShotArgs,
  planStreams,
  replayFile,
  requiresEveryScene,
  withEveryTestReplay,
} from './rom-shot.ts'
import { PROGRESS_HEADER_PATH, readProgressLayout } from './rom-shot-run.ts'

describe('the arguments of rom:shots', () => {
  it('plays test replay 994052 when it gets no name', () => {
    expect(parseShotArgs([])).toEqual(['994052'])
  })

  it('takes several test replay ids and the hand-made stream, in their order', () => {
    expect(parseShotArgs(['994086', 'hand-made', '994052'])).toEqual([
      '994086',
      'hand-made',
      '994052',
    ])
  })

  it('takes the send-out streams by their name', () => {
    expect(parseShotArgs(['send-outs', 'hand-made'])).toEqual(['send-outs', 'hand-made'])
  })

  it('refuses a name that is neither a replay id, hand-made nor send-outs', () => {
    expect(() => parseShotArgs(['gen3ou-994052'])).toThrow(
      '"gen3ou-994052" is neither a test replay id (its digits, such as 994052), hand-made nor send-outs',
    )
  })

  it('refuses a stream named twice, whose frames would share one folder', () => {
    expect(() => parseShotArgs(['994052', '994052'])).toThrow(
      '"994052" is named twice; each stream writes its frames into its own folder',
    )
  })

  it('refuses an option it does not know', () => {
    expect(() => parseShotArgs(['--frames'])).toThrow()
  })
})

describe('the file of a test replay', () => {
  const files = ['smogtours-gen3ou-994052.json', 'smogtours-gen3ou-994086.json', 'README.md']

  it('is the fixture whose name ends in the id', () => {
    expect(replayFile('994086', files)).toBe('smogtours-gen3ou-994086.json')
  })

  it('does not match an id that only ends a longer one', () => {
    expect(() => replayFile('94052', files)).toThrow()
  })

  it('is refused when no fixture has the id, with the ids there are', () => {
    expect(() => replayFile('994000', files)).toThrow(
      'no test replay 994000 in test/fixtures/replays/; there are 994052, 994086',
    )
  })
})

describe('every test replay (wasm:run --all, #66)', () => {
  const files = ['gen2ou-2718267553.json', 'smogtours-gen3ou-994052.json', 'README.md']

  it('follows the named streams, each test replay once, in the order of the files', () => {
    expect(withEveryTestReplay(['hand-made', '994052'], files)).toEqual([
      'hand-made',
      '994052',
      '2718267553',
    ])
  })

  it('is every test replay in test/fixtures/replays/ when no stream is named', () => {
    const ids = withEveryTestReplay([])
    expect(ids).toContain('994052')
    expect(ids).toContain('995161')
    expect(ids.length).toBeGreaterThanOrEqual(10)
  })
})

describe('the scenes a run must have', () => {
  it('are all of them for the default runs, 994052 and hand-made', () => {
    expect(requiresEveryScene('994052')).toBe(true)
    expect(requiresEveryScene('hand-made')).toBe(true)
  })

  it('are those the stream holds for another test replay', () => {
    expect(requiresEveryScene('994086')).toBe(false)
  })
})

describe.skipIf(!existsSync(buildPaths().tree))('the send-out plans (#66, pinned tree)', () => {
  it('are one plan per battle, each to its end, before the two refusals', async () => {
    const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
    const plans = await planStreams(['send-outs'], layout)
    const names = plans.map((plan) => plan.name)
    expect(names.slice(0, 2)).toEqual(['send-outs-1', 'send-outs-2'])
    expect(names.slice(-2)).toEqual(['empty-slot', 'version-4'])
    expect(names.length).toBeGreaterThan(12)
    for (const plan of plans.slice(0, -2)) {
      expect(plan.expect).toBe('finished')
      expect(requiresEveryScene(plan.name)).toBe(false)
    }
  }, 60_000)
})
