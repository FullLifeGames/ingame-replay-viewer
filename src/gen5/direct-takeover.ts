// Plan 1 of the direct battle start (#97, D1, D8): from power-on to the park. The boot proc queues
// its boot screens in one update and the proc manager switches to them in the next. In the frame
// boundary between, the page writes the routine (rom/gen5/routine.c) into the battle overlay's
// span and swaps the queued table and param for the routine's, so the manager starts our proc in
// their place. The routine builds the game data and the battle's setup and waits there, at the
// park, for the page's writes (direct-park.ts). Pure: the numbers come in from build/gen5/bw2.json
// and build/gen5/routine.json, and the page plays the steps (src/web/gen5/frame-hook.ts).
import type { EntryNumbers } from './bw2-numbers.ts'
import { entryAddress, entryCall, entryConstant, entryField, entryLayout } from './entry-field.ts'
import { mark, type MacroStep } from './macro.ts'
import type { RamCheck, RamRef } from './ram-check.ts'
import { littleEndian, type MemoryWrite } from './ram-write.ts'
import { blockAddress, type RoutineLayout, routineLayout } from './routine-layout.ts'
import {
  ORDER_MEMBERS,
  type OrderMember,
  orderBytes,
  type RoutineBuild,
  ROUTINE_STAGES,
} from './routine-order.ts'

/** Frames from power-on to the boot proc's first queue: the save's read lies in them. E-5's runs
 * measured frame 216. */
const WINDOW_LIMIT = 450

/** Frames from the takeover to the park: the switch, then our init in the next update or so. E-5's
 * runs measured 29. */
const PARK_LIMIT = 90

const WORD = 4

/** The proc table: the routine's init, main and exit, in the order GameProcFunctions holds them. */
const PROC_FUNCTIONS = ['init', 'main', 'exit'] as const

/** The block's members the routine writes; the page owns every other one. */
const ROUTINE_OWNS: readonly OrderMember[] = ['stage', 'gameData', 'setup']

const MANAGER_NEXT = ['nextOverlayId', 'nextFunctions', 'nextParam'] as const

/** The routine's pieces, their places in the battle overlay, the checks that its region holds
 * what the page wrote, and the plan's steps and watch. */
export interface Takeover {
  steps: MacroStep[]
  layout: RoutineLayout
  region: RamCheck[]
  watch: RamRef[]
}

/** A word of the proc manager, through the pointer at sGameProcManager. */
function managerRef(entry: EntryNumbers, member: string): RamRef {
  const field = entryField(entry, 'GameProcManager', member)
  if (field.size !== WORD) throw new Error(`the proc manager's ${member} is no word`)
  const address = entryAddress(entry, 'sGameProcManager')
  return { name: `manager.${member}`, address, hops: [field.offset], width: WORD }
}

/** The block's word of the stage, which the routine writes. */
export function stageRef(layout: RoutineLayout): RamRef {
  return { name: 'stage', address: blockAddress(layout, 'stage'), width: WORD }
}

/** The window: the manager has the boot screens queued, their table and param next. */
function windowChecks(entry: EntryNumbers): RamCheck[] {
  const bootScreens = entryAddress(entry, 'BOOT_SCREENS_PROC_FUNCTIONS')
  return [
    { ...managerRef(entry, 'queued'), noneOf: [0] },
    { ...managerRef(entry, 'nextFunctions'), oneOf: [bootScreens] },
    { ...managerRef(entry, 'nextParam'), oneOf: [entryAddress(entry, 'sBootScreensParam')] },
  ]
}

/** The block as the page writes it: the routine's own words at 0, and every number it calls with. */
function blockBytes(entry: EntryNumbers, layout: RoutineLayout): number[] {
  return orderBytes({
    stage: ROUTINE_STAGES.none,
    go: 0,
    gameData: 0,
    setup: 0,
    gameDataCreate: entryCall(entry, 'GameData_Create'),
    setupCreate: entryCall(entry, 'BtlSetup_Create'),
    resetFieldStatus: entryCall(entry, 'ResetBtlFieldStatus'),
    setTrainer1v1Single: entryCall(entry, 'BtlSetup_SetTrainer1v1Single'),
    bgmPlay: entryCall(entry, 'GFL_SndBGMPlay'),
    replaceProc: entryCall(entry, 'GCTX_ProcMgrReplaceProc'),
    heapId: entryConstant(entry, 'HEAPID_USER'),
    battleOverlayId: entryConstant(entry, 'OVERLAY_BATTLE_MAIN'),
    battleProcFunctions: entryAddress(entry, 'BATTLE_PROC_FUNCTIONS'),
    channelMask: entryConstant(entry, 'SND_CHANNEL_MASK_ALL'),
    bgmOffset: entryField(entry, 'BtlSetup', 'fieldSituation.bgm').offset,
    fieldStatus: layout.fieldStatus.start,
  })
}

