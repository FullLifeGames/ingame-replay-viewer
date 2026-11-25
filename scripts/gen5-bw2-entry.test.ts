import { describe, expect, it } from 'vitest'

import type { Bw2Symbol } from '../src/gen5/bw2-numbers'
import { callAddress, ENTRY_FUNCTIONS, type EntryInput, entryNumbers } from './gen5-bw2-entry'

// Every input here is written for the spec; none is copied from pokebw2, and every address,
// offset and value is invented.

const fn = (address: number, mode?: 'thumb' | 'arm'): Bw2Symbol => ({
  name: 'Spin_Main',
  kind: 'function',
  address,
  size: 0x40,
  module: 'arm9',
  ...(mode === undefined ? {} : { mode }),
})

// Scene: the routine calls the game's functions through a register; a Thumb function needs its
// address with bit 0 set, an ARM one its plain address.
describe('callAddress', () => {
  it('sets the Thumb bit of a Thumb function and leaves an ARM one as it is', () => {
    expect(callAddress(fn(0x02001000, 'thumb'))).toBe(0x02001001)
    expect(callAddress(fn(0x02002000, 'arm'))).toBe(0x02002000)
  })

  it('throws on data, on a function with no instruction set, and on an address out of step', () => {
    expect(() => callAddress({ ...fn(0x02001000), kind: 'data' })).toThrow(/Spin_Main/)
    expect(() => callAddress(fn(0x02001000))).toThrow(/Spin_Main/)
    expect(() => callAddress(fn(0x02001001, 'thumb'))).toThrow(/Spin_Main/)
    expect(() => callAddress(fn(0x02002002, 'arm'))).toThrow(/Spin_Main/)
  })
})

const symbolLines = (names: readonly string[], kind: string, from: number) =>
  names.map((name, at) => `${name} ${kind} addr:0x${(from + at * 0x10).toString(16)}`).join('\n')

const link = (start: number, end: number) =>
  `    .text       start:0x${start.toString(16)} end:0x${end.toString(16)} kind:code align:32\n\n`

/** A whole invented input: tiny structs with the members the entry reads, and invented numbers. */
const INPUT: EntryInput = {
  arm9Symbols: [
    symbolLines(ENTRY_FUNCTIONS, 'kind:function(thumb,size=0x20)', 0x02004000),
    symbolLines(['sGameProcManager', 'sBootScreensParam'], 'kind:bss', 0x02100000),
    'EVENT_TITLE_FUNCS kind:data(any) addr:0x02080000',
  ].join('\n'),
  bootScreensSymbols: 'BOOT_SCREENS_PROC_FUNCTIONS kind:data(any) addr:0x02200000 ambiguous',
  battleSymbols: 'BATTLE_PROC_FUNCTIONS kind:data(any) addr:0x02190100 ambiguous',
  battleOverlay: 'ov101',
  battleLink: link(0x02190000, 0x02190600),
  bootLinks: { ov004: link(0x02180000, 0x02190000), ov031: link(0x021a0000, 0x021a0800) },
  gameMainC:
    'static void GameInit(void) { GFL_OvlLoad(OVERLAY_ID(4)); GFL_OvlLoad(OVERLAY_ID(31)); }',
  procsysC: `struct GameProcManager { HeapID heapId; s32 overlayId; GameProc *proc; BOOL queued;
    BOOL replace; s32 nextOverlayId; const GameProcFunctions *nextFunctions; void *nextParam; };`,
  heapH: 'typedef u16 HeapID;\nenum { HEAPID_SYSTEM = 0x0, HEAPID_USER = 0x5 };',
  overlayH: '#define OVERLAY_NONE (-1)',
  soundH: '#define SND_CHANNEL_MASK_ALL 0xff',
  strbufC: 'struct StrBuf { u16 size; u16 length; u32 magic; u16 chars[1]; };',
  setupH: `struct BtlFieldSituation { u16 bgm; u16 winBgm; };
struct BtlSetupTrainer { u32 trainerId; u32 trainerClass; StrBuf *name; PMSData winWords; };
struct BtlSetup { u32 battleType; u32 battleStyle; BtlFieldSituation fieldSituation;
    PokeParty *party[4]; PlayerInfo *playerInfo[4]; BtlSetupTrainer *trainers[4];
    GameData *gameData; Config *config; MATHRandContext32 rand; };`,
  regulationH: '',
  pmsH: '#define PMS_WORDS 2\nstruct PMSData { u16 type; u16 words[PMS_WORDS]; };',
  fieldEventH: 'struct BtlFieldStatus { u32 bgId; u8 weather; };',
  mathH: 'typedef struct { u64 x; u64 mul; } MATHRandContext32;',
  partyH: `#define PARTY_SIZE 6
struct PartyPkm { u32 pid; MailData mail; };
struct PokeParty { s32 capacity; s32 count; PartyPkm pkms[PARTY_SIZE]; u8 slotExists; };`,
  mailH: 'struct MailData { u32 trainerId; u16 words[3]; };',
  playerInfoH: 'struct PlayerInfo { u16 name[8]; u32 id; u8 gender; };',
  configH: `enum { CONFIG_TEXT_SPEED_SLOW = 0, CONFIG_TEXT_SPEED_FAST = 3 };
struct Config { u16 textSpeed : 4; u16 : 12; };`,
  battleProcH: '#define OVERLAY_BATTLE_MAIN OVERLAY_ID(101)',
  trainerClasses: 'TRAINER_CLASS_HIKER = 0\nTRAINER_CLASS_YOUNGSTER\n',
}

