// The numbers of the direct battle start (#97) from pokebw2 at its pin: the functions the routine
// calls with the address each takes, the data the page compares and hands over, the constants by
// name, the layouts the page and the routine write through, and the battle overlay's span, where
// the routine lives until the battle loads there. Part of build/gen5/bw2.json; nothing of pokebw2
// is committed, and the errors name roles and show no number.
import type {
  Bw2Symbol,
  EntryFunction,
  EntryNumbers,
  StructLayout,
} from '../src/gen5/bw2-numbers.ts'
import { defineValue, enumAround, parseSymbols, pickSymbols } from './gen5-bw2-c.ts'
import {
  checkApart,
  checkBootOverlays,
  gameInitOverlays,
  linkSpan,
  overlayName,
} from './gen5-bw2-span.ts'
import { structLayout } from './gen5-bw2-struct.ts'
import { listConstants } from './gen5-bw2-trainer.ts'

const ARM9 = 'config/b2_us/arm9'
const OVERLAYS = `${ARM9}/overlays`

/** The overlay of the battle, whose symbols (`symbols` in gen5-bw2.ts) and link file the
 * generator reads; the battle overlay's define must name it. */
export const BATTLE_OVERLAY = 'ov167'
/** The overlay of the boot screens, whose proc table the takeover check compares. */
const BOOT_SCREENS_OVERLAY = 'ov162'

/** The files the entry's numbers come from, by role. */
export const ENTRY_SOURCES = {
  arm9Symbols: `${ARM9}/symbols.txt`,
  bootScreensSymbols: `${OVERLAYS}/${BOOT_SCREENS_OVERLAY}/symbols.txt`,
  battleLink: `${OVERLAYS}/${BATTLE_OVERLAY}/delinks.txt`,
  gameMainC: 'src/system/main.c',
  procsysC: 'src/gfl/procsys.c',
  heapH: 'include/gfl/heap.h',
  overlayH: 'include/gfl/overlay.h',
  soundH: 'include/gfl/sound.h',
  strbufC: 'src/gfl/strbuf.c',
  setupH: 'include/system/btl_setup.h',
  regulationH: 'include/system/regulation.h',
  pmsH: 'include/system/pms_data.h',
  fieldEventH: 'include/system/field_event.h',
  mathH: 'lib/nitro/include/nitro/math.h',
  partyH: 'include/pml/poke_party.h',
  mailH: 'include/pml/mail.h',
  playerInfoH: 'include/save/player_info.h',
  configH: 'include/save/config.h',
  battleProcH: 'include/battle/battle_proc.h',
  trainerClasses: 'generated/trainer_classes.txt',
  printsysC: 'src/system/printsys.c',
  setupC: 'src/system/btl_setup.c',
}

/** The link files of the overlays GameInit loads, by overlay name; the generator checks
 * GameInit's loads against these names. */
export const BOOT_LINKS: Readonly<Record<string, string>> = {
  ov012: `${OVERLAYS}/ov012/delinks.txt`,
  ov027: `${OVERLAYS}/ov027/delinks.txt`,
}

/** The texts of ENTRY_SOURCES by role, the battle overlay's symbols and name, and the boot
 * overlays' link files by overlay name. */
export type EntryInput = Record<keyof typeof ENTRY_SOURCES, string> & {
  battleSymbols: string
  battleOverlay: string
  bootLinks: Readonly<Record<string, string>>
}

/** The functions the routine calls: the queue and the replace of the proc manager, the game
 * data's and the battle setup's constructors, the field status's reset, the setup of a one-on-one
 * trainer battle, the music, and the switch that turns both displays on, which the boot screens
 * call on a normal boot and the battle never does. All live in the ARM9's static module. */
export const ENTRY_FUNCTIONS = [
  'GCTX_ProcMgrQueueProc',
  'GCTX_ProcMgrReplaceProc',
  'GameData_Create',
  'BtlSetup_Create',
  'ResetBtlFieldStatus',
  'BtlSetup_SetTrainer1v1Single',
  'GFL_SndBGMPlay',
  'GFL_BGSysEnableEngines',
]

