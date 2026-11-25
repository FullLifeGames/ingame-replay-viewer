import { describe, expect, it } from 'vitest'

import type { ArgFormat, Bw2Numbers, StructLayout } from '../src/gen5/bw2-numbers'
import { checkAdapterLayout, checkCommandFormats, outsideMainRam, quietLines } from './gen5-bw2'

// An invented adapter layout: every member the spike reads, at offsets of its own.
const LAYOUT: StructLayout = {
  size: 0x50,
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
const without = (name: string) =>
  Object.fromEntries(Object.entries(LAYOUT.fields).filter(([field]) => field !== name))

// Scene: a misread struct must stop the generator before the page writes at a wrong offset.
describe('checkAdapterLayout', () => {
  it('passes a layout that has every member, in rising order, inside the struct', () => {
    expect(() => {
      checkAdapterLayout(LAYOUT)
    }).not.toThrow()
  })

  it('names a member the spike reads that the layout lacks', () => {
    expect(() => {
      checkAdapterLayout({ ...LAYOUT, fields: without('sendCmd.size') })
    }).toThrow(/sendCmd\.size/)
  })

  it('refuses offsets that fall back, and a member past the end of the struct', () => {
    const back = { ...LAYOUT.fields, clientId: { offset: 0x1f, size: 1 } }
    expect(() => {
      checkAdapterLayout({ ...LAYOUT, fields: back })
    }).toThrow(/clientId.*0x1f/)
    expect(() => {
      checkAdapterLayout({ ...LAYOUT, size: 0x40 })
    }).toThrow(/sendCmd.*0x40/)
  })

  it('refuses returned and isNet unless they are bit-fields of one byte that do not overlap', () => {
    const apart = { ...LAYOUT.fields, isNet: { offset: 0x1f, size: 1, bit: 0, bits: 4 } }
    expect(() => {
      checkAdapterLayout({ ...LAYOUT, fields: apart })
    }).toThrow(/returned.*isNet/)
    const whole = { ...LAYOUT.fields, returned: { offset: 0x20, size: 1 } }
    expect(() => {
      checkAdapterLayout({ ...LAYOUT, fields: whole })
    }).toThrow(/returned.*isNet/)
    const overlap = { ...LAYOUT.fields, returned: { offset: 0x20, size: 1, bit: 2, bits: 3 } }
    expect(() => {
      checkAdapterLayout({ ...LAYOUT, fields: overlap })
    }).toThrow(/returned.*isNet/)
  })
})

describe('outsideMainRam', () => {
  it('names each symbol outside 0x02000000 to 0x023FFFFF', () => {
    const at = (name: string, address: number) => ({
      name,
      kind: 'bss' as const,
      address,
      module: 'ov001',
    })
    expect(
      outsideMainRam({
        low: at('low', 0x02000000),
        high: at('high', 0x023ffffc),
        itcm: at('itcm', 0x01ff8000),
        mirror: at('mirror', 0x027ffe00),
      }),
    ).toEqual(['itcm 0x01FF8000', 'mirror 0x027FFE00'])
  })
})

// Scene: a command the table leaves out stops the run instead of packing with no format.
describe('checkCommandFormats', () => {
  const formats: Record<string, ArgFormat> = {
    ARGS_NONE: { code: 0, argCount: 0, puts: [] },
    ARGS_U8: {
      code: 1,
      argCount: 1,
      puts: [{ bytes: 1, fields: [{ arg: 0, mask: 0xff, shift: 0 }] }],
    },
  }
  const commands = { CMD_A: 0, CMD_B: 1, CMD_MAX: 2 }

  it('gives each command below the bound its format', () => {
    expect(
      checkCommandFormats(commands, 'CMD_MAX', { CMD_A: 'ARGS_NONE', CMD_B: 'ARGS_U8' }, formats),
    ).toEqual({
      CMD_A: 'ARGS_NONE',
      CMD_B: 'ARGS_U8',
    })
  })

  it('throws on a command without a format, an unknown format and an unknown command', () => {
    expect(() => checkCommandFormats(commands, 'CMD_MAX', { CMD_A: 'ARGS_NONE' }, formats)).toThrow(
      /CMD_B/,
    )
    expect(() =>
      checkCommandFormats(commands, 'CMD_MAX', { CMD_A: 'ARGS_NONE', CMD_B: 'ARGS_U9' }, formats),
    ).toThrow(/ARGS_U9/)
    expect(() =>
      checkCommandFormats(
        commands,
        'CMD_MAX',
        { CMD_A: 'ARGS_NONE', CMD_B: 'ARGS_U8', CMD_C: 'ARGS_U8' },
        formats,
      ),
    ).toThrow(/CMD_C/)
  })
})

// Scene: CI's log is public, so the quiet report tells that the run checked its numbers and shows
// none of them. Every number here is invented.
describe('quietLines', () => {
  const symbol = (name: string, address: number) => ({
    name,
    kind: 'data' as const,
    address,
    module: 'ov001',
  })
  const numbers: Bw2Numbers = {
    pokebw2: { repository: 'https://example.invalid/pokebw2.git', commit: 'c0ffee' },
    symbols: { inside: symbol('inside', 0x02012345), itcm: symbol('itcm', 0x01ff8123) },
    adapterCommands: { ACMD_A: 7, ACMD_B: 9 },
    adapterStates: { STATE_A: 5 },
    serverCommands: { CMD_A: 11, CMD_B: 13, CMD_MAX: 17 },
    argFormats: { ARGS_NONE: { code: 19, argCount: 0, puts: [] } },
    commandFormats: { CMD_A: 'ARGS_NONE', CMD_B: 'ARGS_NONE' },
    messages: { formats: [], soundCommand: 'CMD_B', argEnd: 23 },
    queueSize: 0x77,
    adapter: LAYOUT,
    battle: {
      server: LAYOUT,
      mainModule: LAYOUT,
      pokeCon: LAYOUT,
      party: LAYOUT,
      monCore: LAYOUT,
      waitSelectSeq: 29,
    },
  }

  it('gives the pin, the counts and the checks, and no address, offset or value', () => {
    expect(quietLines(numbers)).toEqual([
      'pokebw2 c0ffee',
      'symbols 2, adapter commands 2, adapter states 1',
      'server commands 3, formats 1, format table entries 2',
      'outside main RAM: itcm',
      'adapter layout checked: members present, offsets rising, inside the struct, bit-fields shared',
    ])
  })

  it('says so when every symbol lies in main RAM', () => {
    const inside = { ...numbers, symbols: { inside: symbol('inside', 0x02012345) } }
    expect(quietLines(inside)).toContain('all symbols in main RAM')
  })
})
