// The invented numbers of the generator's report (scripts/gen5-bw2-report.ts): pokebw2's names
// with symbols, codes, clients and list entries of their own; the parts of the text box, the
// gauge and the effects come from their own fixtures. scripts/gen5-fixtures-real.test.ts holds
// that no number here equals the generated one under the same name.
import {
  BW2_NUMBERS_VERSION,
  type Bw2Numbers,
  type Bw2Symbol,
  type StructLayout,
} from '../src/gen5/bw2-numbers.ts'
import { REPLAY_NUMBERS } from '../src/gen5/backend/replay.fixtures.ts'
import { gaugeNumbers } from './gen5-bw2-gauge.ts'
import { GAUGE_INPUT } from './gen5-bw2-gauge.fixtures.ts'
import { textBoxNumbers } from './gen5-bw2-textbox.ts'
import { TEXT_BOX_INPUT } from './gen5-bw2-textbox.fixtures.ts'

/** An invented layout; the quiet report reads none of it. */
const LAYOUT: StructLayout = { size: 0x50, align: 4, fields: {} }

const symbol = (name: string, address: number): Bw2Symbol => ({
  name,
  kind: 'data',
  address,
  module: 'ov001',
})

/** A symbol in main RAM and one in the ARM9's fast RAM before it. */
export const REPORT_SYMBOLS = {
  inside: symbol('inside', 0x02012345),
  itcm: symbol('itcm', 0x01ff8123),
}

/** The roots of the text box, the gauge and an entry symbol outside main RAM. */
export const REPORT_OUTSIDE = {
  textBox: { stringWork: symbol('sWork', 0x01ff8040) },
  gauge: { effect: symbol('sBtlvEffect', 0x01ff8200) },
  entry: { data: { itcm: symbol('itcm', 0x01ff8123) } },
}

export const REPORT_NUMBERS: Bw2Numbers = {
  version: BW2_NUMBERS_VERSION,
  pokebw2: { repository: 'https://example.invalid/pokebw2.git', commit: 'c0ffee' },
  symbols: REPORT_SYMBOLS,
  adapterCommands: { ACMD_A: 7, ACMD_B: 9 },
  adapterStates: { STATE_A: 5 },
  serverCommands: { CMD_A: 11, CMD_B: 13, CMD_MAX: 17 },
  argFormats: { ARGS_NONE: { code: 19, argCount: 0, puts: [] } },
  commandFormats: { CMD_A: 'ARGS_NONE', CMD_B: 'ARGS_NONE' },
  messages: { formats: [], soundCommand: 'CMD_B', argEnd: 23 },
  queueSize: 0x77,
  adapter: LAYOUT,
  battle: {
    server: LAYOUT,
    mainModule: LAYOUT,
    pokeCon: LAYOUT,
    party: LAYOUT,
    monCore: LAYOUT,
    waitSelectSeq: 29,
    single: { clientCount: 3, posClientIds: [2, 0, 1], clients: { player: 2, opponent: 0 } },
    constants: {},
    monIds: { firstByClient: [9, 21, 33], perClient: 7 },
  },
  route: {
    hughTrigger: { x: 1, z: 31, width: 2 },
    battleTrigger: { x: 1, z: 33, width: 2 },
    outlookTrigger: { x: 1, z: 37, width: 2 },
    bianca: { x: 2, z: 29 },
  },
  saveTrainer: { x: 3, z: 41 },
  entry: {
    functions: {
      Spin_Main: { call: 0x02004001, thumb: true },
      Spin_Arm: { call: 0x02004100, thumb: false },
    },
    data: { sTable: symbol('sTable', 0x02100000) },
    constants: { HEAPID_SPIN: 43 },
    layouts: { Kite: LAYOUT, Lamp: LAYOUT },
    bufferSizes: { Kite_Create: 9 },
    setupIndices: { player: 3, opponent: 2 },
    battleOverlay: { start: 0x02190000, end: 0x02190600 },
    bootOverlays: { ovA: { start: 0x02180000, end: 0x02190000 } },
  },
  pkm: {
    layouts: { PartyPkm: LAYOUT, PkmBlockA: LAYOUT, PkmBlockB: LAYOUT },
    blockColumns: { PkmBlockA: 1, PkmBlockB: 0 },
    blockOffsets: [
      [0x30, 0x18],
      [0x18, 0x30],
    ],
    selector: { mask: 0x30, shift: 4 },
    cipher: { multiplier: 0x2f1, increment: 0x55, shift: 12 },
    shinyBelow: 5,
    constants: { PARTY_SIZE: 3 },
    species: { SPECIES_NONE: 6, SPECIES_BUDLING: 1 },
    moves: { MOVE_POKE: 2 },
    items: { ITEM_ACORN: 3 },
    abilities: { ABILITY_STURDY_ROOTS: 4 },
    natures: { NATURE_CALM: 5 },
  },
  font: { chars: 'Za' },
  text: {
    standard: { Bank0019_Text_CriticalHit: 3, Bank0019_Text_FillerOne: 8 },
    set: { Bank0018_Text_FillerTwo: 5, Bank0018_Text_Burned: 6 },
  },
  flow: {
    damageKinds: { plain: 8, super: 6, resisted: 9 },
    recoverEffect: 0x4d,
    switchEffects: { switchOut: 0x5b, drag: 0x5e },
    faintGaugeFlag: 3,
    chargeRelease: 0x17,
  },
  effects: REPLAY_NUMBERS.effects,
  textBox: textBoxNumbers(TEXT_BOX_INPUT),
  gauge: gaugeNumbers(GAUGE_INPUT),
}
