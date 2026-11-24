// The two scenes of the S6 run of the Gen 5 spike (#72) and the text lines it logs beside them.
// In both the game decides nothing: the first block takes the far Pokémon to an HP that no damage
// roll of the move gives, and the second answers from the far side with no button between. The
// "unknown" scene uses moves the near Pokémon does not know. Moves come from @pkmn/dex by name;
// in Gen 5 the game's move numbers are the dex numbers.
import { Dex } from '@pkmn/dex'

import { type BattleMonReading, singleBattlePos } from '../src/gen5/battle-mons.ts'
import type { Moment } from '../src/gen5/moment.ts'

export type SceneName = 'known' | 'unknown'

const NEAR_CLIENT = 0
const FAR_CLIENT = 1

/** Per scene: the near Pokémon's move and the far HP after it, the far one's move and the near
 * HP after it. */
const SCENES: Record<SceneName, { near: string; farHp: number; far: string; nearHp: number }> = {
  known: { near: 'Tackle', farHp: 1, far: 'Tackle', nearHp: 7 },
  unknown: { near: 'Flamethrower', farHp: 3, far: 'Hydro Pump', nearHp: 2 },
}

function moveNumber(name: string): number {
  const move = Dex.forGen(5).moves.get(name)
  if (!move.exists) throw new Error(`@pkmn/dex knows no move ${name}`)
  return move.num
}

export function sceneBlocks(
  scene: SceneName,
  mons: { near: BattleMonReading; far: BattleMonReading },
  stdMessage: number,
): { name: string; moment: Moment }[] {
  const plan = SCENES[scene]
  const side = (mon: BattleMonReading, client: number) => ({
    monId: mon.monId,
    pos: singleBattlePos(client),
  })
  const near = side(mons.near, NEAR_CLIENT)
  const far = side(mons.far, FAR_CLIENT)
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
