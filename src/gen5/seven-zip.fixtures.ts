// Fixtures of the 7z spec: small archives built by hand (a script outside the tree) around LZMA2
// and LZMA streams of our own bytes (src/gen5/lzma.fixtures.ts names the rules), and the helpers
// that build an archive around a header a spec writes. Nothing here comes from the emulator or a
// game; the tree spec refuses a tracked file with 7z's magic, so the archives live here as base64.

import { crc32 } from '../patch/crc32.ts'
import { joined } from './lzma.fixtures.ts'

/** Each archive with what it holds:
 * - encodedHeader: one LZMA2 folder with two files, alpha.txt (textBytes(1500)) and
 *   beta/zeros.bin (4000 zeros), their CRCs in the sub-streams; the header packed with LZMA
 *   (literals alone, no end marker), as the core archives pack theirs.
 * - folders: a plain header; one.txt (textBytes(800, OTHER_PHRASE)) and two.bin (seededBytes(300))
 *   in a folder each, their CRCs on the folders; a directory named folder and an empty file
 *   empty.txt; modification times, attributes and a dummy property.
 * - deflate: folders with the first folder's coder named Deflate (id 04 01 08).
 * - badCrc: folders with the CRC of two.bin off by one bit. */
export const ARCHIVES = {
  encodedHeader: [
    'N3q8ryccAAT2AM5ctwAAAAAAAAAgAAAAAAAAAMdChc3gFXsAUV0AIIgKRlO2u8PResXIbSeDvTWA5uopTG4y+WwZ',
    'SkafTNbo78Vu71KOOXP5E3yWwZG/x1695EaMqrOydGo7tUSxDtO9S6QHpaiAFBO1rIo/EhsAAAAAgTMHrg/TNZE9',
    'QLuUR6suDJ3vRNI7il8sG4050wp1TagcABHBr9djxJ3W6TY+PDIIjnv+bESkOQXgMlQtD/qO/GA+IEw6DA35hTvG',
    'kD3NzSrg2oeIiegTpuoAAAAXBlkBCV4ABwsBAAEjAwEBBV0AAAEADGAKAbcyKPUAAA==',
  ].join(''),
  folders: [
    'N3q8ryccAARfU7/acAEAAAAAAAC2AAAAAAAAAPRpvlzgAx8AOF0AIphIZqTkQ8n9gT5ACUCLB/DIAxXy9PwpKA5N',
    '/xAoV66qCapFpF1csCL+rCCleU3FaFsSngGooAAAAQErOqusJq8jGnFskV0xGD680u9RIp1yT9vZbzlurivIIi8M',
    '4+2MaHuiiZnWOaef8lX+kRW4IKp6lIqgTcCd/klM3I7guQayMClKYBzfPLdiz0IFGQxLs9/hfEX7UFFncHjJBPhD',
    'DLRIc8vGBdifWPBt1+U4rO7v7fzvl/4WN7wD56qwZThDSddZO+B/f+KjydauKmdm7au1TXP/loojMguX7xx9ukGW',
    'ePnSaTyzb8vbQnThgV8i1xslp872y4ChHqqt3x2w6CLRXgQqIHBjH4i6rYNqklvb28fvh/sV7KW4lp8VSWOAnMmG',
    'M80FLD1Ca7P8SSrFAiHsQpbQchM/WShIxvmr6+GGAe1or28FUbN6637R8JvEVLymjETuxvUp6W/TqXgy0Jpt3WmD',
    '3jMIAAEEBgACCUCBMAAHCwIAASEhARABISEBEAyDIIEsCgEOlzQDYM5k7gAIAAAFBA4BUA8BQBQiAQAAAAAAAADb',
    'AQEAAAAAANsBAgAAAAAA2wEDAAAAAADbARUSAQAgAAAAEAAAACAAAAAgAAAAGQIAABFDAG8AbgBlAC4AdAB4AHQA',
    'AABmAG8AbABkAGUAcgAAAHQAdwBvAC4AYgBpAG4AAABlAG0AcAB0AHkALgB0AHgAdAAAAAAA',
  ].join(''),
  deflate: [
    'N3q8ryccAASNzCbocAEAAAAAAAC4AAAAAAAAAL93C4vgAx8AOF0AIphIZqTkQ8n9gT5ACUCLB/DIAxXy9PwpKA5N',
    '/xAoV66qCapFpF1csCL+rCCleU3FaFsSngGooAAAAQErOqusJq8jGnFskV0xGD680u9RIp1yT9vZbzlurivIIi8M',
    '4+2MaHuiiZnWOaef8lX+kRW4IKp6lIqgTcCd/klM3I7guQayMClKYBzfPLdiz0IFGQxLs9/hfEX7UFFncHjJBPhD',
    'DLRIc8vGBdifWPBt1+U4rO7v7fzvl/4WN7wD56qwZThDSddZO+B/f+KjydauKmdm7au1TXP/loojMguX7xx9ukGW',
    'ePnSaTyzb8vbQnThgV8i1xslp872y4ChHqqt3x2w6CLRXgQqIHBjH4i6rYNqklvb28fvh/sV7KW4lp8VSWOAnMmG',
    'M80FLD1Ca7P8SSrFAiHsQpbQchM/WShIxvmr6+GGAe1or28FUbN6637R8JvEVLymjETuxvUp6W/TqXgy0Jpt3WmD',
    '3jMIAAEEBgACCUCBMAAHCwIAASMEAQgBEAEhIQEQDIMggSwKAQ6XNANgzmTuAAgAAAUEDgFQDwFAFCIBAAAAAAAA',
    'ANsBAQAAAAAA2wECAAAAAADbAQMAAAAAANsBFRIBACAAAAAQAAAAIAAAACAAAAAZAgAAEUMAbwBuAGUALgB0AHgA',
    'dAAAAGYAbwBsAGQAZQByAAAAdAB3AG8ALgBiAGkAbgAAAGUAbQBwAHQAeQAuAHQAeAB0AAAAAAA=',
  ].join(''),
  badCrc: [
    'N3q8ryccAARQc3dDcAEAAAAAAAC2AAAAAAAAADJ2vYngAx8AOF0AIphIZqTkQ8n9gT5ACUCLB/DIAxXy9PwpKA5N',
    '/xAoV66qCapFpF1csCL+rCCleU3FaFsSngGooAAAAQErOqusJq8jGnFskV0xGD680u9RIp1yT9vZbzlurivIIi8M',
    '4+2MaHuiiZnWOaef8lX+kRW4IKp6lIqgTcCd/klM3I7guQayMClKYBzfPLdiz0IFGQxLs9/hfEX7UFFncHjJBPhD',
    'DLRIc8vGBdifWPBt1+U4rO7v7fzvl/4WN7wD56qwZThDSddZO+B/f+KjydauKmdm7au1TXP/loojMguX7xx9ukGW',
    'ePnSaTyzb8vbQnThgV8i1xslp872y4ChHqqt3x2w6CLRXgQqIHBjH4i6rYNqklvb28fvh/sV7KW4lp8VSWOAnMmG',
    'M80FLD1Ca7P8SSrFAiHsQpbQchM/WShIxvmr6+GGAe1or28FUbN6637R8JvEVLymjETuxvUp6W/TqXgy0Jpt3WmD',
    '3jMIAAEEBgACCUCBMAAHCwIAASEhARABISEBEAyDIIEsCgEOlzQDYc5k7gAIAAAFBA4BUA8BQBQiAQAAAAAAAADb',
    'AQEAAAAAANsBAgAAAAAA2wEDAAAAAADbARUSAQAgAAAAEAAAACAAAAAgAAAAGQIAABFDAG8AbgBlAC4AdAB4AHQA',
    'AABmAG8AbABkAGUAcgAAAHQAdwBvAC4AYgBpAG4AAABlAG0AcAB0AHkALgB0AHgAdAAAAAAA',
  ].join(''),
}

/** A 7z archive of `packed` and then `header`, with both CRCs right. */
export function build(packed: Uint8Array, header: number[]): Uint8Array {
  const body = Uint8Array.from(header)
  const start = new Uint8Array(20)
  const view = new DataView(start.buffer)
  view.setUint32(0, packed.length, true)
  view.setUint32(8, body.length, true)
  view.setUint32(16, crc32(body), true)
  const signature = Uint8Array.of(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4, 0, 0, 0, 0)
  new DataView(signature.buffer).setUint32(8, crc32(start), true)
  return joined(signature, start, packed, body)
}

/** A 7z archive of `header` alone: for headers that hold no stream. */
export const headerOnly = (header: number[]) => build(new Uint8Array(0), header)

/** A CRC as the four little-endian bytes the header stores. */
export const crcBytes = (crc: number) => [
  crc & 0xff,
  (crc >>> 8) & 0xff,
  (crc >>> 16) & 0xff,
  crc >>> 24,
]
