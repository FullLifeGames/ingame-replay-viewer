// A party Pokémon's bytes as Black 2 keeps them (#97), sealed and opened. Plain bytes are a
// PartyPkm's bytes with its four blocks in logical order, A to D, one chunk each, and nothing
// ciphered. Sealing places the blocks by the PID's row of the block table, sums the content's
// halfwords into the checksum, ciphers the box part (the content buffer) under the checksum and
// the party part (statusCond to the end) under the PID, as PokeParty_EncryptPkm does. Pure: every
// number comes in from build/gen5/bw2.json's `pkm`.
import type { CipherStep, FieldLayout, PkmNumbers, StructLayout } from './bw2-numbers.ts'

/** The four blocks of a Pokémon's content, in logical order. */
export const BLOCKS = ['PkmBlockA', 'PkmBlockB', 'PkmBlockC', 'PkmBlockD'] as const
export type BlockName = (typeof BLOCKS)[number]

/** The plain bytes of a sealed Pokémon, and whether its checksum matches its content. */
export interface OpenedPkm {
  plain: Uint8Array
  checksumRight: boolean
}

export function pkmLayout(pkm: PkmNumbers, struct: string): StructLayout {
  const layout = pkm.layouts[struct]
  if (layout === undefined) throw new Error(`the Pokémon format has no layout ${struct}`)
  return layout
}

export function pkmField(pkm: PkmNumbers, struct: string, member: string): FieldLayout {
  const field = pkmLayout(pkm, struct).fields[member]
  if (field === undefined) throw new Error(`${struct} has no member ${member}`)
  return field
}

export function pkmConstant(pkm: PkmNumbers, name: string): number {
  const value = pkm.constants[name]
  if (value === undefined) throw new Error(`the Pokémon format has no constant ${name}`)
  return value
}

export const dataView = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** Each block's byte offset inside the sealed content buffer, from the PID's row of the table. */
export function blockPlaces(pid: number, pkm: PkmNumbers): Record<BlockName, number> {
  const row = pkm.blockOffsets[(pid & pkm.selector.mask) >>> pkm.selector.shift]
  if (row === undefined) throw new RangeError("the block table has no row for this PID's selector")
  const place = (block: BlockName) => {
    const offset = row[pkm.blockColumns[block] ?? -1]
    if (offset === undefined) throw new RangeError(`the block table has no column for ${block}`)
    return offset
  }
  return {
    PkmBlockA: place('PkmBlockA'),
    PkmBlockB: place('PkmBlockB'),
    PkmBlockC: place('PkmBlockC'),
    PkmBlockD: place('PkmBlockD'),
  }
}

/** `bytes` with each halfword XORed with the next output of the key's step from `seed`. The
 * product keeps its low 32 bits through Math.imul, since it passes 2^53. */
export function cipherHalfwords(bytes: Uint8Array, seed: number, step: CipherStep): Uint8Array {
  if (bytes.length % 2 !== 0) throw new RangeError('the cipher runs over whole halfwords')
  const out = Uint8Array.from(bytes)
  const view = dataView(out)
  let key = seed >>> 0
  for (let at = 0; at < out.length; at += 2) {
    key = (Math.imul(key, step.multiplier) + step.increment) >>> 0
    view.setUint16(at, view.getUint16(at, true) ^ ((key >>> step.shift) & 0xffff), true)
  }
  return out
}

/** The sum of the halfwords of `bytes`, wrapped at a halfword. */
export function halfwordSum(bytes: Uint8Array): number {
  const view = dataView(bytes)
  let sum = 0
  for (let at = 0; at + 1 < bytes.length; at += 2) sum = (sum + view.getUint16(at, true)) & 0xffff
  return sum
}

/** Throws when `bytes` are not one PartyPkm long. */
export function checkPkmSize(bytes: Uint8Array, pkm: PkmNumbers) {
  if (bytes.length !== pkmLayout(pkm, 'PartyPkm').size) {
    throw new RangeError('the bytes are not one PartyPkm')
  }
}

/** Where the parts and keys sit in a PartyPkm, after its size is checked. */
function parts(bytes: Uint8Array, pkm: PkmNumbers) {
  checkPkmSize(bytes, pkm)
  return {
    content: pkmField(pkm, 'PartyPkm', 'base.contentBuffer'),
    partyStart: pkmField(pkm, 'PartyPkm', 'statusCond').offset,
    pid: pkmField(pkm, 'PartyPkm', 'base.pid').offset,
    checksum: pkmField(pkm, 'PartyPkm', 'base.checksum').offset,
    chunk: pkmLayout(pkm, 'PkmBufferChunk').size,
  }
}

/** The content's blocks moved from logical order into the PID's places, or back. */
function placed(
  content: Uint8Array,
  places: Record<BlockName, number>,
  chunk: number,
  seal: boolean,
) {
  const out = new Uint8Array(content.length)
  BLOCKS.forEach((block, i) => {
    const [from, to] = seal ? [i * chunk, places[block]] : [places[block], i * chunk]
    out.set(content.subarray(from, from + chunk), to)
  })
  return out
}

/** The sealed bytes of `plain`, its checksum written; the PID and the flag bits stay as they are. */
export function sealPkm(plain: Uint8Array, pkm: PkmNumbers): Uint8Array {
  const at = parts(plain, pkm)
  const out = Uint8Array.from(plain)
  const view = dataView(out)
  const pid = view.getUint32(at.pid, true)
  const content = plain.subarray(at.content.offset, at.content.offset + at.content.size)
  const checksum = halfwordSum(content)
  view.setUint16(at.checksum, checksum, true)
  const shuffled = placed(content, blockPlaces(pid, pkm), at.chunk, true)
  out.set(cipherHalfwords(shuffled, checksum, pkm.cipher), at.content.offset)
  out.set(cipherHalfwords(plain.subarray(at.partyStart), pid, pkm.cipher), at.partyStart)
  return out
}

/** The plain bytes of `sealed`, and whether the stored checksum is the content's sum. */
export function openPkm(sealed: Uint8Array, pkm: PkmNumbers): OpenedPkm {
  const at = parts(sealed, pkm)
  const out = Uint8Array.from(sealed)
  const view = dataView(out)
  const pid = view.getUint32(at.pid, true)
  const checksum = view.getUint16(at.checksum, true)
  const box = sealed.subarray(at.content.offset, at.content.offset + at.content.size)
  const deciphered = cipherHalfwords(box, checksum, pkm.cipher)
  const content = placed(deciphered, blockPlaces(pid, pkm), at.chunk, false)
  out.set(content, at.content.offset)
  out.set(cipherHalfwords(sealed.subarray(at.partyStart), pid, pkm.cipher), at.partyStart)
  return { plain: out, checksumRight: halfwordSum(content) === checksum }
}
