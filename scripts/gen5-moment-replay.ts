// A test replay's teams and trainer names for the moment script's direct start (#106): the replay
// from test/fixtures/replays/, its battle script, the Gen 5 replay of src/gen5/backend/ and both
// parties sealed as the park writes them. src/script/ imports without file extensions, as the
// page's bundler resolves it, so gen5-moment-team.ts loads this module through Vite's module
// runner (D11), not with plain Node.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Gen5Fallback } from '../src/gen5/backend/fallbacks.ts'
import { sealParties, type WrittenSides } from '../src/gen5/backend/party-mon.ts'
import { buildGen5Replay, type ReplayNumbers } from '../src/gen5/backend/replay.ts'
import type { PartySides } from '../src/gen5/direct-party.ts'
import type { ParkNames } from '../src/gen5/direct-park.ts'
import { pkmFormat } from '../src/gen5/pkm-members.ts'
import { buildBattleScript } from '../src/script/build.ts'
import { readReplay } from '../src/script/replay.ts'
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
}

/** The teams and trainer names of the test replay `id`, as the park writes them. */
export function replayTeam(id: string, numbers: ReplayNumbers): ReplayTeam {
  const path = join(GEN5_PATHS.replays, `${id}.json`)
  if (!existsSync(path)) throw new Error(`no test replay ${id} in test/fixtures/replays/`)
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const replay = buildGen5Replay(buildBattleScript(readReplay(json).log), numbers)
  const { parties, notes } = sealParties(replay.parties, pkmFormat(numbers))
  return {
    names: replay.trainers,
    parties,
    written: replay.parties,
    notes,
    fallbacks: replay.fallbacks,
  }
}
