import { describe, expect, it } from 'vitest'

import { parseShotArgs, replayFile } from './rom-shot.ts'

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
