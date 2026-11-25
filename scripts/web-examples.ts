// node scripts/web-examples.ts: the format and the players of each test replay in
// test/fixtures/replays/, written to src/web/example-replays.json for the labels of the select
// "Example replay" (#69). The pages load a test replay only when it is picked, so the labels come
// from this list; its spec generates the list again and compares it with the committed one.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Replay, readReplay } from '../src/script/replay.ts'
import { jsonText } from './gen3-tables.ts'
import { runCli } from './rom-cli.ts'
import { REPO_DIR } from './rom-paths.ts'

const REPLAY_DIR = join(REPO_DIR, 'test', 'fixtures', 'replays')
export const EXAMPLES_FILE = join(REPO_DIR, 'src', 'web', 'example-replays.json')

/** A file of test/fixtures/replays/: its name and its text. */
export interface ReplayFile {
  readonly name: string
  readonly text: string
}

function readFile({ name, text }: ReplayFile): Replay {
  try {
    return readReplay(JSON.parse(text))
  } catch (error) {
    throw new Error(`${name} holds no replay`, { cause: error })
  }
}

/** A test replay's own `format` and `players`, by the id its file names; readReplay checks both. */
function exampleOf(file: ReplayFile): [string, { format: string; players: string[] }] {
  const id = file.name.slice(0, -'.json'.length)
  const replay = readFile(file)
  if (replay.id !== id) throw new Error(`${file.name} holds the replay ${replay.id}`)
  return [id, { format: replay.format, players: [...replay.players] }]
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : Number(a > b))

/**
 * The list's text: each test replay's `format` and `players` as its JSON gives them, by id in
 * code-unit order, written as Prettier writes JSON (jsonText). Each JSON file is a test replay,
 * as replays.ts reads the folder.
 */
export function examplesText(files: readonly ReplayFile[]): string {
  const examples = files
    .filter(({ name }) => name.endsWith('.json'))
    .map(exampleOf)
    .toSorted(([a], [b]) => byCodeUnits(a, b))
  return jsonText(Object.fromEntries(examples))
}

/** The files of test/fixtures/replays/, in the order readdirSync gives. */
export const replayFiles = (dir = REPLAY_DIR): ReplayFile[] =>
  readdirSync(dir).map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }))

function main(): void {
  runCli('web-examples', () => {
    writeFileSync(EXAMPLES_FILE, examplesText(replayFiles()))
    process.stdout.write(`web-examples: wrote src/web/example-replays.json\n`)
  })
}

if (import.meta.main) main()
