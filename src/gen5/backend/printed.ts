// The lines that Black 2 lacks and that print in its text box (#118): a simulator's message, the
// winner and a tie. Each text goes through the battle's font (font.ts), breaks into lines by font
// 0's advances within the window's width, and goes out in pages of the window's lines, each page
// in a block of its own (lane plan D4). A printed block sends the carrier line, and the page
// writes the text over it before the window streams it (src/gen5/text-box.ts). Pure: every number
// of the game comes in from build/gen5/bw2.json.
import type { FontNumbers, TextBoxNumbers, TextNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { Gen5Fallback } from './fallbacks.ts'
import { fitName } from './font.ts'
import { lineId } from './lines.ts'

/** The numbers a printed text takes: the font's characters, the window and the carrier. */
export interface PrintNumbers {
  readonly font: Pick<FontNumbers, 'chars'>
  readonly text: TextNumbers
  readonly textBox: Pick<TextBoxNumbers, 'advances' | 'windowWidth' | 'pageLines' | 'carrier'>
}

/** A text's pages, each its lines joined by "\n", and a fallback for each character the font
 * lacks. */
export interface Printed {
  readonly pages: string[]
  readonly fallbacks: Gen5Fallback[]
}

/** What the line breaking needs: the advances, the window's width and the log line for errors. */
interface Measure {
  readonly advances: Readonly<Record<string, number>>
  readonly width: number
  readonly line: number
}

/** The width of `text` in pixels by font 0's advances; throws by name on a character with none. */
function widthOf(text: string, { advances, line }: Measure): number {
  let sum = 0
  for (const char of text) {
    const advance = advances[char]
    if (advance === undefined) {
      throw new Error(`font 0 has no advance for "${char}" (line ${String(line)})`)
    }
    sum += advance
  }
  return sum
}

/** `word` in pieces that each fit a line, the last one open for the words after it. */
function wordPieces(word: string, measure: Measure): string[] {
  const pieces = ['']
  for (const char of word) {
    const last = pieces.length - 1
    const tried = `${pieces[last] ?? ''}${char}`
    if (pieces[last] !== '' && widthOf(tried, measure) > measure.width) pieces.push(char)
    else pieces[last] = tried
  }
  return pieces
}

/** Greedy lines at spaces within the window's width; a word wider than a line breaks inside
 * it. */
function linesOf(text: string, measure: Measure): string[] {
  const lines: string[] = []
  let open = ''
  for (const word of text.split(' ')) {
    const tried = open === '' ? word : `${open} ${word}`
    if (widthOf(tried, measure) <= measure.width) {
      open = tried
      continue
    }
    if (open !== '') lines.push(open)
    const pieces = wordPieces(word, measure)
    open = pieces.pop() ?? ''
    lines.push(...pieces)
  }
  if (open !== '') lines.push(open)
  return lines
}

/** The pages of `text` from log line `line`: the font's "?" for each character it lacks, lines
 * within the window's width, at most the window's lines a page. */
export function printedPages(text: string, line: number, numbers: PrintNumbers): Printed {
  const { advances, windowWidth, pageLines } = numbers.textBox
  const fitted = fitName(text, numbers.font.chars, { line, what: 'the printed line' })
  const lines = linesOf(fitted.text, { advances, width: windowWidth, line })
  const pages: string[] = []
  for (let i = 0; i < lines.length; i += pageLines) {
    pages.push(lines.slice(i, i + pageLines).join('\n'))
  }
  return { pages, fallbacks: fitted.fallbacks }
}

/** The carrier's SC_MSG_STD, which each printed page sends alone (lane plan D3). */
export const printedCommand = (numbers: Pick<PrintNumbers, 'text' | 'textBox'>): ServerCommand => ({
  command: 'SC_MSG_STD',
  message: lineId(numbers.text, { bank: 'standard', label: numbers.textBox.carrier }),
  args: [],
})
