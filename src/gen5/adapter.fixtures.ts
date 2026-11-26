// An invented adapter layout (#72) for the specs of the adapter, the generator and the moment's
// plan: every offset and size is made up for them, and none is copied from pokebw2.
// scripts/gen5-fixtures-real.test.ts holds that no member sits at its place in build/gen5/bw2.json
// under the same name.
import type { StructLayout } from './bw2-numbers.ts'

/** Every member the spike reads, at offsets of its own: `returned` in the high bits of its byte,
 * the size before the command, and a 0x20-byte data field so the limit shows in a short block. */
export const ADAPTER_LAYOUT: StructLayout = {
  size: 0x4c,
  align: 4,
  fields: {
    netHandle: { offset: 0x04, size: 4 },
    returnSize: { offset: 0x0c, size: 4 },
    returnData: { offset: 0x10, size: 4 },
    isNet: { offset: 0x20, size: 1, bit: 0, bits: 4 },
    returned: { offset: 0x20, size: 1, bit: 4, bits: 3 },
    clientId: { offset: 0x21, size: 1 },
    cmd: { offset: 0x22, size: 1 },
    state: { offset: 0x23, size: 1 },
    sendCmd: { offset: 0x28, size: 0x24 },
    'sendCmd.size': { offset: 0x28, size: 2 },
    'sendCmd.cmd': { offset: 0x2a, size: 2 },
    'sendCmd.data': { offset: 0x2c, size: 0x20 },
  },
}