// Scene: the direct entry's routine and the page take every number from the generated file.
describe('entryNumbers', () => {
  it('gives each function its call address, each data symbol, and the constants by name', () => {
    const entry = entryNumbers(INPUT)
    expect(Object.keys(entry.functions)).toEqual(ENTRY_FUNCTIONS)
    expect(entry.functions[ENTRY_FUNCTIONS[0] ?? '']).toEqual({ call: 0x02004001, thumb: true })
    expect(entry.data.sGameProcManager?.address).toBe(0x02100000)
    expect(entry.data.sBootScreensParam?.address).toBe(0x02100010)
    expect(entry.data.BOOT_SCREENS_PROC_FUNCTIONS?.module).toBe('ov162')
    expect(entry.data.BATTLE_PROC_FUNCTIONS?.address).toBe(0x02190100)
    expect(entry.constants).toEqual({
      HEAPID_USER: 5,
      OVERLAY_BATTLE_MAIN: 101,
      OVERLAY_NONE: -1,
      SND_CHANNEL_MASK_ALL: 0xff,
      TRAINER_CLASS_YOUNGSTER: 1,
      CONFIG_TEXT_SPEED_FAST: 3,
    })
  })

  it('lays out the structs the page writes, nested and 64-bit members as the compiler does', () => {
    const { layouts } = entryNumbers(INPUT)
    expect(Object.keys(layouts)).toEqual([
      'GameProcManager',
      'BtlSetup',
      'BtlSetupTrainer',
      'StrBuf',
      'PokeParty',
      'PlayerInfo',
      'Config',
      'BtlFieldStatus',
    ])
    expect(layouts.GameProcManager?.fields.nextParam).toEqual({ offset: 0x1c, size: 4 })
    expect(layouts.BtlSetup?.fields['fieldSituation.bgm']).toEqual({ offset: 8, size: 2 })
    expect(layouts.BtlSetup?.fields.party).toEqual({ offset: 0x0c, size: 0x10 })
    expect(layouts.BtlSetup?.fields.rand).toEqual({ offset: 0x44, size: 0x10 })
    expect(layouts.BtlSetup?.size).toBe(0x54)
    expect(layouts.BtlSetupTrainer?.size).toBe(0x14)
    expect(layouts.PokeParty?.fields.pkms).toEqual({ offset: 8, size: 0x60 })
    expect(layouts.Config?.fields.textSpeed).toEqual({ offset: 0, size: 2, bit: 0, bits: 4 })
  })

  it('spans the battle overlay and the boot overlays from their link files', () => {
    const entry = entryNumbers(INPUT)
    expect(entry.battleOverlay).toEqual({ start: 0x02190000, end: 0x02190600 })
    expect(entry.bootOverlays).toEqual({
      ov004: { start: 0x02180000, end: 0x02190000 },
      ov031: { start: 0x021a0000, end: 0x021a0800 },
    })
  })

  it('throws on a member the entry needs that a struct lacks', () => {
    const setupH = INPUT.setupH.replace('Config *config;', '')
    expect(() => entryNumbers({ ...INPUT, setupH })).toThrow(/BtlSetup.*config/)
  })

  it('throws when the battle overlay meets a boot overlay, naming both', () => {
    const bootLinks = { ...INPUT.bootLinks, ov031: link(0x021905f0, 0x021a0800) }
    expect(() => entryNumbers({ ...INPUT, bootLinks })).toThrow(/ov101.*ov031/)
  })

  it("throws when GameInit's loads and the boot link files differ", () => {
    const bootLinks = { ov004: link(0x02180000, 0x02190000) }
    expect(() => entryNumbers({ ...INPUT, bootLinks })).toThrow(/ov031/)
  })

  it('throws when the battle overlay of the define is not the one whose files it was given', () => {
    expect(() => entryNumbers({ ...INPUT, battleOverlay: 'ov102' })).toThrow(/ov101.*ov102/)
  })
})
