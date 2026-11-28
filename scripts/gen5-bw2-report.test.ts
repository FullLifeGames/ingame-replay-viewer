import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers'
import { ODD_READ_GAUGE } from './gen5-bw2-gauge.fixtures'
import { outsideMainRam, quietLines } from './gen5-bw2-report'
import { REPORT_NUMBERS, REPORT_OUTSIDE, REPORT_SYMBOLS } from './gen5-bw2-report.fixtures'

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

// Scene: CI's log is public, so the quiet report tells that the run checked its numbers and shows
// none of them. Every number here is invented.
describe('quietLines', () => {
  const TEXT_BOX_LINE =
    'text box places found: 11, sWork in main RAM, an advance for each character, carrier Bank0019_Text_ButNothingHappened'
  const GAUGE_LINE =
    'gauge places found: 4 layouts, 6 constants, sBtlvEffect in main RAM, objMode in one byte'

  it('gives the pin, the count of symbols and the checks, and no address, offset or value', () => {
    expect(quietLines(REPORT_NUMBERS)).toEqual([
      'pokebw2 c0ffee',
      'symbols 2',
      'outside main RAM: itcm',
      'adapter layout checked: members present, offsets rising, inside the struct, bit-fields shared',
      'entry functions in ARM: Spin_Arm',
      'entry symbols all in main RAM',
      'battle overlay in main RAM, apart from the boot overlays',
      'entry layouts Kite, Lamp',
      'pkm layouts PartyPkm, PkmBlockA, PkmBlockB; block table, cipher and shiny bound read',
      "text labels of the backend's lines found: standard 1 of 4, set 0 of 5",
      "text labels of the backend's effect lines found: standard 0 of 2, set 1 of 38",
      "line sources checked: each of the backend's lines is what its function puts",
      TEXT_BOX_LINE,
      GAUGE_LINE,
    ])
  })

  // Scene: the text box's numbers (#118) reach the public log as a count of our keys, truth values
  // and the carrier's label.
  it("says where the text box's root lies and whether a character lacks an advance", () => {
    const textBox = {
      ...REPORT_NUMBERS.textBox,
      stringWork: REPORT_OUTSIDE.textBox.stringWork,
      advances: { Z: 13 },
    }
    expect(quietLines({ ...REPORT_NUMBERS, textBox }).at(-2)).toBe(
      'text box places found: 11, sWork outside main RAM, characters without an advance, carrier Bank0019_Text_ButNothingHappened',
    )
  })

  // Scene: the gauge's places (#137) reach the public log as counts of our keys and truth values.
  it("says where the gauge's root lies and whether objMode crosses a byte", () => {
    const { gauge } = REPORT_NUMBERS
    const ClActor = {
      ...gauge.layouts.ClActor,
      fields: { ...gauge.layouts.ClActor.fields, ...ODD_READ_GAUGE.layouts.ClActor.fields },
    }
    const odd = {
      ...gauge,
      effect: REPORT_OUTSIDE.gauge.effect,
      layouts: { ...gauge.layouts, ClActor },
    }
    expect(quietLines({ ...REPORT_NUMBERS, gauge: odd }).at(-1)).toBe(
      'gauge places found: 4 layouts, 6 constants, sBtlvEffect outside main RAM, objMode across bytes',
    )
  })

  // Scene: the direct entry's numbers (#97) reach the public log as names and checks alone.
  it("names the entry's ARM functions and its symbols outside main RAM, and no number", () => {
    const entry = {
      ...REPORT_NUMBERS.entry,
      functions: { Spin_Main: { call: 0x02004001, thumb: true } },
      data: REPORT_OUTSIDE.entry.data,
      battleOverlay: { start: 0x023ffc00, end: 0x02400400 },
    }
    const lines = quietLines({ ...REPORT_NUMBERS, entry })
    expect(lines).toContain('entry functions all Thumb')
    expect(lines).toContain('entry symbols outside main RAM: itcm')
    expect(lines).toContain('battle overlay outside main RAM, apart from the boot overlays')
  })

  // Scene: each of pokebw2's lists runs from 0, so its size would give away its last entry's
  // number. The invented lists here have sizes of their own; no line but the pin's and the counts
  // of our own symbol names and lines may hold a digit.
  it("prints no size of pokebw2's lists", () => {
    const names = <T>(prefix: string, size: number, value: T) =>
      Object.fromEntries(
        Array.from({ length: size }, (_, at) => [`${prefix}_${String(at)}`, value]),
      )
    const sized: Bw2Numbers = {
      ...REPORT_NUMBERS,
      adapterCommands: names('ACMD', 3, 0),
      adapterStates: names('STATE', 4, 0),
      serverCommands: names('CMD', 5, 0),
      argFormats: names('ARGS', 6, { code: 0, argCount: 0, puts: [] }),
      commandFormats: names('CMD', 7, 'ARGS_0'),
      pkm: { ...REPORT_NUMBERS.pkm, species: names('SPECIES', 8, 0), moves: names('MOVE', 9, 0) },
      text: { standard: names('Bank0019_Text_Filler', 10, 0), set: names('Bank0018_Text', 11, 0) },
    }
    const ours = [
      "text labels of the backend's lines found: standard 0 of 4, set 0 of 5",
      "text labels of the backend's effect lines found: standard 0 of 2, set 0 of 38",
    ]
    const [pin, ...rest] = quietLines(sized)
    expect(pin).toBe('pokebw2 c0ffee')
    expect(rest).toEqual(expect.arrayContaining(ours))
    expect(
      rest.filter(
        (line) =>
          ![...ours, 'symbols 2', TEXT_BOX_LINE, GAUGE_LINE].includes(line) && /\d/.test(line),
      ),
    ).toEqual([])
  })

  it('says so when every symbol lies in main RAM', () => {
    const inside = { ...REPORT_NUMBERS, symbols: { inside: REPORT_SYMBOLS.inside } }
    expect(quietLines(inside)).toContain('all symbols in main RAM')
  })
})
