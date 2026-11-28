// An invented direct entry (#97) for the specs of its plan: every address, offset, size and
// constant here is made up for them. The functions, data, constants, structs and members carry
// pokebw2's names, since the plan looks them up by name, and the layouts hold only the members the
// plan reads, in an order of their own. scripts/gen5-fixtures-real.test.ts holds that no number
// here equals the one that build/gen5/bw2.json generates under the same name, and
// scripts/gen5-derived-real.test.ts holds the same of what the plan derives from them, such as a
// side's slot in the setup's arrays. The routine's build is ours, not pokebw2's.
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
  align: 8,
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
    OVERLAY_NONE: -3,
    SND_CHANNEL_MASK_ALL: 0x7fff,
    TRAINER_CLASS_YOUNGSTER: 0x21,
    CONFIG_TEXT_SPEED_FAST: 3,
    CHAR_EOM: 0xfffe,
    BTL_STYLE_SINGLE: 4,
    BTL_STYLE_DOUBLE: 6,
    SEQ_BGM_VS_TRAINER: 0x3a7,
  },
  layouts: {
    GameProcManager: layout(0x2c, {
      queued: word(0x08),
      nextFunctions: word(0x10),
      nextOverlayId: word(0x20),
      nextParam: word(0x24),
    }),
    BtlSetup: layout(0x100, {
      battleStyle: word(0x0c),
      'fieldSituation.bgm': { offset: 0x0a, size: 2 },
      party: { offset: 0x1c, size: 16 },
      playerInfo: { offset: 0x40, size: 16 },
      trainers: { offset: 0x50, size: 16 },
      gameData: word(0x64),
      config: word(0x68),
    }),
    BtlSetupTrainer: layout(0x30, { name: word(0x08), trainerClass: word(0x10) }),
    StrBuf: layout(16, {
      magic: word(0),
      length: { offset: 4, size: 2 },
      size: { offset: 6, size: 2 },
      chars: { offset: 10, size: 2 },
    }),
    PokeParty: layout(0x260, {
      count: word(0),
      capacity: word(8),
      pkms: { offset: 0x10, size: 0x1e0 },
      slotExists: { offset: 0x250, size: 1 },
    }),
    PlayerInfo: layout(0x24, { name: { offset: 0, size: 12 }, gender: { offset: 0x1a, size: 1 } }),
    Config: layout(6, { textSpeed: { offset: 0, size: 2, bit: 2, bits: 3 } }),
    BtlFieldStatus: layout(0x0e, {}),
    PartyPkm: layout(0x60, {}),
  },
  bufferSizes: { TrainerBattleSetup_Create: 9 },
  // The two sides' elements of the setup's per-client arrays, the player's after the opponent's.
  setupIndices: { player: 1, opponent: 0 },
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