/** The proc manager's pointer, the boot proc's table, and the param and table the boot proc
 * queues first, which the takeover check compares; and the battle proc's table. */
const ENTRY_DATA = {
  arm9: ['sGameProcManager', 'EVENT_TITLE_FUNCS', 'sBootScreensParam'],
  bootScreens: ['BOOT_SCREENS_PROC_FUNCTIONS'],
  battle: ['BATTLE_PROC_FUNCTIONS'],
}

/** The structs the page and the routine write through: the sources each is laid out from, and
 * the members the entry reads, which each must have. */
const LAYOUTS: Readonly<
  Record<string, { from: (keyof typeof ENTRY_SOURCES)[]; members: string[] }>
> = {
  GameProcManager: {
    from: ['procsysC', 'heapH'],
    members: ['queued', 'nextOverlayId', 'nextFunctions', 'nextParam'],
  },
  BtlSetup: {
    from: ['setupH', 'regulationH', 'pmsH', 'mathH'],
    members: [
      'battleStyle',
      'fieldSituation.bgm',
      'party',
      'playerInfo',
      'trainers',
      'gameData',
      'config',
    ],
  },
  BtlSetupTrainer: { from: ['setupH', 'pmsH'], members: ['trainerClass', 'name'] },
  StrBuf: { from: ['strbufC'], members: ['size', 'length', 'chars'] },
  PokeParty: { from: ['partyH', 'mailH', 'pmsH'], members: ['capacity', 'count', 'pkms'] },
  PlayerInfo: { from: ['playerInfoH'], members: ['name', 'gender'] },
  Config: { from: ['configH'], members: ['textSpeed'] },
  BtlFieldStatus: { from: ['fieldEventH'], members: [] },
  PartyPkm: { from: ['partyH', 'mailH', 'pmsH'], members: [] },
}

/** The functions whose string buffer the page writes a name into, each creating one. */
const BUFFER_MAKERS = ['TrainerBattleSetup_Create']

/** The trainer class of the opponent (D12): the class of the shipped save's trainer. */
const TRAINER_CLASS = 'TRAINER_CLASS_YOUNGSTER'

/** The address a call through a register takes: a Thumb function's with bit 0 set, an ARM
 * function's as it is. Throws on anything else, and on an address out of step with its set. */
export function callAddress(symbol: Bw2Symbol): number {
  const { name, kind, mode, address } = symbol
  if (kind !== 'function' || mode === undefined) {
    throw new Error(`${name} is no function of a known instruction set`)
  }
  const step = mode === 'thumb' ? 2 : 4
  if (address % step !== 0) throw new Error(`${name}'s address is out of step for ${mode} code`)
  return mode === 'thumb' ? address + 1 : address
}

function entryFunctions(arm9: readonly Bw2Symbol[]): Record<string, EntryFunction> {
  const picked = pickSymbols(arm9, ENTRY_FUNCTIONS)
  return Object.fromEntries(
    Object.values(picked).map((symbol) => [
      symbol.name,
      { call: callAddress(symbol), thumb: symbol.mode === 'thumb' },
    ]),
  )
}

function entryData(input: EntryInput, arm9: readonly Bw2Symbol[]): Record<string, Bw2Symbol> {
  const bootScreens = parseSymbols(input.bootScreensSymbols, BOOT_SCREENS_OVERLAY)
  const battle = parseSymbols(input.battleSymbols, input.battleOverlay)
  return {
    ...pickSymbols(arm9, ENTRY_DATA.arm9),
    ...pickSymbols(bootScreens, ENTRY_DATA.bootScreens),
    ...pickSymbols(battle, ENTRY_DATA.battle),
  }
}

/** The value of `#define name (<n>)` or `#define name <n>`, signed. */
function signedDefine(source: string, name: string): number {
  const match = new RegExp(`^\\s*#define\\s+${name}\\s+\\(\\s*(-?\\d+)\\s*\\)`, 'm').exec(source)
  return match?.[1] === undefined ? defineValue(source, name) : Number(match[1])
}

