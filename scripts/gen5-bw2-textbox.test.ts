import { describe, expect, it } from 'vitest'

import type { TextBoxNumbers } from '../src/gen5/bw2-numbers'
import { TEXT_BOX_CARRIER } from '../src/gen5/text-box'
import { sectionSymbol, textBoxNumbers, textBoxRelations } from './gen5-bw2-textbox'
import { TEXT_BOX_INPUT, TEXT_BOX_NUMBERS as WHOLE } from './gen5-bw2-textbox.fixtures'

// The reader's invented texts and the relations' invented numbers are in
// gen5-bw2-textbox.fixtures.ts; every number here is invented.
const input = TEXT_BOX_INPUT
const STRING_C = 'src/battle/btl_string.c'

// Scene: a printed line goes into the string buffer the battle's window streams from, found from
// btl_string.c's static work through the main module and the view's core, all by name.
describe('textBoxNumbers', () => {
  it("gives the chain, the buffer's layout and guard, the window, the advances and the carrier", () => {
    expect(textBoxNumbers(input)).toEqual({
      stringWork: { name: 'sWork', kind: 'bss', address: 0x02208880, module: 'ov167' },
      mainModule: 12,
      viewCore: 12,
      strbuf: 28,
      strBuf: {
        size: 16,
        align: 4,
        fields: {
          magic: { offset: 0, size: 4 },
          size: { offset: 4, size: 2 },
          tag: { offset: 6, size: 1 },
          pad: { offset: 7, size: 3 },
          length: { offset: 10, size: 2 },
          chars: { offset: 12, size: 2 },
        },
      },
      constants: { STRBUF_MAGIC: 0x5eedbeef, CHAR_EOM: 0xfff3, CHAR_NEWLINE: 0xfff1 },
      room: 0x9c,
      windowWidth: 400,
      pageLines: 4,
      advances: { '7': 19, Z: 13, a: 17 },
      carrier: TEXT_BOX_CARRIER,
    })
  })

  it('refuses a chain member that is no word, by its struct', () => {
    const mainH = 'struct BtlMainModule { u32 seed; u16 viewCore; };\n'
    expect(() => textBoxNumbers({ ...input, mainH })).toThrow('BtlMainModule.viewCore is no word')
  })

  // Scene: the page must never guess the buffer's room, or a long line runs past it.
  it("refuses a core whose buffer's size is no literal, by the function", () => {
    const viewCoreC = input.viewCoreC.replace('GFL_StrBufCreate(0x9c,', 'GFL_StrBufCreate(ROOM,')
    expect(() => textBoxNumbers({ ...input, viewCoreC })).toThrow(
      'BtlvCore_Create makes core->strbuf with no literal size',
    )
  })

  it('refuses a window whose width is no literal, and a stream with no line step', () => {
    const scuC = input.scuC.replace('6, 1, 17, 50,', '6, 1, 17, WIDE,')
    expect(() => textBoxNumbers({ ...input, scuC })).toThrow(
      'scu->msgWin has no literal width of BmpWin_CreateDynamic',
    )
    const printsysC = input.printsysC.replace('renderer.y = 12', 'renderer.y = STEP')
    expect(() => textBoxNumbers({ ...input, printsysC })).toThrow(
      'PrintStream_Task sets no single line step',
    )
  })

  // Scene: the carrier is the game's line that a printed block sends and our text replaces; a
  // word in it, or a side's variant, would make the game format another line than we expect.
  it('refuses a carrier with a command, among the side messages, or outside the bank', () => {
    const word = input.standardBank.replace('An invented neutral line.', '{STRVAR_1 1, 0} sat.')
    expect(() => textBoxNumbers({ ...input, standardBank: word })).toThrow(
      `${TEXT_BOX_CARRIER} holds a command`,
    )
    const stringC = input.stringC.replace('0x31, 0x33,', '0x31, 0x1,')
    expect(() => textBoxNumbers({ ...input, stringC })).toThrow(
      `${TEXT_BOX_CARRIER} is one of sSideMessages`,
    )
    expect(() => textBoxNumbers({ ...input, standard: {} })).toThrow(
      `the standard bank has no ${TEXT_BOX_CARRIER}`,
    )
  })

  // Scene: the backend breaks a line by font 0's advances, so each character it may print needs
  // one.
  it('refuses a glyph with no advance and a character font 0 does not draw, by the font', () => {
    const font0 = JSON.stringify({ glyphs: [{ char: 'Z', advance: 13 }, { char: 'a' }] })
    expect(() => textBoxNumbers({ ...input, font0 })).toThrow('font0: the glyph "a" has no advance')
    expect(() => textBoxNumbers({ ...input, chars: '7Zab' })).toThrow('font0 draws no "b"')
  })
})

