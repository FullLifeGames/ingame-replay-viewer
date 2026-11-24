import { describe, expect, it } from 'vitest'

import { parseShotArgs, replayFile, requiresEveryScene, withEveryTestReplay } from './rom-shot.ts'

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

  it('refuses a name that is neither a replay id nor hand-made', () => {
    expect(() => parseShotArgs(['gen3ou-994052'])).toThrow(
      '"gen3ou-994052" is neither a test replay id (its digits, such as 994052) nor hand-made',
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
