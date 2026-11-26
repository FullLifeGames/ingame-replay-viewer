// An invented direct entry (#97) for the specs of the two plans: every address, offset, size and
// constant here is made up for them, none comes from pokebw2, and the layouts hold only the
// members the plans read.
import type { Bw2Symbol, EntryNumbers, StructLayout } from './bw2-numbers.ts'
import type { RoutineBuild } from './routine-order.ts'
import { ORDER_MEMBERS } from './routine-order.ts'

const call = (address: number) => ({ call: address + 1, thumb: true })
const data = (name: string, address: number, module = 'arm9'): Bw2Symbol => ({
  name,
  kind: 'data',
  address,
  module,
})
const word = (offset: number) => ({ offset, size: 4 })
const layout = (size: number, fields: StructLayout['fields']): StructLayout => ({
  size,
  align: 4,
  fields,
})

export const ENTRY: EntryNumbers = {
  functions: {
    GCTX_ProcMgrQueueProc: call(0x02004000),
    GCTX_ProcMgrReplaceProc: call(0x02004100),
    GameData_Create: call(0x02004200),
    BtlSetup_Create: call(0x02004300),
    ResetBtlFieldStatus: call(0x02004400),
    BtlSetup_SetTrainer1v1Single: call(0x02004500),
    GFL_SndBGMPlay: call(0x02004600),
    GFL_BGSysEnableEngines: call(0x02004700),
  },
  data: {
    sGameProcManager: data('sGameProcManager', 0x02110000),
    EVENT_TITLE_FUNCS: data('EVENT_TITLE_FUNCS', 0x02080000),
    sBootScreensParam: data('sBootScreensParam', 0x02110010),
    BOOT_SCREENS_PROC_FUNCTIONS: data('BOOT_SCREENS_PROC_FUNCTIONS', 0x02200000, 'ov162'),
    BATTLE_PROC_FUNCTIONS: data('BATTLE_PROC_FUNCTIONS', 0x02300800, 'ov167'),
  },
  constants: {
    HEAPID_USER: 7,
    OVERLAY_BATTLE_MAIN: 99,
    OVERLAY_NONE: -1,
    SND_CHANNEL_MASK_ALL: 0x7fff,
    TRAINER_CLASS_YOUNGSTER: 0x21,
    CONFIG_TEXT_SPEED_FAST: 3,
    CHAR_EOM: 0xfffe,
  },
  layouts: {
    GameProcManager: layout(0x20, {
      queued: word(0x0c),
      nextOverlayId: word(0x14),
      nextFunctions: word(0x18),
      nextParam: word(0x1c),
    }),
    BtlSetup: layout(0x100, {
      battleStyle: word(4),
      'fieldSituation.bgm': { offset: 0x0a, size: 2 },
      party: { offset: 0x20, size: 16 },
      playerInfo: { offset: 0x30, size: 16 },
      trainers: { offset: 0x44, size: 16 },
      gameData: word(0x64),
      config: word(0x68),
    }),
    BtlSetupTrainer: layout(0x30, { trainerClass: word(4), name: word(0x14) }),
    StrBuf: layout(12, {
      size: { offset: 0, size: 2 },
      length: { offset: 2, size: 2 },
      magic: word(4),
      chars: { offset: 8, size: 2 },
    }),
    PokeParty: layout(0x260, {
      capacity: word(0),
      count: word(4),
      pkms: { offset: 8, size: 0x240 },
      slotExists: { offset: 0x248, size: 1 },
    }),
    PlayerInfo: layout(0x20, { name: { offset: 0, size: 12 }, gender: { offset: 0x1d, size: 1 } }),
    Config: layout(4, { textSpeed: { offset: 0, size: 2, bit: 2, bits: 3 } }),
    BtlFieldStatus: layout(0x0e, {}),
    PartyPkm: layout(0x60, {}),
  },
  bufferSizes: { TrainerBattleSetup_Create: 9 },
  battleOverlay: { start: 0x02300000, end: 0x02340000 },
  bootOverlays: { ov004: { start: 0x02280000, end: 0x02300000 } },
}

export const ROUTINE: RoutineBuild = {
  bytes: Array.from({ length: 0x24 }, (_, i) => (i * 7 + 1) % 256),
  size: 0x24,
  functions: { init: 0, main: 0x10, exit: 0x20 },
  order: [...ORDER_MEMBERS],
  compiler: 'an invented compiler',
  flags: [],
  sha256: '00'.repeat(32),
}