// Scene: the battle overlay lists a `sWork` for the network's work too; the page must write into
// the battle's text work, which only btl_string.c's own `.bss` range holds.
describe('sectionSymbol', () => {
  const place = { file: STRING_C, section: '.bss', name: 'sWork' }

  it("picks the one symbol of the name inside the file's section", () => {
    expect(sectionSymbol(input.symbols, input.battleLink, place).address).toBe(0x02208880)
  })

  it('throws by the file on a file with no such section', () => {
    const link = input.battleLink.replace(/ {4}\.bss {8}start:0x02208800.*\n/, '')
    expect(() => sectionSymbol(input.symbols, link, place)).toThrow(
      `${STRING_C} has no .bss range in the link file`,
    )
    expect(() =>
      sectionSymbol(input.symbols, input.battleLink, { ...place, file: 'src/battle/btl_zz.c' }),
    ).toThrow('src/battle/btl_zz.c has no .bss range in the link file')
  })

  it('throws by the name on none and on two inside the section', () => {
    expect(() =>
      sectionSymbol(input.symbols, input.battleLink, { ...place, name: 'sCounter' }),
    ).toThrow(`no sCounter inside ${STRING_C}'s .bss`)
    const twice = `${input.symbols}sWork kind:bss addr:0x022088c0\n`
    expect(() => sectionSymbol(twice, input.battleLink, place)).toThrow(
      `more than one sWork inside ${STRING_C}'s .bss`,
    )
  })
})

const relationsOf = (textBox: TextBoxNumbers, chars = '7Za') =>
  textBoxRelations({ textBox, font: { chars }, text: { standard: input.standard, set: {} } })

// Scene: the real spec holds the generated numbers to these relations, by name alone.
describe('textBoxRelations', () => {
  it('names no relation for numbers that hold them all', () => {
    expect(relationsOf(WHOLE)).toEqual([])
  })

  // Scene: font 0 draws symbols wider than its letters; a line of words is what the window holds.
  it('measures the window by the widest letter, not by a wider symbol', () => {
    const advances = { ...WHOLE.advances, '♂': 30 }
    expect(relationsOf({ ...WHOLE, advances }, '7Za♂')).toEqual([])
  })

  it('names each relation that fails', () => {
    const outside = { ...WHOLE.stringWork, address: 0x01ff8000 }
    expect(relationsOf({ ...WHOLE, stringWork: outside })).toEqual(['sWork in main RAM'])
    expect(relationsOf({ ...WHOLE, viewCore: 14 })).toEqual(['the chain word-aligned'])
    expect(relationsOf({ ...WHOLE, room: 80 })).toEqual(['a page of full lines in the room'])
    expect(relationsOf(WHOLE, '7Za!')).toEqual(['an advance for each character of the fonts'])
    expect(relationsOf({ ...WHOLE, windowWidth: 200 })).toEqual(['the window 20 letters wide'])
    expect(relationsOf({ ...WHOLE, pageLines: 0 })).toEqual(['a line on a page'])
    const eom = { ...WHOLE.constants, CHAR_EOM: 2 ** 32 }
    expect(relationsOf({ ...WHOLE, constants: eom })).toEqual(['the characters in a unit'])
    expect(relationsOf({ ...WHOLE, carrier: 'Bank0019_Text_Gone' })).toEqual([
      'the carrier in the standard bank',
    ])
  })
})
