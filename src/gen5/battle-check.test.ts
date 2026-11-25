import { describe, expect, it } from 'vitest'

import { battleRefs } from './battle-check'
import type { Bw2Numbers } from './bw2-numbers'

// The few parts of bw2.json the checks read, in its shape, with invented addresses, offsets and
// values.
const NUMBERS = {
  symbols: {
    sAdapters: { name: 'sAdapters', kind: 'bss', address: 0x02100004, module: 'ov1' },
    sCommMode: { name: 'sCommMode', kind: 'bss', address: 0x02100000, module: 'ov1' },
  },
  adapterCommands: { BTL_ACMD_SELECT_ACTION: 6, BTL_ACMD_SERVER_CMD: 0x0b },
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

// Scene: the route ends once the battle's action menu stands: a local battle (sCommMode 0), the
// player's adapter in main RAM, its client on BTL_ACMD_SELECT_ACTION and not yet replied.
describe('battleRefs', () => {
  it('checks the mode, the adapter pointer, returned, the command and the size', () => {
    const { checks } = battleRefs(NUMBERS)
    expect(checks).toEqual([
      { name: 'sCommMode', address: 0x02100000, width: 4, oneOf: [0] },
      { name: 'sAdapters[0]', address: 0x02100004, width: 4, mainRamPointer: true },
      { name: 'returned', address: 0x02100004, offset: 0x20, width: 1, mask: 0x70, oneOf: [0] },
      { name: 'sendCmd.cmd', address: 0x02100004, offset: 0x2a, width: 2, oneOf: [6] },
      { name: 'sendCmd.size', address: 0x02100004, offset: 0x28, width: 2, atMost: 1200 },
    ])
  })

  it('watches both adapters and every field of the first, bitfields under their masks', () => {
    const { watch } = battleRefs(NUMBERS)
    expect(watch.map((ref) => ref.name)).toEqual([
      'sCommMode',
      'sAdapters[0]',
      'sAdapters[1]',
      'returned',
      'isNet',
      'clientId',
      'state',
      'cmd',
      'sendCmd.cmd',
      'sendCmd.size',
    ])
    expect(watch[2]).toEqual({ name: 'sAdapters[1]', address: 0x02100008, width: 4 })
    expect(watch[4]).toEqual({
      name: 'isNet',
      address: 0x02100004,
      offset: 0x20,
      width: 1,
      mask: 0x0f,
    })
  })

  it('refuses a layout without a field it needs', () => {
    const fields = Object.fromEntries(
      Object.entries(NUMBERS.adapter.fields).filter(([name]) => name !== 'state'),
    )
    const numbers: Bw2Numbers = { ...NUMBERS, adapter: { ...NUMBERS.adapter, fields } }
    expect(() => battleRefs(numbers)).toThrow("the adapter's layout has no field state")
  })

  // Scene: a layout that gives a field a size no single read covers; a check of it would compare
  // only part of the value.
  it('refuses a field of three bytes', () => {
    const fields = { ...NUMBERS.adapter.fields, cmd: { offset: 0x22, size: 3 } }
    const numbers: Bw2Numbers = { ...NUMBERS, adapter: { ...NUMBERS.adapter, fields } }
    expect(() => battleRefs(numbers)).toThrow("the adapter's field cmd has 3 bytes")
  })

  // Scene: a bw2.json generated from a checkout that lacks a symbol or a command the end needs.
  it('refuses numbers without sCommMode', () => {
    const symbols = Object.fromEntries(
      Object.entries(NUMBERS.symbols).filter(([name]) => name !== 'sCommMode'),
    )
    const numbers: Bw2Numbers = { ...NUMBERS, symbols }
    expect(() => battleRefs(numbers)).toThrow('bw2.json names no symbol sCommMode')
  })

  it('refuses numbers without BTL_ACMD_SELECT_ACTION', () => {
    const numbers: Bw2Numbers = { ...NUMBERS, adapterCommands: { BTL_ACMD_SERVER_CMD: 0x0b } }
    expect(() => battleRefs(numbers)).toThrow('bw2.json names no BTL_ACMD_SELECT_ACTION')
  })

  // Scene: a bitfield in the low bits of its byte, which the layout gives without `bit`.
  it('masks a bitfield without its first bit from bit 0', () => {
    const fields = { ...NUMBERS.adapter.fields, isNet: { offset: 0x20, size: 1, bits: 2 } }
    const numbers: Bw2Numbers = { ...NUMBERS, adapter: { ...NUMBERS.adapter, fields } }
    expect(battleRefs(numbers).watch.find((ref) => ref.name === 'isNet')?.mask).toBe(0x03)
  })
})
