import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, constant, effectWrites, FAR, NEAR, numberOf, writtenAt } from './effect-testing.ts'
import { lineId } from './lines.ts'
import { gen5Item } from './names.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'
import { STATUS_SEQUENCES } from './status.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40, at position 0 against Tyranitar, mon
// ID 10, at position 1. Line 0 is the first line after `|turn|1`.
const DUGTRIO = { monId: NEAR.firstMonId, pos: NEAR.pos }
const TYRANITAR = { monId: FAR.firstMonId, pos: FAR.pos }
const { addEffects, damageEffects, conditionValues, badlyPoisonedGauge } = NUMBERS.effects

const set = (line: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_EFFECT_LINES[line]),
  args,
})
const writes = (...lines: string[]) => effectWrites(STATUS_SEQUENCES, ...lines)

// Scene: Dugtrio's Toxic badly poisons Tyranitar. ServerControl_AddCondition sets the condition
// with bad poison's value, shows the badly poisoned icon, plays poison's effect at Tyranitar and
// says it was badly poisoned.
describe('a status by a move', () => {
  it('sets bad poison with its value and icon, then the effect and the line', () => {
    const lines = ['|move|p1a: Dugtrio|Toxic|p2a: Tyranitar', '|-status|p2a: Tyranitar|tox']
    expect(writtenAt(writes(...lines), 1)).toEqual([
      cmd(
        'SC_OP_SET_CONDITION',
        TYRANITAR.monId,
        constant('CONDITION_POISON'),
        conditionValues.badlyPoisoned,
      ),
      cmd('SC_SET_GAUGE_STATUS', TYRANITAR.monId, badlyPoisonedGauge),
      cmd('SC_EFFECT_BY_POS', TYRANITAR.pos, numberOf(addEffects, 'CONDITION_POISON')),
      set('badlyPoisoned', TYRANITAR.monId),
    ])
    expect(writtenAt(writes(...lines), 0)).toBeUndefined()
  })

  // Scene: Tyranitar's Scald burns Dugtrio after its hit.
  it('burns for good with the burn icon after a hit', () => {
    const lines = [
      '|move|p2a: Tyranitar|Scald|p1a: Dugtrio',
      '|-supereffective|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|40/100',
      '|-status|p1a: Dugtrio|brn',
    ]
    expect(writtenAt(writes(...lines), 3)).toEqual([
      cmd(
        'SC_OP_SET_CONDITION',
        DUGTRIO.monId,
        constant('CONDITION_BURN'),
        conditionValues.permanent,
      ),
      cmd('SC_SET_GAUGE_STATUS', DUGTRIO.monId, constant('CONDITION_BURN')),
      cmd('SC_EFFECT_BY_POS', DUGTRIO.pos, numberOf(addEffects, 'CONDITION_BURN')),
      set('burned', DUGTRIO.monId),
    ])
  })

  // Scene: Spore puts Dugtrio to sleep for the game's most turns.
  it('puts to sleep with the sleep value', () => {
    const lines = ['|move|p2a: Tyranitar|Spore|p1a: Dugtrio', '|-status|p1a: Dugtrio|slp']
    expect(writtenAt(writes(...lines), 1)?.[0]).toEqual(
      cmd('SC_OP_SET_CONDITION', DUGTRIO.monId, constant('CONDITION_SLEEP'), conditionValues.sleep),
    )
  })

  it('has no sequence for a status by an ability yet', () => {
    const lines = ['|-status|p1a: Dugtrio|par|[from] ability: Static|[of] p2a: Tyranitar']
    expect(writtenAt(writes(...lines), 0)).toBeUndefined()
  })
})

// Scene: at the turn's end Dugtrio's Toxic Orb badly poisons it. HandlerToxicOrb hands its own
// line with the item to ServerControl_AddCondition.
describe('a status by Toxic Orb', () => {
  it('sets bad poison, then the effect and the handler line with the item', () => {
    const lines = ['|', '|-status|p1a: Dugtrio|tox|[from] item: Toxic Orb', '|upkeep']
    expect(writtenAt(writes(...lines), 1)).toEqual([
      cmd(
        'SC_OP_SET_CONDITION',
        DUGTRIO.monId,
        constant('CONDITION_POISON'),
        conditionValues.badlyPoisoned,
      ),
      cmd('SC_SET_GAUGE_STATUS', DUGTRIO.monId, badlyPoisonedGauge),
      cmd('SC_EFFECT_BY_POS', DUGTRIO.pos, numberOf(addEffects, 'CONDITION_POISON')),
      set('toxicOrb', DUGTRIO.monId, gen5Item('Toxic Orb')),
    ])
  })

  it('has no sequence for another item yet', () => {
    const lines = ['|-status|p1a: Dugtrio|brn|[from] item: Flame Orb']
    expect(writtenAt(writes(...lines), 0)).toBeUndefined()
  })
})

