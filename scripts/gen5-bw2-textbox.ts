// The battle view's text box (#118), from pokebw2 at its pin: the client formats a standard line
// into the view core's string buffer (`core->strbuf`, btlv_core.c) and the message window
// (`scu->msgWin`, btlv_scu.c) streams it from there, from the next frame on. The page finds that
// buffer through btl_string.c's static work, the main module and the core, all by name, and writes
// a line Black 2 lacks into it. Part of build/gen5/bw2.json; the errors name places and show no
// number of pokebw2.
import type {
  Bw2Symbol,
  FontNumbers,
  StructLayout,
  TextBoxNumbers,
  TextNumbers,
} from '../src/gen5/bw2-numbers.ts'
import { inMainRam } from '../src/gen5/main-ram.ts'
import { WORD } from '../src/gen5/setup-chain.ts'
import { TEXT_BOX_CARRIER } from '../src/gen5/text-box.ts'
import {
  bodyOf,
  defineValue,
  literal,
  literalsIn,
  parseSymbols,
  stripComments,
} from './gen5-bw2-c.ts'
import { BATTLE_OVERLAY } from './gen5-bw2-entry.ts'
import { fontAdvances } from './gen5-bw2-font.ts'
import { checkedLayout, structLayout } from './gen5-bw2-struct.ts'

/** The files of the text box alone, by role; the reader also takes files that other keys read. */
export const TEXT_BOX_SOURCES = {
  stringC: 'src/battle/btl_string.c',
  viewCoreC: 'src/battle/btlv_core.c',
  viewH: 'include/battle/btlv.h',
  scuC: 'src/battle/btlv_scu.c',
  bmpWinH: 'include/gfl/bmpwin.h',
}

/** The texts the reader reads by role (the battle overlay's symbols and link file, the main
 * module's header, printsys.c, strbuf.c, font 0 and the standard bank beside TEXT_BOX_SOURCES),
 * the standard bank's labels and the characters both battle fonts draw. */
export type TextBoxInput = Record<
  | keyof typeof TEXT_BOX_SOURCES
  | 'symbols'
  | 'battleLink'
  | 'mainH'
  | 'printsysC'
  | 'strbufC'
  | 'font0'
  | 'standardBank',
  string
> & { standard: Readonly<Record<string, number>>; chars: string }

/** A symbol by name inside one file's section of a link file. */
interface Place {
  file: string
  section: string
  name: string
}

/** Pixels of a BG tile of the DS, the unit of a window's width and height: a fact of the
 * hardware, not of pokebw2. */
const TILE_PIXELS = 8

/** The `start` and `end` of `section` in the block of `file` in a ds-decomp link file. */
function sectionRange(link: string, { file, section }: Place): { start: number; end: number } {
  const block = link.split(/\n\s*\n/).find((text) => text.trimStart().startsWith(`${file}:\n`))
  const line = new RegExp(
    `^\\s*\\${section}\\s+start:0x([0-9a-f]+)\\s+end:0x([0-9a-f]+)\\s*$`,
    'im',
  )
  const match = block === undefined ? null : line.exec(block)
  if (match === null) throw new Error(`${file} has no ${section} range in the link file`)
  return { start: Number.parseInt(match[1] ?? '', 16), end: Number.parseInt(match[2] ?? '', 16) }
}

/** The one symbol named `place.name` inside the file's section; throws by name on none, on more
 * than one, and on a file with no such section. */
export function sectionSymbol(symbols: string, link: string, place: Place): Bw2Symbol {
  const { start, end } = sectionRange(link, place)
  const inside = parseSymbols(symbols, BATTLE_OVERLAY).filter(
    (symbol) => symbol.name === place.name && symbol.address >= start && symbol.address < end,
  )
  const where = `${place.file}'s ${place.section}`
  if (inside.length > 1) throw new Error(`more than one ${place.name} inside ${where}`)
  const [symbol] = inside
  if (symbol === undefined) throw new Error(`no ${place.name} inside ${where}`)
  return symbol
}

