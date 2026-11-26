// The order block of the direct entry's routine (#97, rom/gen5/routine.c): the words the page
// writes for the routine and reads back from it. Pure: the page turns pokebw2's numbers from
// build/gen5/bw2.json into named values, and this module lays them out as the block's bytes.
// rom/gen5/routine.c declares the same members in the same order; a spec holds the two equal, and
// no third place names them.

/** The block's members, one 32-bit word each, in the order of the C struct `OrderBlock`. */
export const ORDER_MEMBERS = [
  // The routine's stage, and the page's go once its writes are done
  'stage',
  'go',
  // What the routine gives back for the page's writes
  'gameData',
  'setup',
  // Call addresses with the Thumb bit: GameData_Create, BtlSetup_Create, ResetBtlFieldStatus,
  // BtlSetup_SetTrainer1v1Single, GFL_BGSysEnableEngines, GFL_SndBGMPlay and
  // GCTX_ProcMgrReplaceProc
  'gameDataCreate',
  'setupCreate',
  'resetFieldStatus',
  'setTrainer1v1Single',
  'enableEngines',
  'bgmPlay',
  'replaceProc',
  // HEAPID_USER, OVERLAY_BATTLE_MAIN, BATTLE_PROC_FUNCTIONS and SND_CHANNEL_MASK_ALL
  'heapId',
  'battleOverlayId',
  'battleProcFunctions',
  'channelMask',
  // The offset of the setup's fieldSituation.bgm, and the room for one BtlFieldStatus
  'bgmOffset',
  'fieldStatus',
] as const

export type OrderMember = (typeof ORDER_MEMBERS)[number]

/** The routine's stages in the word `stage`, as the C file's `STAGE_*` defines name them. */
export const ROUTINE_STAGES = {
  /** What the page writes with the block, before the routine runs. */
  none: 0,
  started: 1,
  /** The setup is built and the routine waits for the go. */
  parked: 2,
  /** The battle's proc is queued in the routine's place. */
  gone: 3,
  /** A call gave no pointer, and the routine waits for good. */
  noGameData: 4,
  noSetup: 5,
} as const

const WORD = 4
const WORD_MIN = -(2 ** 31)
const WORD_END = 2 ** 32

/** The byte offset of `member` inside the block. */
export function orderOffset(member: OrderMember): number {
  return ORDER_MEMBERS.indexOf(member) * WORD
}

/** The block's bytes, little-endian, from one value per member; a missing or unknown name throws. */
export function orderBytes(values: Readonly<Record<string, number>>): number[] {
  const known = new Set<string>(ORDER_MEMBERS)
  const unknown = Object.keys(values).filter((name) => !known.has(name))
  if (unknown.length > 0) throw new RangeError(`no order member ${unknown.join(', ')}`)
  return ORDER_MEMBERS.flatMap((name) => {
    const value = values[name]
    if (value === undefined) throw new RangeError(`no value for the order member ${name}`)
    if (!Number.isInteger(value) || value < WORD_MIN || value >= WORD_END) {
      throw new RangeError(`${name}: ${String(value)} fills no word`)
    }
    const word = value >>> 0
    return [0, 8, 16, 24].map((shift) => (word >>> shift) & 0xff)
  })
}

/** What scripts/gen5-routine.ts writes into build/gen5/routine.json. */
export interface RoutineBuild {
  /** The code's bytes, from the start of its one section. */
  bytes: number[]
  size: number
  /** Each proc function's byte offset in the code; the page adds the Thumb bit to its address. */
  functions: { init: number; main: number; exit: number }
  /** The order members the build was checked against. */
  order: string[]
  /** The compiler's first `--version` line and the flags it ran with. */
  compiler: string
  flags: string[]
  /** The SHA-256 of the bytes, in hex. */
  sha256: string
}
