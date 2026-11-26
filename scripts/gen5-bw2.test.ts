import { describe, expect, it } from 'vitest'

import type { ArgFormat } from '../src/gen5/bw2-numbers'
import { ADAPTER_LAYOUT as LAYOUT } from '../src/gen5/adapter.fixtures'
import { checkAdapterLayout, checkCommandFormats } from './gen5-bw2'

// The adapter layout is invented, in src/gen5/adapter.fixtures.ts.
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
