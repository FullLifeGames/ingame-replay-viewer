import { describe, expect, it } from 'vitest'

import {
  type AdapterNumbers,
  adapterNumbers,
  adapterWrites,
  commandWrites,
  holdWrites,
} from './adapter'
import type { Bw2Numbers, StructLayout } from './bw2-numbers'
import type { MemoryWrite } from './ram-write'

// An invented layout and invented values: other offsets, `returned` in the high bits of its byte,
// the size before the command, and a 0x20-byte data field so the limit shows in a short block. An
// adapter.ts that hard-codes an offset or a value fails here.
const LAYOUT: StructLayout = {
  size: 0x4c,
  align: 4,
  fields: {
    netHandle: { offset: 0x00, size: 4 },
    returnSize: { offset: 0x08, size: 4 },
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
const NUMBERS: AdapterNumbers = {
  layout: LAYOUT,
  serverCmd: 0x0b,
  heldState: 2,
  queueSize: 0x40,
}
/** Another adapter command, invented, that carries no data. */
const OTHER_COMMAND = 6
const ADAPTER = 0x02180000

const shown = (writes: MemoryWrite[]) =>
  writes.map((write) =>
    write.kind === 'bytes'
      ? `${write.field} @${write.address.toString(16)} ${[...write.bytes].join(',')}`
      : `${write.field} @${write.address.toString(16)} bits ${String(write.mask)}=${String(write.value)}`,
  )

// Scene: the client reads the block only once `returned` drops to 0, so every other field must be
// in place before that last write. The server is held: the adapter's state stays IDLE, which
// BtlAdapter_WaitCmd never counts as a reply, so the server never takes the client's answer.
describe('adapterWrites', () => {
  it('writes data, size, command, the adapter command, the held state, the reply, and returned last', () => {
    const writes = adapterWrites(NUMBERS, ADAPTER, Uint8Array.of(0x00, 0x51, 0x01))
    expect(shown(writes)).toEqual([
      'sendCmd.data @218002c 0,81,1',
      'sendCmd.size @2180028 3,0',
      'sendCmd.cmd @218002a 11,0',
      'cmd @2180022 11',
      'state @2180023 2',
      'returnData @2180010 0,0,0,0',
      'returnSize @2180008 0,0,0,0',
      'returned @2180020 bits 112=0',
    ])
  })

  it('takes a block that fills the data field and refuses one byte more', () => {
    expect(adapterWrites(NUMBERS, ADAPTER, new Uint8Array(0x20))).toHaveLength(8)
    expect(() => adapterWrites(NUMBERS, ADAPTER, new Uint8Array(0x21))).toThrow(/33 bytes.*32/)
  })

  // Scene: the client copies the block into its own command queue, which may be the smaller one.
  it("refuses a block longer than the client's queue", () => {
    const small = { ...NUMBERS, queueSize: 0x10 }
    expect(adapterWrites(small, ADAPTER, new Uint8Array(0x10))).toHaveLength(8)
    expect(() => adapterWrites(small, ADAPTER, new Uint8Array(0x11))).toThrow(
      /17 bytes.*queue holds 16/,
    )
  })

  it('refuses an empty block', () => {
    expect(() => adapterWrites(NUMBERS, ADAPTER, new Uint8Array(0))).toThrow(/empty/)
  })

  it('refuses a command that its field cannot hold', () => {
    const wide = { ...NUMBERS, serverCmd: 0x100 }
    expect(() => adapterWrites(wide, ADAPTER, Uint8Array.of(1))).toThrow(/cmd/)
  })

  it('throws when the layout lacks a field it writes', () => {
    const fields = { ...LAYOUT.fields }
    delete fields['sendCmd.size']
    expect(() =>
      adapterWrites({ ...NUMBERS, layout: { ...LAYOUT, fields } }, ADAPTER, Uint8Array.of(1)),
    ).toThrow(/sendCmd\.size/)
  })

  // Scene: `returned` drops to 0 in one read-modify-write of its byte; a wider field would take
  // two, and the client could read the block between them.
  it('refuses a returned field of two bytes', () => {
    const fields = { ...LAYOUT.fields, returned: { offset: 0x20, size: 2 } }
    expect(() =>
      adapterWrites({ ...NUMBERS, layout: { ...LAYOUT, fields } }, ADAPTER, Uint8Array.of(1)),
    ).toThrow('returned must sit in one byte for a bits write')
  })

  // Scene: a layout where `returned` is a plain byte, not a bitfield.
  it('clears the whole byte when returned is no bitfield', () => {
    const fields = { ...LAYOUT.fields, returned: { offset: 0x24, size: 1 } }
    const layout = { ...LAYOUT, fields }
    const writes = adapterWrites({ ...NUMBERS, layout }, ADAPTER, Uint8Array.of(1))
    expect(shown(writes).at(-1)).toBe('returned @2180024 bits 255=0')
  })
})

// Scene: the server waits for the player's action; once the adapter's state is IDLE it waits for
// good, and the page alone decides what the client plays next.
describe('holdWrites', () => {
  it("writes the adapter's state IDLE and nothing else", () => {
    expect(shown(holdWrites(NUMBERS, ADAPTER))).toEqual(['state @2180023 2'])
  })
})

// Scene: an adapter command other than the server command, one that carries no data.
describe('commandWrites', () => {
  it('hands over an adapter command without data: no data write, size 0', () => {
    expect(shown(commandWrites(NUMBERS, ADAPTER, OTHER_COMMAND, new Uint8Array(0)))).toEqual([
      'sendCmd.size @2180028 0,0',
      'sendCmd.cmd @218002a 6,0',
      'cmd @2180022 6',
      'state @2180023 2',
      'returnData @2180010 0,0,0,0',
      'returnSize @2180008 0,0,0,0',
      'returned @2180020 bits 112=0',
    ])
  })
})

describe('adapterNumbers', () => {
  it('takes the commands and the held state from the generated numbers by name', () => {
    const numbers = {
      adapter: LAYOUT,
      adapterCommands: { BTL_ACMD_NONE: 1, BTL_ACMD_SELECT_ACTION: 6, BTL_ACMD_SERVER_CMD: 0x0b },
      adapterStates: { BTL_ADAPTER_STATE_IDLE: 2, BTL_ADAPTER_STATE_SEND: 5 },
      queueSize: 0x40,
    } as unknown as Bw2Numbers
    expect(adapterNumbers(numbers)).toEqual({
      layout: LAYOUT,
      serverCmd: 0x0b,
      heldState: 2,
      queueSize: 0x40,
    })
    const without = { ...numbers, adapterStates: {} }
    expect(() => adapterNumbers(without)).toThrow(/BTL_ADAPTER_STATE_IDLE/)
  })
})
