import { Protocol } from '@pkmn/protocol'
import { describe, expect, it } from 'vitest'

import { rowParts, rowText } from './status'

const TRICK_ROOM = {
  line: 18,
  what: 'dropped: unsupported',
  text: '|-fieldstart|move: Trick Room|[of] p1a: Dugtrio',
  standIn: false,
}

// #90 D6: at 390 px the browser broke a row after the hyphen of "|-fieldstart". The page keeps
// the log line's first field on one line, so a row comes in three parts; the text stays the same.
describe('the parts of a "Not shown" row', () => {
  it("splits off the log line's first field", () => {
    expect(rowParts(TRICK_ROOM)).toEqual({
      head: 'Line 18, dropped: unsupported: ',
      kind: '|-fieldstart',
      rest: '|move: Trick Room|[of] p1a: Dugtrio',
    })
  })

  it('reads as the row did when joined', () => {
    const { head, kind, rest } = rowParts(TRICK_ROOM)
    expect(head + kind + rest).toBe(rowText(TRICK_ROOM))
    expect(rowText(TRICK_ROOM)).toBe(
      'Line 18, dropped: unsupported: |-fieldstart|move: Trick Room|[of] p1a: Dugtrio',
    )
  })

  it('takes a log line of one field whole as its first field', () => {
    const row = { line: 12, what: 'dropped: upkeep', text: '|upkeep', standIn: false }
    expect(rowParts(row)).toEqual({ head: 'Line 12, dropped: upkeep: ', kind: '|upkeep', rest: '' })
  })

  it('has no first field for an empty log line', () => {
    const row = { line: 5, what: 'dropped: spacer', text: '', standIn: false }
    expect(rowParts(row)).toEqual({ head: 'Line 5, dropped: spacer', kind: '', rest: '' })
  })

  it('puts the detail and the stand-in after the first field, without markup', () => {
    const row = { line: 9, what: 'dropped: raw', text: '|raw|<b>x</b>', detail: 'a &amp; b' }
    expect(rowParts({ ...row, standIn: true })).toEqual({
      head: 'Line 9, dropped: raw, a stand-in shows: ',
      kind: '|raw',
      rest: '| x; a & b',
    })
  })

  // Showdown sends a line without a leading bar as plain text; it has no first field.
  it('has no first field for a line of plain text', () => {
    const row = { line: 3, what: 'dropped: text', text: 'hello|world', standIn: false }
    expect(rowParts(row)).toEqual({
      head: 'Line 3, dropped: text: ',
      kind: '',
      rest: 'hello|world',
    })
  })

  // A replay from elsewhere can hold any first field; one longer than a phone is wide may wrap.
  it('keeps a first field longer than any of the protocol in the rest', () => {
    const text = `|${'x'.repeat(40)}|y`
    const row = { line: 7, what: 'dropped: unknown', text, standIn: false }
    expect(rowParts(row)).toEqual({ head: 'Line 7, dropped: unknown: ', kind: '', rest: text })
  })

  it('keeps every first field of the protocol whole', () => {
    const fields = new Set(Object.keys(Protocol.ARGS).map((args) => `|${args.split('|')[1] ?? ''}`))
    for (const field of fields) {
      const row = { line: 1, what: 'dropped: unknown', text: `${field}|x`, standIn: false }
      expect(rowParts(row).kind).toBe(field)
    }
  })
})
