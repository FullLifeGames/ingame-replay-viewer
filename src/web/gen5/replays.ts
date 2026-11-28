// The test replays the Gen 5 page offers (#111, lane plan D4): the page's one list of test replays
// (src/web/replays.ts) cut to the formats of Gen 5, by the format example-replays.json names.
// Each loads as its own chunk only when picked, from the page's own server. The picker opens on
// no replay.
import examples from '../example-replays.json'
import { TEST_REPLAYS } from '../replays'
import { NO_REPLAY } from './replay-words'

const GEN5_FORMAT = '[Gen 5]'

const FORMATS: Readonly<Record<string, { format: string } | undefined>> = examples

/** The test replays of a Gen 5 format, in the list's order, with their labels. */
export const GEN5_REPLAYS = TEST_REPLAYS.filter(({ id }) =>
  FORMATS[id]?.format.startsWith(GEN5_FORMAT),
)

/** The picker's options: no replay first (lane plan D5), then each Gen 5 test replay by label. */
export function replayOptions(): { value: string; text: string }[] {
  const replays = GEN5_REPLAYS.map(({ id, label }) => ({ value: id, text: label }))
  return [{ value: '', text: NO_REPLAY }, ...replays]
}