/** The overlay ID in `#define name OVERLAY_ID(<n>)`. */
function overlayDefine(source: string, name: string): number {
  const id = new RegExp(`^\\s*#define\\s+${name}\\s+OVERLAY_ID\\((\\d+)\\)`, 'm').exec(source)?.[1]
  if (id === undefined) throw new Error(`no #define ${name} OVERLAY_ID(n)`)
  return Number(id)
}

function named(values: Readonly<Record<string, number>>, name: string): number {
  const value = values[name]
  if (value === undefined) throw new Error(`no value for ${name}`)
  return value
}

function entryConstants(input: EntryInput): Record<string, number> {
  const battle = overlayDefine(input.battleProcH, 'OVERLAY_BATTLE_MAIN')
  if (overlayName(battle) !== input.battleOverlay) {
    const given = input.battleOverlay
    throw new Error(`OVERLAY_BATTLE_MAIN names ${overlayName(battle)}, not ${given}`)
  }
  return {
    HEAPID_USER: named(enumAround(input.heapH, 'HEAPID_USER'), 'HEAPID_USER'),
    OVERLAY_BATTLE_MAIN: battle,
    OVERLAY_NONE: signedDefine(input.overlayH, 'OVERLAY_NONE'),
    SND_CHANNEL_MASK_ALL: defineValue(input.soundH, 'SND_CHANNEL_MASK_ALL'),
    [TRAINER_CLASS]: named(listConstants(input.trainerClasses), TRAINER_CLASS),
    CONFIG_TEXT_SPEED_FAST: named(
      enumAround(input.configH, 'CONFIG_TEXT_SPEED_FAST'),
      'CONFIG_TEXT_SPEED_FAST',
    ),
    CHAR_EOM: defineValue(input.printsysC, 'CHAR_EOM'),
  }
}

/** The size the function `name` gives the string buffer it creates: the first argument of the
 * first `GFL_StrBufCreate(<n>, …)` in its body. */
function bufferSize(source: string, name: string): number {
  const body = new RegExp(`\\b${name}\\([^)]*\\)\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? ''
  const size = /\bGFL_StrBufCreate\(\s*(\d+)\s*,/.exec(body)?.[1]
  if (size === undefined) throw new Error(`${name} creates no string buffer of a literal size`)
  return Number(size)
}

function entryLayouts(input: EntryInput): Record<string, StructLayout> {
  const layouts: Record<string, StructLayout> = {}
  for (const [name, { from, members }] of Object.entries(LAYOUTS)) {
    const layout = structLayout(from.map((role) => input[role]).join('\n'), name)
    const missing = members.filter((member) => layout.fields[member] === undefined)
    if (missing.length > 0) throw new Error(`${name} lacks ${missing.join(', ')}`)
    layouts[name] = layout
  }
  return layouts
}

/** Everything the direct entry needs, checked: the battle overlay meets no boot overlay, and
 * GameInit loads exactly the boot overlays whose link files were read. */
export function entryNumbers(input: EntryInput): EntryNumbers {
  const arm9 = parseSymbols(input.arm9Symbols, 'arm9')
  checkBootOverlays(gameInitOverlays(input.gameMainC), Object.keys(input.bootLinks))
  const bootOverlays = Object.fromEntries(
    Object.entries(input.bootLinks).map(([name, text]) => [name, linkSpan(text, name)]),
  )
  const battleOverlay = linkSpan(input.battleLink, input.battleOverlay)
  checkApart(input.battleOverlay, battleOverlay, bootOverlays)
  return {
    functions: entryFunctions(arm9),
    data: entryData(input, arm9),
    constants: entryConstants(input),
    layouts: entryLayouts(input),
    bufferSizes: Object.fromEntries(
      BUFFER_MAKERS.map((name) => [name, bufferSize(input.setupC, name)]),
    ),
    battleOverlay,
    bootOverlays,
  }
}
