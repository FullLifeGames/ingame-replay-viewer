// The spike page's part of the hook that reaches DS main RAM (#72): the facts come from the
// picked dump, the heap from the running core; src/gen5/main-ram.ts holds the rules.
import type { Gen5Hook, MainRamReport } from '../../gen5/hook.ts'
import {
  ARM9_PROBE_SIZE,
  HEADER_COPY_OFFSET,
  HEADER_PROBE_SIZE,
  MAIN_RAM_SIZE,
  MAIN_RAM_START,
  type MainRam,
  mainRamAt,
  type MainRamFacts,
  quietWord,
  scanForMainRam,
  SECURE_AREA_SIZE,
} from '../../gen5/main-ram.ts'
import { GAME_CODE_OFFSET, type NdsHeader } from '../../gen5/nds-header.ts'
import { toBase64 } from './codec.ts'

type RamHook = Pick<Gen5Hook, 'findMainRam' | 'readWord' | 'writeWord' | 'readBytes' | 'quietWord'>

/** The header's first bytes and the ARM9 bytes past the secure area, read from the dump. */
export async function readFacts(
  file: File,
  header: NdsHeader,
  headerBytes: Uint8Array,
): Promise<MainRamFacts> {
  const from = header.arm9RomOffset + SECURE_AREA_SIZE
  const arm9Probe = new Uint8Array(await file.slice(from, from + ARM9_PROBE_SIZE).arrayBuffer())
  return {
    header: headerBytes.slice(0, HEADER_PROBE_SIZE),
    arm9RamAddress: header.arm9RamAddress,
    arm9Probe,
  }
}

const gameCodeAt = (ram: MainRam) =>
  String.fromCharCode(...ram.read(MAIN_RAM_START + HEADER_COPY_OFFSET + GAME_CODE_OFFSET, 4))

/** The hook's RAM calls, and main RAM itself for the frame hook: scanned on first use and kept. */
export function ramHook(
  heapOrNone: () => Uint8Array | undefined,
  facts: () => MainRamFacts | undefined,
): { hook: RamHook; ram: () => MainRam } {
  let ram: MainRam | undefined
  const heap = () => {
    const bytes = heapOrNone()
    if (!bytes) throw new Error('The core has not started yet.')
    return bytes
  }
  const kept = () => {
    if (!ram) throw new Error('Main RAM has not been found yet.')
    return ram
  }
  const hook: RamHook = {
    findMainRam: (): MainRamReport => {
      const known = facts()
      if (!known) throw new Error('Pick a dump first.')
      const begin = performance.now()
      const scan = scanForMainRam(heap(), known)
      const scanMs = Math.round(performance.now() - begin)
      ram = scan.base === undefined ? undefined : mainRamAt(heap, scan.base)
      const { bases, headerHits, heapBytes } = scan
      const gameCode = ram ? gameCodeAt(ram) : ''
      return { base: scan.base ?? -1, bases, headerHits, heapBytes, scanMs, gameCode }
    },
    readWord: (address) => kept().read32(address),
    writeWord: (address, value) => {
      kept().write32(address, value)
    },
    readBytes: (address, length) => toBase64(kept().read(address, length)),
    quietWord: () => quietWord(kept().read(MAIN_RAM_START, MAIN_RAM_SIZE)),
  }
  const found = () => {
    if (!ram) hook.findMainRam()
    return kept()
  }
  return { hook, ram: found }
}
