import { describe, expect, it } from 'vitest'

import { isReplayId, LONGEST_REPLAY_ID, withoutPassword } from './replay-id'

// Showdown writes a private replay's ID as the public one, a hyphen, a password of 31 lowercase
// letters and digits, and "pw" (server/replays.ts).
const PASSWORD = '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5'
const PRIVATE = `gen3ou-2345678901-${PASSWORD}pw`

describe('isReplayId', () => {
  it.each(['smogtours-gen3ou-994052', 'gen3ou-1', PRIVATE, 'x'])('takes %j', (id) => {
    expect(isReplayId(id)).toBe(true)
  })

  it.each([
    '',
    'Gen3ou-1',
    'gen3ou--1',
    '-gen3ou-1',
    'gen3ou-1-',
    'gen3ou 1',
    'saved.page',
    'gen3ou_1',
    '<img>',
  ])('refuses %j', (id) => {
    expect(isReplayId(id)).toBe(false)
  })

  it('takes an ID of the longest length and refuses one character more', () => {
    expect(isReplayId('w'.repeat(LONGEST_REPLAY_ID))).toBe(true)
    expect(isReplayId('w'.repeat(LONGEST_REPLAY_ID + 1))).toBe(false)
  })

  // The longest ID Showdown writes today: a server prefix, the longest format ID of
  // config/formats.ts (39 characters), a battle number of 10 digits, and the password part.
  it('takes the longest private replay ID that Showdown writes today', () => {
    const format = 'gen9mixandmegalimitedsupplyrandombattle'
    expect(isReplayId(`smogtours-${format}-2345678901-${PASSWORD}pw`)).toBe(true)
  })
})

describe('withoutPassword', () => {
  it('keeps a public ID', () => {
    expect(withoutPassword('smogtours-gen3ou-994052')).toBe('smogtours-gen3ou-994052')
  })

  it("cuts a private replay's password part", () => {
    expect(withoutPassword(PRIVATE)).toBe('gen3ou-2345678901')
    expect(withoutPassword(`smogtours-${PRIVATE}`)).toBe('smogtours-gen3ou-2345678901')
  })

  it.each([
    [`https://replay.pokemonshowdown.com/${PRIVATE}`, ''],
    [`https://replay.pokemonshowdown.com/${PRIVATE}`, '?p2'],
    [`https://replay.pokemonshowdown.com/${PRIVATE}`, '#turn-3'],
    [`https://replay.pokemonshowdown.com/${PRIVATE}`, '/'],
    [`https://replay.pokemonshowdown.com/${PRIVATE}`, '.json'],
    [`replay.pokemonshowdown.com/${PRIVATE}`, '?p2#turn-3'],
  ])('cuts it from a link and keeps the host and the rest: %s%s', (link, rest) => {
    const host = link.slice(0, link.lastIndexOf('/') + 1)
    expect(withoutPassword(`${link}${rest}`)).toBe(`${host}gen3ou-2345678901${rest}`)
  })

  // A phone keyboard adds a space after a pasted word; a paste can bring a newline or a tab.
  const WHITESPACE = [
    ['a space', ' '],
    ['a newline', '\n'],
    ['a tab', '\t'],
    ['a no-break space', '\u00a0'],
  ]

  it.each(WHITESPACE)('cuts it from an ID followed by %s', (_name, space) => {
    expect(withoutPassword(`${PRIVATE}${space}`)).toBe(`gen3ou-2345678901${space}`)
  })

  it.each(WHITESPACE)('cuts it from a link followed by %s', (_name, space) => {
    const host = 'https://replay.pokemonshowdown.com/'
    expect(withoutPassword(`${host}${PRIVATE}${space}`)).toBe(`${host}gen3ou-2345678901${space}`)
  })

  it('cuts it from a link typed in capitals', () => {
    expect(withoutPassword(`HTTPS://Replay.PokemonShowdown.com/GEN3OU-1-ABCPW`)).toBe(
      'HTTPS://Replay.PokemonShowdown.com/GEN3OU-1',
    )
  })

  it.each([
    'smogtours-gen3ou-abcpw',
    'gen3ou-994052pw',
    'gen3ou-994052-pw',
    `gen3ou-1-${PASSWORD}pwx`,
    'https://replay.pokemonshowdown.com/gen3ou-abcpw?p2',
    'a battle log',
  ])('keeps %j, which only looks like a private ID', (text) => {
    expect(withoutPassword(text)).toBe(text)
  })

  it('reads a long run of letters and digits at once', () => {
    const start = Date.now()
    withoutPassword(`-1-${'a'.repeat(1_000_000)}`.repeat(5))
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
