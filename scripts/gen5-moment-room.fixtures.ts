// The backend's invented numbers with a block room wide enough that no action of a scene splits,
// as none splits in the game's room: the scene specs of #108 and #109 build their blocks on it.
// The width stands under the names of the queue's size and the adapter's command data, so
// scripts/gen5-fixtures-real.test.ts holds it apart from the generated numbers.
import { REPLAY_NUMBERS as NUMBERS } from '../src/gen5/backend/replay.fixtures.ts'

const WIDE = 0x200
const data = NUMBERS.adapter.fields['sendCmd.data']

/** REPLAY_NUMBERS with the wide block room. */
export const ROOMY_NUMBERS = {
  ...NUMBERS,
  queueSize: WIDE,
  adapter: {
    ...NUMBERS.adapter,
    fields: {
      ...NUMBERS.adapter.fields,
      'sendCmd.data': { offset: data?.offset ?? 0, size: WIDE },
    },
  },
}
