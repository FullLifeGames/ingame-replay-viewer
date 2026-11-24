// The steps of the S6 run of the Gen 5 spike (#72): from the battle state, hold the server, let
// the player answer the action menu, then hand the player's client one block per moment, each
// once it answered the one before, and ask for the player's action again at the end. The page
// plays the steps frame by frame (src/web/gen5/frame-hook.ts); scripts/gen5-moment.ts reads the
// addresses and the Pokémon from RAM first.
import {
  type AdapterNumbers,
  adapterWrites,
  commandWrites,
  holdWrites,
} from '../src/gen5/adapter.ts'
import type { ServerCmdTable } from '../src/gen5/bw2-numbers.ts'
import type { MacroStep } from '../src/gen5/macro.ts'
import { momentCommands, type Moment } from '../src/gen5/moment.ts'
import type { RamCheck } from '../src/gen5/ram-check.ts'
import { packCommands } from '../src/gen5/server-cmd.ts'

/** Frames the player's answer to the menu may take; A every MASH_EVERY frames for 3. */
const MENU_LIMIT = 1800
const MASH_EVERY = 30
/** Frames a block may take, and a frame of it every BLOCK_FRAMES_EVERY frames. */
const BLOCK_LIMIT = 3000
const BLOCK_FRAMES_EVERY = 10
/** After the last command: a frame every MENU_FRAMES_EVERY frames, MENU_FRAMES times. */
const MENU_FRAMES_EVERY = 120
const MENU_FRAMES = 5

export interface MomentSetup {
  adapterNumbers: AdapterNumbers
  table: ServerCmdTable
  /** The player's adapter, read from sAdapters. */
  adapter: number
  blocks: { name: string; moment: Moment }[]
}

/** The check that the client answered its last command: `returned` reads 1 at the adapter. */
function answered(setup: MomentSetup): RamCheck {
  const field = setup.adapterNumbers.layout.fields.returned
  if (field?.size !== 1) throw new Error("the adapter's returned must sit in one byte")
  const mask = (2 ** (field.bits ?? 8) - 1) * 2 ** (field.bit ?? 0)
  const address = setup.adapter + field.offset
  return { name: 'returned', address, width: 1, mask, oneOf: [2 ** (field.bit ?? 0)] }
}

function blockSteps(setup: MomentSetup, name: string, moment: Moment): MacroStep[] {
  const block = packCommands(setup.table, momentCommands(moment))
  return [
    { kind: 'write', name, writes: adapterWrites(setup.adapterNumbers, setup.adapter, block) },
    {
      kind: 'until',
      name,
      checks: [answered(setup)],
      holdFor: 1,
      limit: BLOCK_LIMIT,
      markEvery: BLOCK_FRAMES_EVERY,
    },
    { kind: 'mark', name: `${name}-answered` },
  ]
}

export function momentSteps(setup: MomentSetup): MacroStep[] {
  const { adapterNumbers, adapter } = setup
  const ask = commandWrites(adapterNumbers, adapter, adapterNumbers.selectAction, new Uint8Array())
  return [
    { kind: 'write', name: 'hold', writes: holdWrites(adapterNumbers, adapter) },
    {
      kind: 'until',
      name: 'answer-menu',
      checks: [answered(setup)],
      holdFor: 1,
      limit: MENU_LIMIT,
      mash: { buttons: ['A'], every: MASH_EVERY, hold: 3 },
      markEvery: MASH_EVERY,
    },
    { kind: 'mark', name: 'hp-before' },
    ...setup.blocks.flatMap(({ name, moment }) => blockSteps(setup, name, moment)),
    { kind: 'write', name: 'select-action', writes: ask },
    ...Array.from({ length: MENU_FRAMES }, (_, i): MacroStep[] => [
      { kind: 'wait', frames: MENU_FRAMES_EVERY },
      { kind: 'mark', name: `menu-${String(i + 1)}` },
    ]).flat(),
    { kind: 'mark', name: 'end' },
  ]
}
