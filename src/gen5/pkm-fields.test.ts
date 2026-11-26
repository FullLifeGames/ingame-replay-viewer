import { describe, expect, it } from 'vitest'

import { isShiny, pidFor, plainPkm, type PkmGender, readPkm, type WrittenPkm } from './pkm-fields'
import { PKM, TERMINATOR } from './pkm.fixtures'

// Every number here is invented for the spec, as is the whole format of pkm.fixtures.ts: the blocks
// in logical order at 4 (A), 32 (B), 60 (C) and 88 (D), the PID at 116, the party part from 120.

const FORMAT = { pkm: PKM, terminator: TERMINATOR }
const PID = 116
const A = 4
const B = 32
const C = 60
const D = 88

/** An invented Pokémon with every default left out. */
const BUDLING: WrittenPkm = {
  species: 7,
  form: 2,
  level: 12,
  exp: 1500,
  gender: 'female',
  shiny: false,
  nature: 4,
  ability: 1,
  item: 5,
  friendship: 70,
  moves: [
    { move: 1, pp: 35, ppUps: 0 },
    { move: 2, pp: 20, ppUps: 3 },
  ],
  name: 'Bud',
  nicknamed: true,
  ot: { name: 'Ann', id: 0x0002_0001, gender: 1 },
  hp: 30,
  maxHp: 34,
  stats: { atk: 20, def: 21, spe: 22, spa: 23, spd: 24 },
  salt: 5,
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const u16 = (bytes: Uint8Array, at: number) => view(bytes).getUint16(at, true)
const u32 = (bytes: Uint8Array, at: number) => view(bytes).getUint32(at, true)
const units = (text: string) => Array.from(text, (char) => char.charCodeAt(0))
const halfwords = (bytes: Uint8Array, at: number, count: number) =>
  Array.from({ length: count }, (_, i) => u16(bytes, at + 2 * i))

/** The XOR of the halves of a PID and an OT id. */
const halvesXor = (pid: number, otId: number) =>
  (pid >>> 16) ^ (pid & 0xffff) ^ (otId >>> 16) ^ (otId & 0xffff)

// Scene: the PID gives the gender by its low byte and the shininess by its halves.
describe('pidFor', () => {
  const GENDER_BYTES: [PkmGender, number][] = [
    ['female', 0x00],
    ['male', 0xff],
    ['none', 0x00],
  ]

  it('puts the gender into the low byte and the salt into the byte above it', () => {
    for (const [gender, low] of GENDER_BYTES) {
      const pid = pidFor({ gender, shiny: false, otId: 0x0002_0001, salt: 0x3c }, 3)
      expect(pid & 0xff, gender).toBe(low)
      expect((pid >>> 8) & 0xff, gender).toBe(0x3c)
    }
  })

  it('makes the XOR all ones without shiny and zero with it, for every salt', () => {
    const otId = 0x9abc_1357
    const wrong: string[] = []
    for (let salt = 0; salt < 256; salt += 1) {
      for (const [gender] of GENDER_BYTES) {
        const plain = pidFor({ gender, shiny: false, otId, salt }, 3)
        const shiny = pidFor({ gender, shiny: true, otId, salt }, 3)
        if (halvesXor(plain, otId) !== 0xffff || isShiny(plain, otId, 3))
          wrong.push(`plain ${gender}`)
        if (halvesXor(shiny, otId) !== 0 || !isShiny(shiny, otId, 3)) wrong.push(`shiny ${gender}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('gives the PID unsigned', () => {
    expect(pidFor({ gender: 'male', shiny: false, otId: 0, salt: 0 }, 3)).toBe(0xff00_00ff)
  })

  it('throws on a salt above a byte, and when the bound allows no PID of the shininess asked for', () => {
    expect(() => pidFor({ gender: 'male', shiny: false, otId: 0, salt: 256 }, 3)).toThrow(/salt/)
    expect(() => pidFor({ gender: 'male', shiny: true, otId: 0, salt: 0 }, 0)).toThrow(/shiny/)
  })
})

// Scene: a written Pokémon becomes plain bytes, each field in its member.
describe('plainPkm', () => {
  it('writes each field into its member of the blocks in logical order', () => {
    const { bytes, cuts } = plainPkm(BUDLING, FORMAT)
    expect(cuts).toEqual([])
    expect(bytes).toHaveLength(156)
    expect(u32(bytes, PID)).toBe(0xfafc_0500)
    expect([u16(bytes, A + 12), u16(bytes, A + 14), u32(bytes, A + 8), u32(bytes, A + 4)]).toEqual([
      7, 5, 0x0002_0001, 1500,
    ])
    expect([bytes[A + 3], bytes[A + 1], bytes[A]]).toEqual([70, 1, 9])
    expect(halfwords(bytes, B + 10, 4)).toEqual([1, 2, 0, 0])
    // ppUps, then pp.
    expect([...bytes.subarray(B + 2, B + 10)]).toEqual([0, 3, 0, 0, 35, 20, 0, 0])
    expect([bytes[B], bytes[C + 18], bytes[D + 14]]).toEqual([4, 40, 3])
    expect(halfwords(bytes, C, 4)).toEqual([...units('Bud'), TERMINATOR])
    expect(halfwords(bytes, D, 4)).toEqual([...units('Ann'), TERMINATOR])
    // metLevel 12 in the low seven bits, otGender 1 in the top one.
    expect(bytes[D + 15]).toBe(0x8c)
    expect([u32(bytes, 120), bytes[124], u16(bytes, 126), u16(bytes, 128)]).toEqual([0, 12, 30, 34])
    expect(halfwords(bytes, 130, 5)).toEqual([20, 21, 22, 23, 24])
  })

  it('sets every bit of each IV by default, beside the nickname flag', () => {
    const { bytes } = plainPkm(BUDLING, FORMAT)
    // The nickname flag in bit 0, thirty IV bits from bit 1 and the free bit 31.
    expect(u32(bytes, B + 20)).toBe(0x7fff_ffff)
    const named = plainPkm({ ...BUDLING, nicknamed: false }, FORMAT).bytes
    expect(u32(named, B + 20)).toBe(0x7fff_fffe)
    const ivs = { hp: 1, atk: 2, def: 3, spe: 4, spa: 5, spd: 6 }
    const low = plainPkm({ ...BUDLING, ivs, nicknamed: false }, FORMAT).bytes
    expect(u32(low, B + 20)).toBe(
      (1 << 1) + (2 << 6) + (3 << 11) + (4 << 16) + (5 << 21) + (6 << 26),
    )
  })

  it('writes the gender beside the form and keeps the bit next to them', () => {
    const onto = new Uint8Array(156)
    onto[B + 1] = 0x80
    const { bytes } = plainPkm(BUDLING, FORMAT, onto)
    // GENDER_FEMALE 2 in bits 0 and 1, form 2 in bits 2 to 6, the other bit kept.
    expect(bytes[B + 1]).toBe(0x80 | 0x08 | 0x02)
    expect(plainPkm({ ...BUDLING, gender: 'none' }, FORMAT).bytes[B + 1]).toBe(0x08 | 0x03)
  })

  it('leaves every byte outside its members as the bytes it writes onto hold them', () => {
    const onto = Uint8Array.from({ length: 156 }, (_, i) => i)
    const { bytes } = plainPkm(BUDLING, FORMAT, onto)
    expect([...bytes.subarray(140)]).toEqual([...onto.subarray(140)])
    // The nickname's tail after its terminator, and the byte between nickname and originGame.
    expect([...bytes.subarray(C + 8, C + 18)]).toEqual([...onto.subarray(C + 8, C + 18)])
    // The checksum and the flag bits before the content buffer.
    expect([...bytes.subarray(0, A)]).toEqual([...onto.subarray(0, A)])
  })

  it('takes a PID it is given, and throws when it contradicts the shininess', () => {
    const { bytes } = plainPkm({ ...BUDLING, personality: 0x0000_0010 }, FORMAT)
    expect(u32(bytes, PID)).toBe(0x10)
    // The halves of 3 and of the OT id XOR to zero: a shiny PID for a Pokémon written plain.
    expect(() => plainPkm({ ...BUDLING, personality: 0x0000_0003 }, FORMAT)).toThrow(/shiny/)
  })

  it('throws naming the member a value is too wide for', () => {
    expect(() => plainPkm({ ...BUDLING, species: 0x1_0000 }, FORMAT)).toThrow(/PkmBlockA\.species/)
    expect(() => plainPkm({ ...BUDLING, form: 32 }, FORMAT)).toThrow(/PkmBlockB\.form/)
    expect(() => plainPkm({ ...BUDLING, level: 256, metLevel: 5 }, FORMAT)).toThrow(
      /PartyPkm\.level/,
    )
    expect(() => plainPkm({ ...BUDLING, exp: 1.5 }, FORMAT)).toThrow(/PkmBlockA\.exp/)
    const five = Array.from({ length: 5 }, () => ({ move: 1, pp: 1, ppUps: 0 }))
    expect(() => plainPkm({ ...BUDLING, moves: five }, FORMAT)).toThrow(/PkmBlockB\.moves/)
  })

  it('cuts a nickname past its room with a note, and keeps the OT name whole', () => {
    const { bytes, cuts } = plainPkm({ ...BUDLING, name: 'Shellshocker' }, FORMAT)
    expect(cuts).toEqual([
      'PkmBlockC.nickname: "Shellshocker" cut to "Shellsh", the 7 characters it holds',
    ])
    expect(halfwords(bytes, C, 8)).toEqual([...units('Shellsh'), TERMINATOR])
    expect(readPkm(bytes, FORMAT).name).toBe('Shellsh')
  })

  it('throws naming a member of a width no number has, and a format with no ball', () => {
    const level = { offset: 124, size: 3 }
    const fields = { ...PKM.layouts.PartyPkm?.fields, level }
    const odd = { ...PKM, layouts: { ...PKM.layouts, PartyPkm: { size: 156, align: 4, fields } } }
    expect(() => plainPkm(BUDLING, { pkm: odd, terminator: TERMINATOR })).toThrow(
      /PartyPkm\.level is no number/,
    )
    const ballless = { ...PKM, items: { ITEM_ACORN: 5 } }
    expect(() => plainPkm(BUDLING, { pkm: ballless, terminator: TERMINATOR })).toThrow(
      /ITEM_POKE_BALL/,
    )
  })

  it('throws on bytes to write onto of another size', () => {
    expect(() => plainPkm(BUDLING, FORMAT, new Uint8Array(150))).toThrow(/PartyPkm/)
  })
})

// Scene: the plain bytes read back as the Pokémon written, the defaults filled in.
describe('readPkm', () => {
  it('reads back every field written, with the PID and the defaults', () => {
    const written: Partial<WrittenPkm> = { ...BUDLING }
    delete written.salt
    const read = readPkm(plainPkm(BUDLING, FORMAT).bytes, FORMAT)
    expect(read).toEqual({
      ...written,
      moves: [...BUDLING.moves, { move: 0, pp: 0, ppUps: 0 }, { move: 0, pp: 0, ppUps: 0 }],
      ivs: { hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 },
      ball: 3,
      metLevel: 12,
      language: 9,
      origin: 40,
      status: 0,
      personality: 0xfafc_0500,
    })
  })

  it('reads a male and a genderless Pokémon, and a shiny one', () => {
    const male = readPkm(plainPkm({ ...BUDLING, gender: 'male' }, FORMAT).bytes, FORMAT)
    expect(male.gender).toBe('male')
    const shiny = readPkm(
      plainPkm({ ...BUDLING, shiny: true, gender: 'none' }, FORMAT).bytes,
      FORMAT,
    )
    expect([shiny.gender, shiny.shiny]).toEqual(['none', true])
  })

  it('reads a name with no terminator to the end of its room', () => {
    const bytes = plainPkm(BUDLING, FORMAT).bytes
    for (let i = 0; i < 6; i += 1) view(bytes).setUint16(D + 2 * i, 0x41, true)
    expect(readPkm(bytes, FORMAT).ot.name).toBe('AAAAAA')
  })

  it('throws naming the gender member when it holds no gender constant', () => {
    const bytes = plainPkm(BUDLING, FORMAT).bytes
    // form 2 alone, gender 0.
    bytes[B + 1] = 0x08
    expect(() => readPkm(bytes, FORMAT)).toThrow(/PkmBlockB\.gender/)
  })

  it('throws naming a member the layout lacks', () => {
    const fields = { ...PKM.layouts.PkmBlockA?.fields }
    delete fields.species
    const pkm = {
      ...PKM,
      layouts: { ...PKM.layouts, PkmBlockA: { size: 28, align: 4, fields } },
    }
    expect(() => readPkm(new Uint8Array(156), { pkm, terminator: TERMINATOR })).toThrow(
      /PkmBlockA has no member species/,
    )
  })
})
