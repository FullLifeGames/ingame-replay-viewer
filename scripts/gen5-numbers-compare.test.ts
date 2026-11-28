import { describe, expect, it } from 'vitest'

import { BW2_NUMBERS_VERSION } from '../src/gen5/bw2-numbers.ts'
import { equalNames, namesAt } from './gen5-numbers-compare.ts'

describe("the guard's compare on invented numbers", () => {
  const real = { offset: 8, size: 4, bit: 3, bits: 5 }
  const first = { offset: 0, size: 2 }

  // Scene: widths of 1, 2 and 4 bytes meet in every layout, so a fixture field that keeps the real
  // place with a width of its own still shows the real layout and must fail.
  it('names a field at the real place with another size and width', () => {
    const fixture = { offset: 8, size: 2, bit: 3, bits: 1 }
    expect(equalNames(fixture, real, 'S.field')).toEqual(['S.field'])
  })

  it('passes a field at another offset or another bit with the real size', () => {
    expect(equalNames({ ...real, offset: 12 }, real, 'S.field')).toEqual([])
    expect(equalNames({ ...real, bit: 4 }, real, 'S.field')).toEqual([])
  })

  // Scene: every struct starts at offset 0, so a first member counts only in the real width too.
  it('names a field at offset 0 only in the real size and width', () => {
    expect(equalNames(first, first, 'S.first')).toEqual(['S.first'])
    expect(equalNames({ offset: 0, size: 4 }, first, 'S.first')).toEqual([])
    expect(equalNames({ offset: 0, size: 2, bit: 0, bits: 3 }, first, 'S.first')).toEqual([])
  })

  // Scene: on the game's compiler a struct's alignment is 1, 2 or 4 by its widest member, so a
  // struct of a pointer or a word shares it with every such struct, as a field's width does.
  it('passes a struct whose alignment alone equals the real one, and names its size', () => {
    const struct = { size: 12, align: 4, fields: { first } }
    expect(equalNames(struct, { ...struct, size: 16 }, 'S')).toEqual(['S.fields.first'])
    expect(equalNames(struct, struct, 'S')).toEqual(['S.size', 'S.fields.first'])
  })

  it('names any other number equal under the same name', () => {
    expect(equalNames({ COUNT: 6, CODE: 2 }, { COUNT: 6, CODE: 3 }, 'C')).toEqual(['C.COUNT'])
  })
})

describe('the compare at a place of the generated file', () => {
  const file = {
    version: BW2_NUMBERS_VERSION,
    battle: { single: { clients: { player: 1, opponent: 0 } } },
  }

  // Scene: `version` at the file's root is the number of our own shape, which every current file
  // and fixture share.
  it('leaves the root version out and names every other equal number there', () => {
    const value = { version: BW2_NUMBERS_VERSION, battle: { single: { clients: { player: 1 } } } }
    expect(namesAt(value, file, [], 'N')).toEqual(['N.battle.single.clients.player'])
  })

  it('compares a value below the root at its path, a version key included', () => {
    expect(
      namesAt({ opponent: 0, version: 2 }, file, ['battle', 'single', 'clients'], 'S'),
    ).toEqual(['S.opponent'])
  })

  // Scene: an invented packer's `arg: 0` meets one of the many real puts by construction, so where
  // a type sits at several places a small value names nothing; a large one and a field still do.
  it('leaves values from 0 to 3 out when asked, but no field and no larger value', () => {
    const real = { arg: 0, shift: 3, mask: 0x30, at: { offset: 2, size: 1 } }
    const value = { arg: 0, shift: 3, mask: 0x30, at: { offset: 2, size: 4 } }
    expect(equalNames(value, real, 'P', false)).toEqual(['P.mask', 'P.at'])
    expect(equalNames(value, real, 'P')).toEqual(['P.arg', 'P.shift', 'P.mask', 'P.at'])
  })
})
