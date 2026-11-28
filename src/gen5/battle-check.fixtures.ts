// The invented numbers of the battle checks' spec (src/gen5/battle-check.ts): the few parts of
// build/gen5/bw2.json that the checks read, in its shape, under pokebw2's names, with addresses,
// offsets and values of their own. scripts/gen5-fixtures-real.test.ts holds that no number here
// equals the generated one under the same name.
import type { Bw2Numbers } from './bw2-numbers.ts'

export const CHECK_NUMBERS = {
  symbols: {
    sAdapters: { name: 'sAdapters', kind: 'bss', address: 0x02100004, module: 'ov1' },
    sCommMode: { name: 'sCommMode', kind: 'bss', address: 0x02100000, module: 'ov1' },
  },
  adapterCommands: { BTL_ACMD_SELECT_ACTION: 6, BTL_ACMD_SERVER_CMD: 0x0b },
  adapterStates: { BTL_ADAPTER_STATE_IDLE: 2 },
  queueSize: 1200,
  adapter: {
    size: 0x30,
    align: 4,
    fields: {
      isNet: { offset: 0x20, size: 1, bit: 0, bits: 4 },
      returned: { offset: 0x20, size: 1, bit: 4, bits: 3 },
      clientId: { offset: 0x21, size: 1 },
      cmd: { offset: 0x22, size: 1 },
      state: { offset: 0x23, size: 1 },
      'sendCmd.size': { offset: 0x28, size: 2 },
      'sendCmd.cmd': { offset: 0x2a, size: 2 },
    },
  },
} as unknown as Bw2Numbers
