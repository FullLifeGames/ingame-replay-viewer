import { describe, expect, it } from 'vitest'

import { LONGEST_REPLAY_ID } from '../script/replay-id'
import { replayJsonUrl, ReplayInputError } from './replay-input'

const JSON_URL = 'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052.json'

describe('replayJsonUrl', () => {
  it.each([
    'smogtours-gen3ou-994052',
    '  smogtours-gen3ou-994052  ',
    'smogtours-gen3ou-994052.json',
    'smogtours-gen3ou-994052.log',
    'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052',
    'http://replay.pokemonshowdown.com/smogtours-gen3ou-994052',
    'replay.pokemonshowdown.com/smogtours-gen3ou-994052',
    'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052.json',
    'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052.log',
    'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052?p2',
    'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052#turn-3',
    'https://replay.pokemonshowdown.com/smogtours-gen3ou-994052/',
    'HTTPS://Replay.PokemonShowdown.com/smogtours-gen3ou-994052',
  ])('reads %j as the replay smogtours-gen3ou-994052', (input) => {
    expect(replayJsonUrl(input)).toBe(JSON_URL)
  })

  it('keeps the password of a private replay in its ID', () => {
    const id = 'gen3ou-2345678901-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5dpw'
    expect(replayJsonUrl(`https://replay.pokemonshowdown.com/${id}`)).toBe(
      `https://replay.pokemonshowdown.com/${id}.json`,
    )
  })

  it('refuses a link to another host', () => {
    expect(() => replayJsonUrl('https://example.com/smogtours-gen3ou-994052')).toThrow(
      ReplayInputError,
    )
    expect(() => replayJsonUrl('https://example.com/smogtours-gen3ou-994052')).toThrow(
      'example.com is not replay.pokemonshowdown.com: paste a replay ID or a link to replay.pokemonshowdown.com',
    )
  })

  it('refuses a link that is not http or https', () => {
    expect(() => replayJsonUrl('ftp://replay.pokemonshowdown.com/gen3ou-1')).toThrow(
      'ftp: is not a web link: paste a replay ID or a link to replay.pokemonshowdown.com',
    )
  })

  it('refuses text with a slash that is no link', () => {
    expect(() => replayJsonUrl('https://replay pokemonshowdown/x')).toThrow(
      '"https://replay pokemonshowdown/x" is not a link: paste a replay ID or a link to replay.pokemonshowdown.com',
    )
  })

  it('refuses empty input', () => {
    expect(() => replayJsonUrl('   ')).toThrow(
      'No replay given: paste a replay ID or a link to replay.pokemonshowdown.com',
    )
  })

  it.each([
    'smogtours gen3ou 994052',
    'https://replay.pokemonshowdown.com/',
    'https://replay.pokemonshowdown.com/a/b',
    'https://replay.pokemonshowdown.com/-gen3ou',
    'Smogtours-Gen3ou-994052',
  ])('refuses %j, which holds no replay ID', (input) => {
    expect(() => replayJsonUrl(input)).toThrow(/is not a replay ID: replay IDs look like /)
  })

  it('refuses an ID longer than the longest Showdown writes', () => {
    const id = 'w'.repeat(LONGEST_REPLAY_ID)
    expect(replayJsonUrl(id)).toBe(`https://replay.pokemonshowdown.com/${id}.json`)
    expect(() => replayJsonUrl(`${id}w`)).toThrow(/is not a replay ID: replay IDs look like /)
  })
})