interface Piece {
  field: string
  address: number
  bytes: readonly number[]
}

/** The routine's code, table and block, each with its place. The table's entries carry the Thumb
 * bit: the routine is Thumb code, as the game's procs are. */
function pieces(entry: EntryNumbers, routine: RoutineBuild, layout: RoutineLayout): Piece[] {
  const { start } = layout.code
  const table = PROC_FUNCTIONS.flatMap((name) =>
    littleEndian(start + routine.functions[name] + 1, WORD, `routine ${name}`),
  )
  return [
    { field: 'routine code', address: start, bytes: routine.bytes },
    { field: 'routine table', address: layout.table.start, bytes: table },
    { field: 'routine block', address: layout.block.start, bytes: blockBytes(entry, layout) },
  ]
}

/** The takeover: code before the pointers to it, the manager's next words last. */
function takeoverWrites(
  entry: EntryNumbers,
  routine: RoutineBuild,
  layout: RoutineLayout,
): MemoryWrite[] {
  const next = {
    nextOverlayId: entryConstant(entry, 'OVERLAY_NONE') >>> 0,
    nextFunctions: layout.table.start,
    nextParam: layout.block.start,
  }
  const own = pieces(entry, routine, layout).map((piece): MemoryWrite => ({
    kind: 'bytes',
    ...piece,
  }))
  const manager = MANAGER_NEXT.map((member): MemoryWrite => {
    const { name, address, hops = [] } = managerRef(entry, member)
    return {
      kind: 'bytes',
      field: name,
      address,
      hops,
      bytes: littleEndian(next[member], WORD, name),
    }
  })
  return [...own, ...manager]
}

/** The checks of one piece, a word each (a byte each for a tail short of a word). */
function pieceChecks({ field, address, bytes }: Piece): RamCheck[] {
  const words = Array.from({ length: Math.floor(bytes.length / WORD) }, (_, i) => i * WORD)
  const tail = Array.from({ length: bytes.length % WORD }, (_, i) => words.length * WORD + i)
  const check = (at: number, width: 1 | 4): RamCheck => ({
    name: `${field} at ${String(at)}`,
    address: address + at,
    width,
    oneOf: [bytes.slice(at, at + width).reduceRight((sum, byte) => sum * 256 + byte, 0)],
  })
  return [...words.map((at) => check(at, WORD)), ...tail.map((at) => check(at, 1))]
}

/** That the routine's region holds what the page wrote; of the block, the words the page owns. */
function regionChecks(entry: EntryNumbers, routine: RoutineBuild, layout: RoutineLayout) {
  const skipped = new Set(ROUTINE_OWNS.map((member) => blockAddress(layout, member)))
  return pieces(entry, routine, layout)
    .flatMap(pieceChecks)
    .filter((check) => !skipped.has(check.address))
}

/** An until that holds or fails in the frame it starts: a check of the moment. */
export const checkNow = (name: string, checks: readonly RamCheck[]): MacroStep => ({
  kind: 'until',
  name,
  checks,
  holdFor: 1,
  limit: 0,
})

const waitFor = (name: string, checks: readonly RamCheck[], limit: number): MacroStep => ({
  kind: 'until',
  name,
  checks,
  holdFor: 1,
  limit,
})

/** Plan 1 from power-on: the takeover in the window, then the routine at its park. A stage that
 * failed ends the run by its name; a region that changed ends it at its check. */
export function takeover(entry: EntryNumbers, routine: RoutineBuild): Takeover {
  if (routine.order.join() !== ORDER_MEMBERS.join()) {
    throw new Error("the routine's build has another order block than ORDER_MEMBERS")
  }
  const sizes = {
    code: routine.size,
    table: PROC_FUNCTIONS.length * WORD,
    block: ORDER_MEMBERS.length * WORD,
    fieldStatus: entryLayout(entry, 'BtlFieldStatus').size,
  }
  const layout = routineLayout(entry.battleOverlay, sizes, entry.bootOverlays)
  const stage = stageRef(layout)
  const region = regionChecks(entry, routine, layout)
  const { parked, noGameData, noSetup } = ROUTINE_STAGES
  const steps: MacroStep[] = [
    waitFor('takeover-window', windowChecks(entry), WINDOW_LIMIT),
    { kind: 'write', name: 'takeover', writes: takeoverWrites(entry, routine, layout) },
    checkNow('takeover-region', region),
    mark('takeover'),
    waitFor('routine-stage', [{ ...stage, oneOf: [parked, noGameData, noSetup] }], PARK_LIMIT),
    checkNow('noGameData', [{ ...stage, noneOf: [noGameData] }]),
    checkNow('noSetup', [{ ...stage, noneOf: [noSetup] }]),
    checkNow('park-region', region),
    mark('park'),
  ]
  const watch = [managerRef(entry, 'queued'), managerRef(entry, 'nextFunctions'), stage]
  return { steps, layout, region, watch }
}
