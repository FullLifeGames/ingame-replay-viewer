// The test replays (#2) the page offers, each loaded only when picked. Vite bundles each JSON as
// its own chunk; the dev server serves them from test/fixtures/replays/.

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

const byId = Object.entries(files).map(([path, load]): TestReplay => ({
  id: path.slice(DIR.length, -'.json'.length),
  load,
}))

/** The test replays by ID, `FIRST_REPLAY` first. */
export const TEST_REPLAYS: readonly TestReplay[] = byId.toSorted(
  (a, b) =>
    Number(b.id === FIRST_REPLAY) - Number(a.id === FIRST_REPLAY) || a.id.localeCompare(b.id),
)
