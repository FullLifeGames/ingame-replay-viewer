import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { replayEnd } from '../src/gen5/backend/end'
import { writeScript } from '../src/gen5/backend/moves'
import { sealParties } from '../src/gen5/backend/party-mon'
import { buildGen5Replay } from '../src/gen5/backend/replay'
import { pkmFormat } from '../src/gen5/pkm-members'
import { buildBattleScript } from '../src/script/build'
import { readReplay } from '../src/script/replay'
import { handLog, HITS_TURN } from './gen5-moment-hits'
import { replayTeam } from './gen5-moment-replay'
import { GEN5_PATHS } from './gen5-paths'
import { REPLAY_NUMBERS as NUMBERS } from '../src/gen5/backend/replay.fixtures'

/** The battle log of a test replay, read as the module reads it. */
function replayLog(id: string) {
  const json: unknown = JSON.parse(readFileSync(`${GEN5_PATHS.replays}/${id}.json`, 'utf8'))
  return readReplay(json).log
}
const replayScript = (id: string) => buildBattleScript(replayLog(id))

// Scene: the moment script's run takes a test replay's teams and trainer names into the park.
describe('replayTeam', () => {
  it('gives the replay’s trainers, its parties as written and sealed, the cuts and the fallbacks', () => {
    const team = replayTeam({ id: 'gen5ou-2718717830', turns: undefined }, NUMBERS)
    const replay = buildGen5Replay(replayScript('gen5ou-2718717830'), NUMBERS)
    expect(team.names).toEqual({ player: 'isolatedstar', opponent: 'abc2158' })
    expect(team.written).toEqual(replay.parties)
    const sealed = sealParties(replay.parties, pkmFormat(NUMBERS))
    expect(team.parties).toEqual(sealed.parties)
    expect(team.notes).toEqual(sealed.notes)
    expect(team.fallbacks).toEqual(replay.fallbacks)
    expect(team.replay).toEqual(replay)
    expect(team.lines).toEqual(replayLog('gen5ou-2718717830').split('\n').slice(0, -1))
    expect(team.lines[286]).toBe('|-message|isolatedstar forfeited.')
    expect(team.end).toEqual(replayEnd(replayScript('gen5ou-2718717830')))
    const ofTeams = team.fallbacks.filter((one) => one.kind !== 'unplayed' && one.kind !== 'line')
    expect(ofTeams.map((one) => one.kind)).toEqual(['form'])
  })

  // Scene: the hits scene (#107) plays a hand turn of the replay's leads as blocks.
  it('plays the hand turns in place of the replay’s turns, with the same parties', () => {
    const team = replayTeam({ id: 'gen5ou-2718717830', turns: HITS_TURN }, NUMBERS)
    const hits = buildBattleScript(handLog(replayLog('gen5ou-2718717830'), HITS_TURN))
    expect(team.replay).toEqual(buildGen5Replay(hits, NUMBERS))
    expect(team.orders).toEqual(writeScript(hits, NUMBERS).orders)
    expect(team.replay?.blocks.length).toBeGreaterThanOrEqual(3)
    const species = (of: typeof team) => of.written.player.map((mon) => mon.species)
    const full = replayTeam({ id: 'gen5ou-2718717830', turns: undefined }, NUMBERS)
    expect(species(team)[0]).toBe(species(full)[0])
  })

  it('fails by name on an id with no test replay', () => {
    expect(() => replayTeam({ id: 'gen5ou-1', turns: undefined }, NUMBERS)).toThrow(
      'no test replay gen5ou-1 in test/fixtures/replays/',
    )
  })
})
