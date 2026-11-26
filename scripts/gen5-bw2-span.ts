// The battle overlay's span in RAM and the overlays the game loads at boot (#97), from pokebw2's
// ds-decomp link files (`delinks.txt`) and from GameInit (src/system/main.c). The direct entry's
// routine lives in the battle overlay's span until the battle loads there, so that span must meet
// no overlay that stays loaded from boot on. The errors name sections and overlays and show no
// number of pokebw2.
import type { Span } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, stripComments } from './gen5-bw2-c.ts'

const SECTION = /^\s*(\.\w+)\s+start:0x([0-9a-f]+)\s+end:0x([0-9a-f]+)\s+kind:\w+\s+align:\d+$/i

function sectionSpan(line: string, name: string): Span {
  const match = SECTION.exec(line)
  const section = line.trim().split(/\s+/, 1)[0] ?? ''
  if (match === null) throw new Error(`${name}: cannot read the link file's section ${section}`)
  const span = {
    start: Number.parseInt(match[2] ?? '', 16),
    end: Number.parseInt(match[3] ?? '', 16),
  }
  if (span.end < span.start) {
    throw new Error(`${name}: the section ${section} ends before it starts`)
  }
  return span
}

/** The span from the first section's start to the last one's end, read from the link file's
 * header: its section lines before the first blank line. */
export function linkSpan(text: string, name: string): Span {
  const lines = text.split('\n')
  const blank = lines.findIndex((line) => line.trim() === '')
  const spans = lines
    .slice(0, blank < 0 ? lines.length : blank)
    .map((line) => sectionSpan(line, name))
  if (spans.length === 0) throw new Error(`${name}: the link file starts with no section`)
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
  }
}

const meets = (a: Span, b: Span) => a.start < b.end && b.start < a.end

/** Throws, naming both, when `span` shares a byte with any of `others`. */
export function checkApart(name: string, span: Span, others: Readonly<Record<string, Span>>): void {
  for (const [other, otherSpan] of Object.entries(others)) {
    if (meets(span, otherSpan)) throw new Error(`the span of ${name} meets the span of ${other}`)
  }
}

/** An overlay's name in pokebw2's config: `ov` and its ID in three digits or more. */
export const overlayName = (id: number) => `ov${String(id).padStart(3, '0')}`

const LOAD = /\bGFL_OvlLoad\s*\(\s*OVERLAY_ID\(\s*(\d+)\s*\)\s*\)/g
const ANY_LOAD = /\bGFL_OvlLoad\s*\(/g

/** The overlays GameInit loads, by name; throws on a load in any form but
 * `GFL_OvlLoad(OVERLAY_ID(n))`. */
export function gameInitOverlays(mainC: string): string[] {
  const body = bodyOf(stripComments(mainC), 'void GameInit(')
  const loads = [...body.matchAll(LOAD)].map(([, id = '']) => overlayName(Number(id)))
  if ([...body.matchAll(ANY_LOAD)].length !== loads.length) {
    throw new Error('GameInit calls GFL_OvlLoad in a form other than GFL_OvlLoad(OVERLAY_ID(n))')
  }
  return loads
}

/** Throws unless GameInit loads exactly the overlays whose link files the generator reads. */
export function checkBootOverlays(loaded: readonly string[], listed: readonly string[]): void {
  const unread = loaded.filter((name) => !listed.includes(name))
  if (unread.length > 0) {
    throw new Error(`GameInit loads ${unread.join(', ')}, whose link file is unread`)
  }
  const unloaded = listed.filter((name) => !loaded.includes(name))
  if (unloaded.length > 0) throw new Error(`GameInit does not load ${unloaded.join(', ')}`)
}