// Scene: Tyranitar, badly poisoned, is cured as it leaves by Natural Cure, which the log keeps
// silent. ServerControl_CureCondition cures it and clears the icon; nothing is said.
describe('a cure', () => {
  const POISONED = ['|move|p1a: Dugtrio|Toxic|p2a: Tyranitar', '|-status|p2a: Tyranitar|tox']

  it('cures in silence with the two ops alone', () => {
    const lines = [
      ...POISONED,
      '|-curestatus|p2a: Tyranitar|tox|[from] ability: Natural Cure|[silent]',
    ]
    expect(writtenAt(writes(...lines), 2)).toEqual([
      cmd('SC_OP_CURE_CONDITION', TYRANITAR.monId),
      cmd('SC_SET_GAUGE_STATUS', TYRANITAR.monId, constant('CONDITION_NONE')),
    ])
  })

  // Scene: Dugtrio wakes up. ServerControl_CureStatus cures it and says it woke up.
  it('says a Pokémon woke up after the two ops', () => {
    const lines = [
      '|move|p2a: Tyranitar|Spore|p1a: Dugtrio',
      '|-status|p1a: Dugtrio|slp',
      '|-curestatus|p1a: Dugtrio|slp|[msg]',
    ]
    expect(writtenAt(writes(...lines), 2)).toEqual([
      cmd('SC_OP_CURE_CONDITION', DUGTRIO.monId),
      cmd('SC_SET_GAUGE_STATUS', DUGTRIO.monId, constant('CONDITION_NONE')),
      set('wokeUp', DUGTRIO.monId),
    ])
  })

  // Scene: Dugtrio thaws, and Tyranitar's paralysis is cured with its own line (Refresh).
  it.each([
    ['frz', 'thawed'],
    ['par', 'statusCured'],
  ] as const)('says the %s cure with its own line', (status, said) => {
    const lines = [`|-status|p1a: Dugtrio|${status}`, `|-curestatus|p1a: Dugtrio|${status}|[msg]`]
    expect(writtenAt(writes(...lines), 1)?.[2]).toEqual(set(said, DUGTRIO.monId))
  })

  it('has no sequence for a cure by an item that the log shows', () => {
    const lines = [...POISONED, '|-curestatus|p2a: Tyranitar|tox|[from] item: Pecha Berry']
    expect(writtenAt(writes(...lines), 2)).toBeUndefined()
  })
})

// Scene: at the turn's end poison hurts Tyranitar and a burn hurts Dugtrio.
// ServerControl_ConditionDamage plays the condition's effect, moves the bar and says why.
describe("a status's damage", () => {
  it('plays the effect, takes the HP and says poison hurt', () => {
    const lines = ['|', '|-damage|p2a: Tyranitar|88/100 tox|[from] psn', '|upkeep']
    expect(writtenAt(writes(...lines), 1)).toEqual([
      cmd('SC_EFFECT_BY_POS', TYRANITAR.pos, numberOf(damageEffects, 'CONDITION_POISON')),
      cmd('SC_OP_SUBTRACT_HP', TYRANITAR.monId, 12),
      cmd('SC_UPDATE_HP_GAUGE', TYRANITAR.monId),
      set('hurtByPoison', TYRANITAR.monId),
    ])
  })

  it('plays the effect, takes the HP and says the burn hurt', () => {
    const lines = ['|', '|-damage|p1a: Dugtrio|94/100 brn|[from] brn', '|upkeep']
    expect(writtenAt(writes(...lines), 1)).toEqual([
      cmd('SC_EFFECT_BY_POS', DUGTRIO.pos, numberOf(damageEffects, 'CONDITION_BURN')),
      cmd('SC_OP_SUBTRACT_HP', DUGTRIO.monId, 6),
      cmd('SC_UPDATE_HP_GAUGE', DUGTRIO.monId),
      set('hurtByBurn', DUGTRIO.monId),
    ])
  })

  it('has no sequence for damage of another cause, or of poison out of place', () => {
    const lines = [
      '|-damage|p1a: Dugtrio|90/100|[from] item: Life Orb',
      '|switch|p1a: Politoed|Politoed, M|100/100',
      '|-damage|p1: Dugtrio|80/100 psn|[from] psn',
    ]
    const all = writes(...lines)
    expect([0, 2].map((at) => writtenAt(all, at))).toEqual([undefined, undefined])
  })
})

// Scene: Tyranitar is fully paralysed, then flinches. ServerControl_MoveFail says why the move
// failed, then plays paralysis's effect at Tyranitar; a flinch has no effect.
describe('a move a status stops', () => {
  it('says Tyranitar is paralysed, then plays the effect', () => {
    const lines = ['|move|p1a: Dugtrio|Glare|p2a: Tyranitar', '|-status|p2a: Tyranitar|par']
    expect(writtenAt(writes(...lines, '|cant|p2a: Tyranitar|par'), 2)).toEqual([
      set('fullyParalyzed', TYRANITAR.monId),
      cmd('SC_EFFECT_BY_POS', TYRANITAR.pos, numberOf(addEffects, 'CONDITION_PARALYSIS')),
    ])
  })

  it('says Tyranitar flinched, with no effect', () => {
    expect(writtenAt(writes('|cant|p2a: Tyranitar|flinch'), 0)).toEqual([
      set('flinched', TYRANITAR.monId),
    ])
  })

  it('has no sequence for a move that Disable stops', () => {
    expect(writtenAt(writes('|cant|p1a: Dugtrio|Disable|Earthquake'), 0)).toBeUndefined()
  })
})

// Scene: a status on a Pokémon in the party, out of the battle's places, has no sequence here.
describe('a Pokémon out of place', () => {
  it('has no sequence', () => {
    const lines = [
      '|switch|p1a: Politoed|Politoed, M|100/100',
      '|-status|p1: Dugtrio|brn',
      '|-curestatus|p1: Dugtrio|brn|[msg]',
      '|cant|p1: Dugtrio|par',
    ]
    const all = writes(...lines)
    expect([1, 2, 3].map((at) => writtenAt(all, at))).toEqual([undefined, undefined, undefined])
  })
})
