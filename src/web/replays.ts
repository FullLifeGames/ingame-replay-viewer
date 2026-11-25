// The test replays (#2) the page offers, each loaded only when picked. Vite bundles each JSON as
// its own chunk; the dev server serves them from test/fixtures/replays/. The labels come from
// example-replays.json, which scripts/web-examples.ts writes from the same files (#69).
import examples from './example-replays.json'

const DIR = '../../test/fixtures/replays/'

const files = import.meta.glob<unknown>('../../test/fixtures/replays/*.json', {
  import: 'default',
})

/** The replay the page picks first: the one wave 1 plays start to finish (S2a D5). */
export const FIRST_REPLAY = 'smogtours-gen3ou-994052'

export interface TestReplay {
  readonly id: string
  /** The parsed replay JSON, for `streamOfReplay`. */
  readonly load: () => Promise<unknown>
}

/** A test replay as the select "Example replay" offers it, with the label it shows. */
interface ExampleReplay extends TestReplay {
  readonly label: string
}

/** A test replay's own `format` and `players`, as scripts/web-examples.ts copies them. */
interface Example {
  readonly format: string
  readonly players: readonly string[]
}

const EXAMPLES: Readonly<Record<string, Example | undefined>> = examples

/**
 * The label the select shows for a test replay (#69): its format without the brackets around its
 * first part ("[Gen 3] OU" reads "Gen 3 OU"; a format with no such part stays as written), its
 * players in the order of `players`, and the number its id ends in (the whole id when it ends in
 * none).
 */
export function exampleLabel(id: string, { format, players }: Example): string {
  const shown = format.replace(/^\[([^\]]*)\]\s*/, '$1 ').trim()
  const number = /-(\d+)$/.exec(id)?.[1] ?? id
  return `${shown}: ${players.join(' vs ')} (${number})`
}

function exampleReplay(path: string, load: () => Promise<unknown>): ExampleReplay {
  const id = path.slice(DIR.length, -'.json'.length)
  const example = EXAMPLES[id]
  if (example === undefined) {
    throw new Error(`example-replays.json lacks ${id}: run node scripts/web-examples.ts`)
  }
  return { id, label: exampleLabel(id, example), load }
}

const byId = Object.entries(files).map(([path, load]) => exampleReplay(path, load))

/** The test replays by ID, `FIRST_REPLAY` first, with their labels. */
export const TEST_REPLAYS: readonly ExampleReplay[] = byId.toSorted(
  (a, b) =>
    Number(b.id === FIRST_REPLAY) - Number(a.id === FIRST_REPLAY) || a.id.localeCompare(b.id),
)
