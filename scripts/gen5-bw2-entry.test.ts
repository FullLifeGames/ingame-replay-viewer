import { describe, expect, it } from 'vitest'

import type { Bw2Symbol } from '../src/gen5/bw2-numbers'
import { callAddress, ENTRY_FUNCTIONS, entryNumbers } from './gen5-bw2-entry'
import { ENTRY_INPUT as INPUT, link } from './gen5-bw2-entry.fixtures'

// Every input here is written for the spec; none is copied from pokebw2, and every address,
// offset and value is invented. The reader's texts are in gen5-bw2-entry.fixtures.ts.

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

// Scene: the direct entry's routine and the page take every number from the generated file.
describe('entryNumbers', () => {
  it('gives each function its call address, each data symbol, and the constants by name', () => {
    const entry = entryNumbers(INPUT)
    expect(Object.keys(entry.functions)).toEqual(ENTRY_FUNCTIONS)
    expect(ENTRY_FUNCTIONS).toContain('GFL_BGSysEnableEngines')
    expect(entry.functions[ENTRY_FUNCTIONS[0] ?? '']).toEqual({ call: 0x02004001, thumb: true })
    expect(entry.data.sGameProcManager?.address).toBe(0x02100000)
    expect(entry.data.sBootScreensParam?.address).toBe(0x02100010)
    expect(entry.data.BOOT_SCREENS_PROC_FUNCTIONS?.module).toBe('ov162')
    expect(entry.data.BATTLE_PROC_FUNCTIONS?.address).toBe(0x02190100)
    expect(entry.constants).toEqual({
      HEAPID_USER: 5,
      OVERLAY_BATTLE_MAIN: 101,
      OVERLAY_NONE: -3,
      SND_CHANNEL_MASK_ALL: 0xff,
      TRAINER_CLASS_YOUNGSTER: 1,
      CONFIG_TEXT_SPEED_FAST: 3,
      CHAR_EOM: 0xfffe,
      BTL_STYLE_SINGLE: 4,
      BTL_STYLE_DOUBLE: 9,
      SEQ_BGM_VS_TRAINER: 101,
    })
  })

  it("gives the size TrainerBattleSetup_Create makes the trainer's name buffer", () => {
    expect(entryNumbers(INPUT).bufferSizes).toEqual({ TrainerBattleSetup_Create: 12 })
    const setupC = INPUT.setupC.replace('GFL_StrBufCreate(12', 'GFL_StrBufCreate(size')
    expect(() => entryNumbers({ ...INPUT, setupC })).toThrow(/TrainerBattleSetup_Create/)
  })

  // Scene: the park writes the player's party and name and the trainer's at their own elements.
  it("gives each side's element of the setup's per-client arrays", () => {
    expect(entryNumbers(INPUT).setupIndices).toEqual({ player: 3, opponent: 2 })
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
      'PartyPkm',
    ])
    expect(layouts.GameProcManager?.fields.nextParam).toEqual({ offset: 4, size: 4 })
    expect(layouts.BtlSetup?.fields['fieldSituation.bgm']).toEqual({ offset: 4, size: 2 })
    expect(layouts.BtlSetup?.fields.party).toEqual({ offset: 0x0c, size: 0x14 })
    expect(layouts.BtlSetup?.fields.rand).toEqual({ offset: 0x50, size: 0x10 })
    expect(layouts.BtlSetup?.size).toBe(0x60)
    expect(layouts.BtlSetupTrainer?.size).toBe(0x0c)
    expect(layouts.PokeParty?.fields.pkms).toEqual({ offset: 12, size: 0x40 })
    expect(layouts.PartyPkm?.size).toBe(0x10)
    expect(layouts.Config?.fields.textSpeed).toEqual({ offset: 0, size: 1, bit: 3, bits: 2 })
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
