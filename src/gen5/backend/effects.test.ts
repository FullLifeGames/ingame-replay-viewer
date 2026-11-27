import { describe, expect, it } from 'vitest'

import { ABILITY_SEQUENCES } from './abilities.ts'
import type { Sequences } from './effect-scene.ts'
import { effectWrites, effectWritesBy, writtenAt } from './effect-testing.ts'
import { effectCommands } from './effects.ts'
import { FIELD_SEQUENCES } from './field.ts'
import { ITEM_SEQUENCES } from './items.ts'
import { MOVE_EFFECT_SEQUENCES } from './move-effects.ts'
import { STAT_SEQUENCES } from './stats.ts'
import { STATUS_SEQUENCES } from './status.ts'
import { SUBSTITUTE_SEQUENCES } from './substitute.ts'

/** A case: the log lines after `|turn|1`, the line of the event, and the record that writes it. */
type Case = readonly [string, readonly string[], number, Sequences]

const CASES: readonly Case[] = [
  ['a status by a move', ['|-status|p1a: Dugtrio|brn'], 0, STATUS_SEQUENCES],
  ['poison damage', ['|-damage|p1a: Dugtrio|88/100 psn|[from] psn'], 0, STATUS_SEQUENCES],
  ['a paralysed turn', ['|cant|p1a: Dugtrio|par'], 0, STATUS_SEQUENCES],
  [
    'Intimidate and its drop',
    ['|-ability|p2a: Tyranitar|Intimidate|boost', '|-unboost|p1a: Dugtrio|atk|1'],
    1,
    ABILITY_SEQUENCES,
  ],
  ['a stat change of its own', ['|-boost|p2a: Tyranitar|spa|1'], 0, STAT_SEQUENCES],
  [
    'a weather by an ability',
    ['|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar'],
    0,
    FIELD_SEQUENCES,
  ],
  [
    'a hit by Stealth Rock',
    ['|-damage|p2a: Tyranitar|88/100|[from] Stealth Rock'],
    0,
    FIELD_SEQUENCES,
  ],
  ['Life Orb', ['|-damage|p1a: Dugtrio|90/100|[from] item: Life Orb'], 0, ITEM_SEQUENCES],
  [
    'Iron Barbs',
    ['|-damage|p1a: Dugtrio|88/100|[from] ability: Iron Barbs|[of] p2a: Tyranitar'],
    0,
    ABILITY_SEQUENCES,
  ],
  [
    'Poison Heal',
    ['|-status|p1a: Dugtrio|tox', '|-heal|p1a: Dugtrio|100/100 tox|[from] ability: Poison Heal'],
    1,
    ABILITY_SEQUENCES,
  ],
  [
    'a drain',
    ['|-damage|p1a: Dugtrio|50/100', '|-heal|p1a: Dugtrio|60/100|[from] drain|[of] p2a: Tyranitar'],
    1,
    MOVE_EFFECT_SEQUENCES,
  ],
  [
    'a Substitute',
    ['|-start|p1a: Dugtrio|Substitute', '|-damage|p1a: Dugtrio|75/100'],
    0,
    SUBSTITUTE_SEQUENCES,
  ],
  ['Protect', ['|-singleturn|p1a: Dugtrio|Protect'], 0, MOVE_EFFECT_SEQUENCES],
  [
    'Knock Off',
    ['|-enditem|p2a: Tyranitar|Leftovers|[from] move: Knock Off|[of] p1a: Dugtrio'],
    0,
    ITEM_SEQUENCES,
  ],
]

// Scene: the writer asks one dispatch for each effect's commands (#109, lane plan 109-5); each
// kind and cause reaches the module that copies its server function.
describe('effectCommands', () => {
  it.each(CASES)('writes %s as its module does', (_, lines, at, record) => {
    const own = writtenAt(effectWrites(record, ...lines), at)
    expect(own).toBeDefined()
    expect(writtenAt(effectWritesBy(effectCommands, ...lines), at)).toEqual(own)
  })

  // An Intimidate run closes its pop-up after the drop; stats.ts' drop alone would leave it open.
  it("asks the abilities before the stats, so Intimidate's drop closes the pop-up", () => {
    const lines = ['|-ability|p2a: Tyranitar|Intimidate|boost', '|-unboost|p1a: Dugtrio|atk|1']
    const drop = writtenAt(effectWritesBy(effectCommands, ...lines), 1)
    expect(drop?.at(-1)).toEqual({ command: 'SC_ABILITY_POPUP_OUT', args: [10] })
  })

  // D13: a cause no module copies has no sequence, and the writer lists it with #110.
  it.each([
    ['a heal by Black Sludge', '|-heal|p2a: Tyranitar|60/100|[from] item: Black Sludge'],
    [
      'a status by an ability',
      '|-status|p1a: Dugtrio|par|[from] ability: Static|[of] p2a: Tyranitar',
    ],
    ['Spikes', '|-sidestart|p2: Bob|Spikes'],
    ['a critical hit on its own', '|-crit|p1a: Dugtrio'],
  ])('gives no commands for %s', (_, line) => {
    expect(writtenAt(effectWritesBy(effectCommands, line), 0)).toBeUndefined()
  })
})
