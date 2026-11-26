// The two scenes of the S6 run of the Gen 5 spike (#72) and the text lines it logs beside them.
// In both the game decides nothing: the first block takes the far Pokémon to an HP that no damage
// roll of the move gives, and the second answers from the far side with no button between. The
// "unknown" scene uses moves the near Pokémon does not know. Moves come from @pkmn/dex by name;
// in Gen 5 the game's move numbers are the dex numbers.
import { Dex } from '@pkmn/dex'

import { type BattleMonReading, singleBattlePos } from '../src/gen5/battle-mons.ts'
import type { SingleBattle } from '../src/gen5/bw2-numbers.ts'
import type { Moment } from '../src/gen5/moment.ts'

export type SceneName = 'known' | 'unknown'

/** A replay side: the near one at the bottom of the screen, the far one at the top. */
export type Side = 'near' | 'far'

/** The text banks of pokebw2 that the run reads its lines from: the move lines and the
 * standard lines. */
export const TEXT_BANKS = {
  move: 'res/text/system/0016.txt',
  standard: 'res/text/system/0019.txt',
}

/** Per scene: the near Pokémon's move and the far HP after it, the far one's move and the near
 * HP after it. */
const SCENES: Record<SceneName, { near: string; farHp: number; far: string; nearHp: number }> = {
  known: { near: 'Tackle', farHp: 1, far: 'Tackle', nearHp: 7 },
  unknown: { near: 'Flamethrower', farHp: 3, far: 'Hydro Pump', nearHp: 2 },
}

function dexMove(name: string) {
  const move = Dex.forGen(5).moves.get(name)
  if (!move.exists) throw new Error(`@pkmn/dex knows no move ${name}`)
  return move
}

const moveNumber = (name: string) => dexMove(name).num

/** The battle client of `side`: the near side is the player's client and the far side the
 * opponent's, as the single battle's setup creates them (build/gen5/bw2.json). */
export function sideClient(single: SingleBattle, side: Side): number {
  return side === 'near' ? single.clients.player : single.clients.opponent
}

/** The move that `side`'s Pokémon uses in `scene`. */
export function sceneMove(scene: SceneName, side: Side): string {
  return SCENES[scene][side]
}

/** The label in the move bank of the line "X used Y!" for `side`'s Pokémon: the far side's
 * line names it as the foe's. */
export function moveLineLabel(moveName: string, side: Side): string {
  const name = dexMove(moveName).name.replace(/[^A-Za-z0-9]/g, '')
  return `Bank0016_Text_${side === 'far' ? 'FoesUsed' : 'Used'}${name}`
}

export function sceneBlocks(
  scene: SceneName,
  mons: { near: BattleMonReading; far: BattleMonReading },
  single: SingleBattle,
  stdMessage: number,
): { name: string; moment: Moment }[] {
  const plan = SCENES[scene]
  const side = (mon: BattleMonReading, of: Side) => ({
    monId: mon.monId,
    pos: singleBattlePos(single, sideClient(single, of)),
  })
  const near = side(mons.near, 'near')
  const far = side(mons.far, 'far')
  const hp = (mon: BattleMonReading) => ({ hp: mon.hp, maxHp: mon.maxHp })
  return [
    {
      name: 'b1',
      moment: {
        attacker: near,
        target: { ...far, ...hp(mons.far) },
        move: moveNumber(plan.near),
        hpAfter: plan.farHp,
        stdMessage,
      },
    },
    {
      name: 'b2',
      moment: {
        attacker: far,
        target: { ...near, ...hp(mons.near) },
        move: moveNumber(plan.far),
        hpAfter: plan.nearHp,
      },
    },
  ]
}

const lines = (bank: string) => bank.split('\n')

/** The message ID of `label` in a text bank of pokebw2's res/text: its line, counted from 0. */
export function textId(bank: string, label: string): number {
  const id = lines(bank).findIndex((line) => line.startsWith(`${label} =`))
  if (id < 0) throw new Error(`the text bank has no ${label}`)
  return id
}

/** The text of message `id` in a text bank, as pokebw2 writes it. */
export function textLine(bank: string, id: number): string {
  const line = lines(bank)[id]
  const at = line?.indexOf(' = ') ?? -1
  if (line === undefined || at < 0) throw new Error(`the text bank has no message ${String(id)}`)
  return line.slice(at + 3)
}
