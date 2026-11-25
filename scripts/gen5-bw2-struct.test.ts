import { describe, expect, it } from 'vitest'

import { firstMember, structLayout } from './gen5-bw2-struct'

// Invented structs for the spec: a function-pointer typedef, a nested struct with an array and
// padding, a pointer, bit-fields in a halfword that the cursor has to move up to, and a cut one.
const SOURCE = `
typedef void (*Blink)(struct Street *street, u16 pace);

typedef struct {
    u32 glow;
    s16 tilt[3];
    u8 hue;
} Lamp;

struct Street {
    u8 number;
    Blink blink;
    s8 slope;
    // the cursor stands on an odd byte; the halfword starts at the next one
    u16 width : 9;
    u16 lit : 1;
    u16 curb : 6;
    Lamp lamp;
    u8 *sign;
    s32 houses[2];
    u8 end;
};

struct Crowded {
    u8 a : 5;
    u8 b : 5;
    u16 c;
    BOOL d;
};
`

// Scene: the page writes the adapter's fields at the offsets the game's code reads.
describe('structLayout', () => {
  it('lays out bytes, a function pointer, bit-fields, a nested struct, a pointer and an array', () => {
    const layout = structLayout(SOURCE, 'Street')
    expect(layout.fields).toEqual({
      number: { offset: 0x00, size: 1 },
      blink: { offset: 0x04, size: 4 },
      slope: { offset: 0x08, size: 1 },
      width: { offset: 0x0a, size: 2, bit: 0, bits: 9 },
      lit: { offset: 0x0a, size: 2, bit: 9, bits: 1 },
      curb: { offset: 0x0a, size: 2, bit: 10, bits: 6 },
      lamp: { offset: 0x0c, size: 0x0c },
      'lamp.glow': { offset: 0x0c, size: 4 },
      'lamp.tilt': { offset: 0x10, size: 6 },
      'lamp.hue': { offset: 0x16, size: 1 },
      sign: { offset: 0x18, size: 4 },
      houses: { offset: 0x1c, size: 8 },
      end: { offset: 0x24, size: 1 },
    })
    expect(layout.size).toBe(0x28)
    expect(layout.align).toBe(4)
  })

  it('pads a nested struct to its alignment', () => {
    expect(structLayout(SOURCE, 'Lamp')).toMatchObject({ size: 0x0c, align: 4 })
  })

  it('starts a bitfield that would cross its container in the next one', () => {
    expect(structLayout(SOURCE, 'Crowded')).toEqual({
      size: 8,
      align: 4,
      fields: {
        a: { offset: 0, size: 1, bit: 0, bits: 5 },
        b: { offset: 1, size: 1, bit: 0, bits: 5 },
        c: { offset: 2, size: 2 },
        d: { offset: 4, size: 4 },
      },
    })
  })

  it('throws on a type it does not know and on a missing struct', () => {
    const odd = SOURCE.replace('u8 end;', 'Mystery end;')
    expect(() => structLayout(odd, 'Street')).toThrow(/Mystery/)
    expect(() => structLayout(SOURCE, 'Absent')).toThrow(/Absent/)
  })

  it('throws on a member it cannot read, such as a union', () => {
    const odd = SOURCE.replace('u8 end;', 'union { u8 x; u16 y; } end;')
    expect(() => structLayout(odd, 'Street')).toThrow(/union/)
  })

  // Scene: a Pokemon's HP sits before members the layout cannot read; their offsets do not
  // depend on what follows them.
  it('lays out the members up to a named one and stops there', () => {
    const code = 'struct Kite { u16 span; u8 *tail; s8 tilt; Mystery knots[COUNT]; u8 last; };'
    expect(structLayout(code, 'Kite', 'tilt')).toEqual({
      size: 9,
      align: 4,
      upTo: 'tilt',
      fields: {
        span: { offset: 0, size: 2 },
        tail: { offset: 4, size: 4 },
        tilt: { offset: 8, size: 1 },
      },
    })
    expect(() => structLayout(code, 'Kite', 'absent')).toThrow(/absent/)
  })

  it("names a struct's first member with its type", () => {
    expect(firstMember(SOURCE, 'Street')).toBe('u8 number')
    expect(firstMember(SOURCE, 'Lamp')).toBe('u32 glow')
  })
})

// Invented structs in the shape of the direct entry's (#97): a 64-bit member after a word, which
// the game's compiler (MWCC) puts at a multiple of 4 and not of 8, inside a nested struct; a
// scalar typedef; a const pointer; an unnamed bit-field; an array sized by a define and one of two
// dimensions; and a 64-bit member at the end.
const ENTRY_SOURCE = `
#define SEAT_COUNT 3
typedef u16 TrackId;

typedef struct {
    u32 face;
    u64 seed;
} Dice;

struct Coach {
    TrackId track;
    Dice dice;
    const Wagon *next;
    u16 lamp : 3;
    u16 : 5;
    u16 horn : 2;
    u8 seats[SEAT_COUNT];
    u8 rows[2][3];
    s64 drift;
};
`

// Scene: the page writes the battle setup's members at the offsets the game's code reads, and the
// setup holds the battle's random state of three 64-bit words.
describe("structLayout on the direct entry's shapes", () => {
  it('puts a 64-bit member at a multiple of 4, inside a nested struct and at the end', () => {
    expect(structLayout(ENTRY_SOURCE, 'Dice')).toEqual({
      size: 12,
      align: 4,
      fields: { face: { offset: 0, size: 4 }, seed: { offset: 4, size: 8 } },
    })
    const coach = structLayout(ENTRY_SOURCE, 'Coach')
    expect(coach.fields).toEqual({
      track: { offset: 0, size: 2 },
      dice: { offset: 4, size: 12 },
      'dice.face': { offset: 4, size: 4 },
      'dice.seed': { offset: 8, size: 8 },
      next: { offset: 16, size: 4 },
      lamp: { offset: 20, size: 2, bit: 0, bits: 3 },
      horn: { offset: 20, size: 2, bit: 8, bits: 2 },
      seats: { offset: 22, size: 3 },
      rows: { offset: 25, size: 6 },
      drift: { offset: 32, size: 8 },
    })
    expect(coach.size).toBe(40)
    expect(coach.align).toBe(4)
  })

  it('throws on an array sized by a name that no define gives', () => {
    const odd = ENTRY_SOURCE.replace('#define SEAT_COUNT 3', '')
    expect(() => structLayout(odd, 'Coach')).toThrow(/SEAT_COUNT/)
  })
})
