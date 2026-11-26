import { describe, expect, it } from 'vitest'

import { type StringBuffer, stringWrites } from './game-string'

// Every address, offset, size and the terminator here are invented for the spec.

const TERMINATOR = 0xfffe

/** A buffer behind two pointers with a length of its own, as a string buffer of the game. */
const BUFFER: StringBuffer = {
  field: 'foe.name',
  chars: { address: 0x02100000, hops: [0x10, 0x08] },
  room: 5,
  charWidth: 2,
  length: { address: 0x02100000, hops: [0x10, 0x02], width: 2 },
}

/** A plain array of characters, with no length. */
const ARRAY: StringBuffer = {
  field: 'player.name',
  chars: { address: 0x02100000, hops: [0x20, 0x00] },
  room: 4,
  charWidth: 2,
}

// Scene: the page writes a trainer's name into the game's own buffer, as the game would.
describe('stringWrites', () => {
  it('writes the length, then the characters and the terminator, in their own widths', () => {
    const { writes, cut } = stringWrites('Ann', BUFFER, TERMINATOR)
    expect(cut).toBeUndefined()
    expect(writes).toEqual([
      {
        kind: 'bytes',
        field: 'foe.name length',
        address: 0x02100000,
        hops: [0x10, 0x02],
        bytes: [3, 0],
      },
      {
        kind: 'bytes',
        field: 'foe.name',
        address: 0x02100000,
        hops: [0x10, 0x08],
        bytes: [0x41, 0, 0x6e, 0, 0x6e, 0, 0xfe, 0xff],
      },
    ])
  })

  it('writes no length into a plain array', () => {
    const { writes } = stringWrites('Bo', ARRAY, TERMINATOR)
    expect(writes).toEqual([
      {
        kind: 'bytes',
        field: 'player.name',
        address: 0x02100000,
        hops: [0x20, 0x00],
        bytes: [0x42, 0, 0x6f, 0, 0xfe, 0xff],
      },
    ])
  })

  it("fits a name of the room's size, its terminator taking the last place", () => {
    const { writes, cut } = stringWrites('Dana', BUFFER, TERMINATOR)
    expect(cut).toBeUndefined()
    expect(writes[1]).toMatchObject({ bytes: [0x44, 0, 0x61, 0, 0x6e, 0, 0x61, 0, 0xfe, 0xff] })
  })

  it('cuts a name one character longer and says so', () => {
    const { writes, cut } = stringWrites('Danae', BUFFER, TERMINATOR)
    expect(writes[0]).toMatchObject({ bytes: [4, 0] })
    expect(writes[1]).toMatchObject({ bytes: [0x44, 0, 0x61, 0, 0x6e, 0, 0x61, 0, 0xfe, 0xff] })
    expect(cut).toBe('foe.name: "Danae" cut to "Dana", the 4 characters it holds')
  })

  it('throws on a character that is the terminator or needs more than one unit', () => {
    expect(() => stringWrites('A￾', BUFFER, TERMINATOR)).toThrow(/foe\.name.*character 1/)
    expect(() => stringWrites('A\u{1f600}', BUFFER, TERMINATOR)).toThrow(/foe\.name.*character 1/)
    const narrow = { ...ARRAY, charWidth: 1 }
    expect(() => stringWrites('Aé', narrow, 0xff)).not.toThrow()
    expect(() => stringWrites('Aā', narrow, 0xff)).toThrow(/player\.name.*character 1/)
  })

  it('throws on a buffer with no room beside its terminator', () => {
    expect(() => stringWrites('A', { ...ARRAY, room: 1 }, TERMINATOR)).toThrow(/player\.name/)
  })
})