/** The offset of the pointer `member` of `struct`, laid out up to it; throws when it is no word. */
function pointerAt(source: string, struct: string, member: string): number {
  const field = structLayout(source, struct, member).fields[member]
  if (field?.size !== WORD) throw new Error(`${struct}.${member} is no word`)
  return field.offset
}

/** The size BtlvCore_Create gives the core's string buffer: GFL_StrBufCreate's first argument. */
function coreRoom(viewCoreC: string): number {
  const body = bodyOf(stripComments(viewCoreC), 'BtlvCore *BtlvCore_Create(')
  const size = /core->strbuf\s*=\s*GFL_StrBufCreate\(([^,)]*),/.exec(body)?.[1]
  const room = size === undefined ? undefined : literal(size)
  if (room === undefined) throw new Error('BtlvCore_Create makes core->strbuf with no literal size')
  return room
}

/** The literal argument of the message window's BmpWin_CreateDynamic call that the prototype in
 * bmpwin.h names `param`. */
function windowArgument(input: TextBoxInput, param: string): number {
  const fn = 'BmpWin_CreateDynamic'
  const proto = new RegExp(`\\b${fn}\\(([^)]*)\\)`).exec(stripComments(input.bmpWinH))?.[1] ?? ''
  const names = proto.split(',').map((part) => part.trim().split(/\s+/).pop())
  const call = new RegExp(`scu->msgWin\\s*=\\s*${fn}\\(([^)]*)\\)`).exec(stripComments(input.scuC))
  const args = (call?.[1] ?? '').split(',')
  const at = names.indexOf(param)
  const value = at < 0 || args[at] === undefined ? undefined : literal(args[at])
  if (value === undefined) throw new Error(`scu->msgWin has no literal ${param} of ${fn}`)
  return value
}

/** The pixels the stream moves down a line: the one literal PrintStream_Task sets the renderer's
 * `y` to. */
function lineStep(printsysC: string): number {
  const body = bodyOf(stripComments(printsysC), 'static void PrintStream_Task(')
  const steps = [...body.matchAll(/stream->renderer\.y\s*=\s*([^;]*);/g)].map(([, value = '']) =>
    literal(value),
  )
  const [step] = steps
  if (steps.length !== 1 || step === undefined || step === 0) {
    throw new Error('PrintStream_Task sets no single line step')
  }
  return step
}

/** The window's width in pixels and its lines a page. */
function windowOf(input: TextBoxInput): { windowWidth: number; pageLines: number } {
  const width = windowArgument(input, 'width')
  const height = windowArgument(input, 'height')
  const step = lineStep(input.printsysC)
  return { windowWidth: width * TILE_PIXELS, pageLines: Math.floor((height * TILE_PIXELS) / step) }
}

/** The carrier's label once its line holds no command, its message is no side's, and the
 * standard bank names it. */
function checkedCarrier(input: TextBoxInput): string {
  const label = TEXT_BOX_CARRIER
  const id = input.standard[label]
  const line = input.standardBank.split('\n').find((text) => text.startsWith(`${label} = `))
  if (id === undefined || line === undefined) throw new Error(`the standard bank has no ${label}`)
  if (/[{}\\]/.test(line.slice(label.length + 3))) throw new Error(`${label} holds a command`)
  const sides = /\bsSideMessages\[\]\s*=\s*\{([^}]*)\}/.exec(stripComments(input.stringC))?.[1]
  if (sides === undefined) throw new Error('btl_string.c has no sSideMessages')
  if (
    literalsIn(sides)
      .map((text) => literal(text))
      .includes(id)
  ) {
    throw new Error(`${label} is one of sSideMessages`)
  }
  return label
}

/** Font 0's advance for each of `chars`, one UTF-16 unit a character as the fonts encode them;
 * throws by the font on a character it does not draw. */
