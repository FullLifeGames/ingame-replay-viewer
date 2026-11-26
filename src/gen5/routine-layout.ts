// Where the direct entry's routine (#97) lives: its code, its proc table, its order block and the
// room for its field status, each in the battle overlay's span. Nothing loads there before the
// battle, and the battle loads there only after the routine has handed over (D6). The pieces sit
// apart from each other, each on a word, and away from every overlay the boot has loaded. Pure:
// the spans come in from build/gen5/bw2.json and the code's size from build/gen5/routine.json.
import type { Span } from './bw2-numbers.ts'
import { type OrderMember, orderOffset } from './routine-order.ts'

/** The pieces in the order they are laid out. */
export const ROUTINE_PIECES = ['code', 'table', 'block', 'fieldStatus'] as const

export type RoutinePiece = (typeof ROUTINE_PIECES)[number]

/** Each piece's place, its end exclusive. */
export type RoutineLayout = Record<RoutinePiece, Span>

const WORD = 4

const wordUp = (address: number) => Math.ceil(address / WORD) * WORD
const meet = (a: Span, b: Span) => a.start < b.end && b.start < a.end

/** Throws unless every piece lies on a word inside `span`, apart from the others and from each
 * boot overlay. */
export function checkLayout(
  layout: RoutineLayout,
  span: Span,
  bootOverlays: Readonly<Record<string, Span>>,
): void {
  for (const [i, piece] of ROUTINE_PIECES.entries()) {
    const at = layout[piece]
    const name = `the routine's ${piece}`
    if (at.end <= at.start) throw new RangeError(`${name} has no bytes`)
    if (at.start % WORD !== 0) throw new RangeError(`${name} does not start on a word`)
    if (at.start < span.start || at.end > span.end) {
      throw new RangeError(`${name} leaves the battle overlay's span`)
    }
    const boot = Object.entries(bootOverlays).find(([, overlay]) => meet(at, overlay))
    if (boot) throw new RangeError(`${name} meets the boot overlay ${boot[0]}`)
    const other = ROUTINE_PIECES.slice(0, i).find((earlier) => meet(layout[earlier], at))
    if (other) throw new RangeError(`the routine's ${other} and ${piece} overlap`)
  }
}

/** The pieces in a row from the span's first word, each on the next word after the one before;
 * throws as checkLayout does. */
export function routineLayout(
  span: Span,
  sizes: Readonly<Record<RoutinePiece, number>>,
  bootOverlays: Readonly<Record<string, Span>>,
): RoutineLayout {
  let next = wordUp(span.start)
  const place = (piece: RoutinePiece): Span => {
    const start = next
    next = wordUp(start + sizes[piece])
    return { start, end: start + sizes[piece] }
  }
  const layout = {
    code: place('code'),
    table: place('table'),
    block: place('block'),
    fieldStatus: place('fieldStatus'),
  }
  checkLayout(layout, span, bootOverlays)
  return layout
}

/** The address of one member of the order block. */
export function blockAddress(layout: RoutineLayout, member: OrderMember): number {
  return layout.block.start + orderOffset(member)
}
