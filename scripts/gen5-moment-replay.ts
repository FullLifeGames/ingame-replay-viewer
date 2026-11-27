// A test replay's teams and trainer names for the moment script's direct start (#106): the replay
// from test/fixtures/replays/, its battle script, the Gen 5 replay of src/gen5/backend/ and both
// parties sealed as the park writes them. With a hand scene's `turns` the log keeps the replay's
// lines before its first turn and plays those turns (gen5-moment-hits.ts' `handLog`, #107, #108),
// and the run writes the replay's blocks and checks the party orders the writer keeps after each
// event (gen5-moment-party.ts). It keeps the log by line and the battle's end
// (src/gen5/backend/end.ts) for the log of a whole replay's run (scripts/gen5-replay.ts, #110).
// src/script/ imports without file extensions, as the page's bundler resolves it, so
// gen5-moment-team.ts loads this module through Vite's module runner (D11), not with plain Node.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { type ReplayEnd, replayEnd } from '../src/gen5/backend/end.ts'
import type { Gen5Fallback } from '../src/gen5/backend/fallbacks.ts'
import { type PartyOrders, writeScript } from '../src/gen5/backend/moves.ts'
import { sealParties, type WrittenSides } from '../src/gen5/backend/party-mon.ts'
import { buildGen5Replay, type Gen5Replay, type ReplayNumbers } from '../src/gen5/backend/replay.ts'
import type { PartySides } from '../src/gen5/direct-party.ts'
import type { ParkNames } from '../src/gen5/direct-park.ts'
import { pkmFormat } from '../src/gen5/pkm-members.ts'
import { buildBattleScript } from '../src/script/build.ts'
import { readLines } from '../src/script/lines.ts'
import { readReplay } from '../src/script/replay.ts'
import type { MomentTeam } from './gen5-moment-args.ts'
import { handLog } from './gen5-moment-hits.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** What the park writes for a replay, and what the run logs of it. */
export interface ReplayTeam {
  /** The trainers' names, fitted to the font. */
  names: ParkNames
  /** Both parties sealed, in party order. */
  parties: PartySides
  /** Each Pokémon as written. */
  written: WrittenSides
  /** A line per name cut to its room in a Pokémon. */
  notes: string[]
  /** What the game shows other than the log says, in line order. */
  fallbacks: readonly Gen5Fallback[]
  /** The Gen 5 replay with its blocks; the hand team has none. */
  replay: Gen5Replay | undefined
  /** The backend's party orders after each event of the replay, in replay order; none for the
   * hand team. */
  orders: readonly PartyOrders[]
  /** The battle log by script line, counted from 0; none for the hand team. */
  lines: readonly string[]
  /** The battle's result and the messages after its last turn; none for the hand team. */
  end: ReplayEnd | undefined
}

type ReplayChoice = Omit<Extract<MomentTeam, { from: 'replay' }>, 'from'>

/** The teams and trainer names of the test replay `id`, as the park writes them, with the hand
 * `turns` in place of its turns when given. */
export function replayTeam({ id, turns }: ReplayChoice, numbers: ReplayNumbers): ReplayTeam {
  const path = join(GEN5_PATHS.replays, `${id}.json`)
  if (!existsSync(path)) throw new Error(`no test replay ${id} in test/fixtures/replays/`)
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const { log } = readReplay(json)
  const played = turns ? handLog(log, turns) : log
  const script = buildBattleScript(played)
  const replay = buildGen5Replay(script, numbers)
  const { parties, notes } = sealParties(replay.parties, pkmFormat(numbers))
  return {
    names: replay.trainers,
    parties,
    written: replay.parties,
    notes,
    fallbacks: replay.fallbacks,
    replay,
    orders: writeScript(script, numbers).orders,
    lines: readLines(played).map((line) => line.text),
    end: replayEnd(script),
  }
}
