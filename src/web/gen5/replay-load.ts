// A test replay as the Gen 5 page plays it (#111): the replay JSON read, its battle script built,
// the Gen 5 replay of src/gen5/backend/, the battle's end and the log by line. The page's one
// importer of src/script/build.ts, which plain Node cannot load (src/script/ imports without file
// extensions), so it lives where Vite bundles it. A reader's error passes on by its message.
import { type ReplayEnd, replayEnd } from '../../gen5/backend/end.ts'
import { buildGen5Replay, type Gen5Replay, type ReplayNumbers } from '../../gen5/backend/replay.ts'
import { buildBattleScript } from '../../script/build.ts'
import { readLines } from '../../script/lines.ts'
import { readReplay } from '../../script/replay.ts'

export interface LoadedReplay {
  replay: Gen5Replay
  end: ReplayEnd
  /** The battle log by script line, counted from 0. */
  lines: readonly string[]
}

/** The Gen 5 replay, the battle's end and the log's lines of a test replay's JSON. */
export function loadReplay(json: unknown, numbers: ReplayNumbers): LoadedReplay {
  const { log } = readReplay(json)
  const script = buildBattleScript(log)
  return {
    replay: buildGen5Replay(script, numbers),
    end: replayEnd(script),
    lines: readLines(log).map((line) => line.text),
  }
}
