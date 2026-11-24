// The DS cartridge header that the Gen 5 spike page checks before it starts the emulator (#72).
// Offsets from GBATEK, "DS Cartridge Header"; a DSi-enhanced title carries a 0x1000-byte header.

/** The bytes of a DSi-enhanced header; the page reads this much from the front of the file. */
export const HEADER_SIZE = 0x1000

/** The game code's place in the header, four ASCII letters. */
export const GAME_CODE_OFFSET = 0x0c

/** The TWL region's start at 0x90 counts in units of 512 KiB. */
const TWL_REGION_UNIT = 0x80000

/** The dump the spike targets: Black 2 (USA), the game code and ROM version of its header. */
const BLACK_2 = { gameCode: 'IREO', romVersion: 0, name: 'Black 2 (USA)' }

export interface NdsHeader {
  title: string
  gameCode: string
  makerCode: string
  /** 0x00 DS, 0x02 DSi enhanced, 0x03 DSi only. */
  unitCode: number
  romVersion: number
  /** Where the ARM9 binary starts in the file. */
  arm9RomOffset: number
  /** Where the boot code puts the ARM9 binary in RAM. */
  arm9RamAddress: number
  arm9Size: number
  /** The bytes the DS (NTR) part of the cartridge uses, from the front of the file. */
  ntrUsedSize: number
  /** Where the DSi (TWL) part starts in the file. */
  twlRegionStart: number
  /** The bytes the whole cartridge uses, the DSi part included. */
  twlUsedSize: number
}

export type Black2Check = { ok: true; header: NdsHeader } | { ok: false; reason: string }

const text = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length)).replace(/\0+$/, '')

/** Reads the header fields from the front of a DS file; throws if the buffer is too short. */
export function readNdsHeader(bytes: Uint8Array): NdsHeader {
  if (bytes.length < HEADER_SIZE) {
    throw new Error(
      `This file has ${String(bytes.length)} bytes, too few for a DS game's header (${String(HEADER_SIZE)} bytes).`,
    )
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_SIZE)
  return {
    title: text(bytes, 0x00, 12),
    gameCode: text(bytes, GAME_CODE_OFFSET, 4),
    makerCode: text(bytes, 0x10, 2),
    unitCode: view.getUint8(0x12),
    romVersion: view.getUint8(0x1e),
    arm9RomOffset: view.getUint32(0x20, true),
    arm9RamAddress: view.getUint32(0x28, true),
    arm9Size: view.getUint32(0x2c, true),
    ntrUsedSize: view.getUint32(0x80, true),
    twlRegionStart: view.getUint16(0x90, true) * TWL_REGION_UNIT,
    twlUsedSize: view.getUint32(0x210, true),
  }
}

/** Accepts Black 2 (USA) version 0 only; a refusal names what the file holds instead. */
export function checkBlack2(bytes: Uint8Array): Black2Check {
  let header: NdsHeader
  try {
    header = readNdsHeader(bytes)
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  }
  if (header.gameCode === BLACK_2.gameCode && header.romVersion === BLACK_2.romVersion) {
    return { ok: true, header }
  }
  const found = `${header.gameCode} version ${String(header.romVersion)} ("${header.title}")`
  const wanted = `${BLACK_2.name}, game code ${BLACK_2.gameCode} version ${String(BLACK_2.romVersion)}`
  return { ok: false, reason: `This file holds ${found}. The spike plays ${wanted} only.` }
}
