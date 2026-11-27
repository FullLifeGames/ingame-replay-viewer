import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { sealParties } from '../src/gen5/backend/party-mon'
import { buildGen5Replay, type ReplayNumbers } from '../src/gen5/backend/replay'
import { ENTRY } from '../src/gen5/direct-entry.fixtures'
import { pkmFormat } from '../src/gen5/pkm-members'
import { TEAM_PKM } from '../src/gen5/pkm.fixtures'
import { buildBattleScript } from '../src/script/build'
import { readReplay } from '../src/script/replay'
import { replayTeam } from './gen5-moment-replay'
import { GEN5_PATHS } from './gen5-paths'

// The invented numbers of these specs: the Pokémon format and the entry of src/gen5's fixtures, a
// font of printable ASCII, and a made-up pin.
const NUMBERS: ReplayNumbers = {
  pkm: TEAM_PKM,
  entry: ENTRY,
  font: { chars: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') },
  pokebw2: { repository: 'https://example.invalid/pokebw2.git', commit: 'c0ffee' },
}

/** The battle script of a test replay, read as the module reads it. */
function replayScript(id: string) {
  const json: unknown = JSON.parse(readFileSync(`${GEN5_PATHS.replays}/${id}.json`, 'utf8'))
  return buildBattleScript(readReplay(json).log)
}

// Scene: the moment script's run takes a test replay's teams and trainer names into the park.
describe('replayTeam', () => {
  it('gives the replay’s trainers, its parties as written and sealed, the cuts and the fallbacks', () => {
    const team = replayTeam('gen5ou-2718717830', NUMBERS)
    const replay = buildGen5Replay(replayScript('gen5ou-2718717830'), NUMBERS)
    expect(team.names).toEqual({ player: 'isolatedstar', opponent: 'abc2158' })
    expect(team.written).toEqual(replay.parties)
    const sealed = sealParties(replay.parties, pkmFormat(NUMBERS))
    expect(team.parties).toEqual(sealed.parties)
    expect(team.notes).toEqual(sealed.notes)
    expect(team.fallbacks).toEqual(replay.fallbacks)
    expect(team.fallbacks.map((one) => one.kind)).toEqual(['form'])
  })

  it('fails by name on an id with no test replay', () => {
    expect(() => replayTeam('gen5ou-1', NUMBERS)).toThrow(
      'no test replay gen5ou-1 in test/fixtures/replays/',
    )
  })
})