function charAdvances(input: TextBoxInput): Record<string, number> {
  const advances = fontAdvances(input.font0, 'font0')
  return Object.fromEntries(
    input.chars.split('').map((char) => {
      const advance = advances.get(char)
      if (advance === undefined) throw new Error(`font0 draws no ${JSON.stringify(char)}`)
      return [char, advance]
    }),
  )
}

/** Everything the page needs to print a line in the battle's window, checked. */
export function textBoxNumbers(input: TextBoxInput): TextBoxNumbers {
  const strBuf: StructLayout = checkedLayout(input.strbufC, 'StrBuf', [
    'size',
    'length',
    'magic',
    'chars',
  ])
  return {
    stringWork: sectionSymbol(input.symbols, input.battleLink, {
      file: TEXT_BOX_SOURCES.stringC,
      section: '.bss',
      name: 'sWork',
    }),
    mainModule: pointerAt(input.stringC, 'BtlStringWork', 'mainModule'),
    viewCore: pointerAt(input.mainH, 'BtlMainModule', 'viewCore'),
    strbuf: pointerAt(`${input.viewH}\n${input.viewCoreC}`, 'BtlvCore', 'strbuf'),
    strBuf,
    constants: {
      STRBUF_MAGIC: defineValue(input.strbufC, 'STRBUF_MAGIC'),
      CHAR_EOM: defineValue(input.printsysC, 'CHAR_EOM'),
      CHAR_NEWLINE: defineValue(input.printsysC, 'CHAR_NEWLINE'),
    },
    room: coreRoom(input.viewCoreC),
    ...windowOf(input),
    advances: charAdvances(input),
    carrier: checkedCarrier(input),
  }
}

/** The text box's numbers with the keys they relate to. */
export interface TextBoxParts {
  textBox: TextBoxNumbers
  font: FontNumbers
  text: TextNumbers
}

/** The letters a line of the window holds at least, each as wide as font 0's widest Latin letter:
 * a window misread by its tiles falls short. Font 0's symbols run wider than its letters, so the
 * bound counts letters. */
const WINDOW_LETTERS = 20
const LETTER = /^[A-Za-z]$/

/** The relations the text box's numbers must hold, by name. */
function relations({ textBox, font, text }: TextBoxParts): Record<string, boolean> {
  const { stringWork, constants, strBuf, advances, windowWidth, pageLines, room } = textBox
  const widths = Object.values(advances)
  const letters = Object.entries(advances).filter(([char]) => LETTER.test(char))
  const widestLetter = Math.max(...letters.map(([, advance]) => advance))
  const charBits = 8 * (strBuf.fields.chars?.size ?? 0)
  const fullLine = Math.floor(windowWidth / Math.min(...widths))
  const offsets = [stringWork.address + textBox.mainModule, textBox.viewCore, textBox.strbuf]
  return {
    'sWork in main RAM': inMainRam(stringWork.address, textBox.mainModule + WORD),
    'the chain word-aligned': offsets.every((offset) => offset % WORD === 0),
    'a page of full lines in the room': pageLines * (fullLine + 1) <= room,
    'an advance for each character of the fonts':
      font.chars.split('').every((char) => (advances[char] ?? 0) > 0) &&
      Object.keys(advances).length === font.chars.length,
    'the window 20 letters wide':
      letters.length > 0 && windowWidth >= WINDOW_LETTERS * widestLetter,
    'a line on a page': pageLines >= 1,
    'the characters in a unit': [constants.CHAR_EOM, constants.CHAR_NEWLINE].every(
      (char) => char < 2 ** charBits,
    ),
    'the carrier in the standard bank': Object.hasOwn(text.standard, textBox.carrier),
  }
}

/** The names of the relations the numbers break; the real spec holds the generated ones to none.
 * A name shows no number, as CI's log is public. */
export const textBoxRelations = (parts: TextBoxParts): string[] =>
  Object.entries(relations(parts))
    .filter(([, holds]) => !holds)
    .map(([name]) => name)
