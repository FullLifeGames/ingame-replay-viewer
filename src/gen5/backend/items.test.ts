import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, effectWrites, FAR, NEAR, writtenAt } from './effect-testing.ts'
import { ITEM_SEQUENCES } from './items.ts'
import { lineId } from './lines.ts'
import { gen5Item } from './names.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40 at position 0, against Tyranitar, mon
// ID 10 at position 1; Bob's next Pokémon takes mon ID 11. Line 0 is the first line after
// `|turn|1`. The scenes take their lines from the two Gen 5 OU test replays.
const DUGTRIO = NEAR.firstMonId
const TYRANITAR = FAR.firstMonId
const STARMIE = FAR.firstMonId + 1
const NONE = NUMBERS.pkm.items.ITEM_NONE ?? Number.NaN
const RECOVER = NUMBERS.flow.recoverEffect

const set = (line: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_EFFECT_LINES[line]),
  args,
})
const writes = (...lines: string[]) => effectWrites(ITEM_SEQUENCES, ...lines)

// Scene: Tyranitar's Pursuit takes Jirachi below half, and Jirachi eats its Sitrus Berry
// (smogtours-gen5ou-862240, turn 20). ServerControl_UseHeldItem reserves SC_USE_HELD_ITEM before
// the handler's heal; the berry is gone after the line.
describe('a Sitrus Berry', () => {
  const all = writes(
    '|move|p2a: Tyranitar|Pursuit|p1a: Dugtrio',
    '|-damage|p1a: Dugtrio|49/100',
    '|-enditem|p1a: Dugtrio|Sitrus Berry|[eat]',
    '|-heal|p1a: Dugtrio|74/100|[from] item: Sitrus Berry',
  )
  const sitrus = gen5Item('Sitrus Berry')

  it('uses the held item at the berry eaten', () => {
    expect(writtenAt(all, 2)).toEqual([cmd('SC_USE_HELD_ITEM', DUGTRIO)])
  })

  it('heals with the effect, the HP, the gauge and the line, then sets and consumes the item', () => {
    expect(writtenAt(all, 3)).toEqual([
      cmd('SC_EFFECT_BY_POS', NEAR.pos, RECOVER),
      cmd('SC_OP_ADD_HP', DUGTRIO, 25),
      cmd('SC_UPDATE_HP_GAUGE', DUGTRIO),
      set('sitrusBerry', DUGTRIO, sitrus),
      cmd('SC_OP_SET_ITEM', DUGTRIO, NONE),
      cmd('SC_OP_CONSUME_ITEM', DUGTRIO, sitrus),
    ])
  })
})

// Scene: Tyranitar eats its Custap Berry at the turn's start and moves first (turn 20).
describe('a Custap Berry', () => {
  it('uses the held item, then shows its line and sets and consumes the item', () => {
    const all = writes(
      '|-enditem|p2a: Tyranitar|Custap Berry|[eat]',
      '|-activate|p2a: Tyranitar|item: Custap Berry|[consumed]',
    )
    const custap = gen5Item('Custap Berry')
    expect(writtenAt(all, 0)).toEqual([cmd('SC_USE_HELD_ITEM', TYRANITAR)])
    expect(writtenAt(all, 1)).toEqual([
      set('custapBerry', TYRANITAR, custap),
      cmd('SC_OP_SET_ITEM', TYRANITAR, NONE),
      cmd('SC_OP_CONSUME_ITEM', TYRANITAR, custap),
    ])
  })
})

// Scene: Scizor's Life Orb costs it HP after its hit (gen5ou-2718717830, turn 18).
describe('Life Orb', () => {
  it('takes the HP with its gauge, then shows the line', () => {
    const all = writes(
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-supereffective|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|10/100',
      '|-damage|p1a: Dugtrio|90/100|[from] item: Life Orb',
    )
    expect(writtenAt(all, 3)).toEqual([
      cmd('SC_OP_SUBTRACT_HP', DUGTRIO, 10),
      cmd('SC_UPDATE_HP_GAUGE', DUGTRIO),
      set('lifeOrb', DUGTRIO),
    ])
  })
})

// Scene: Starmie comes in over Stealth Rock with its Air Balloon, and Terrakion's Close Combat
// pops it (smogtours-gen5ou-862240, turn 25).
describe('an Air Balloon', () => {
  const all = writes(
    '|switch|p2a: Starmie|Starmie|100/100',
    '|-damage|p2a: Starmie|88/100|[from] Stealth Rock',
    '|-item|p2a: Starmie|Air Balloon',
    '|move|p1a: Dugtrio|Close Combat|p2a: Starmie',
    '|-damage|p2a: Starmie|41/100',
    '|-enditem|p2a: Starmie|Air Balloon',
  )

  it('shows its line as its holder comes in', () => {
    expect(writtenAt(all, 2)).toEqual([set('airBalloon', STARMIE)])
  })

  it('shows the popped line, then takes the item', () => {
    expect(writtenAt(all, 5)).toEqual([
      set('airBalloonPopped', STARMIE),
      cmd('SC_OP_SET_ITEM', STARMIE, NONE),
    ])
  })
})

// Scene: Ferrothorn's Knock Off takes Ninetales' Leftovers (gen5ou-2718717830, turn 6).
describe('Knock Off', () => {
  it('shows the line with the attacker, the target and the item, then takes the item', () => {
    const all = writes(
      '|move|p1a: Dugtrio|Knock Off|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|96/100',
      '|-enditem|p2a: Tyranitar|Leftovers|[from] move: Knock Off|[of] p1a: Dugtrio',
    )
    expect(writtenAt(all, 2)).toEqual([
      set('knockedOff', DUGTRIO, TYRANITAR, gen5Item('Leftovers')),
      cmd('SC_OP_SET_ITEM', TYRANITAR, NONE),
    ])
  })
})

// Scene: an item line whose cause or item has no sequence here, or whose Pokémon stands on the
// bench, writes nothing; Leftovers stays with hits.ts.
describe('the item lines it leaves', () => {
  it('writes nothing for Leftovers, Trick, a berry of its own kind or a bench Pokémon', () => {
    const all = writes(
      '|-heal|p1a: Dugtrio|100/100|[from] item: Leftovers',
      '|-item|p2a: Tyranitar|Choice Scarf|[from] move: Trick',
      '|-enditem|p2a: Tyranitar|Lum Berry|[eat]',
      '|-enditem|p2a: Tyranitar|Choice Scarf|[from] move: Trick',
      '|-activate|p2a: Tyranitar|move: Trick|[of] p1a: Dugtrio',
      '|-damage|p2a: Tyranitar|90/100|[from] item: Rocky Helmet|[of] p1a: Dugtrio',
      '|switch|p2a: Starmie|Starmie|100/100',
      '|-enditem|p2: Tyranitar|Air Balloon',
    )
    expect([0, 1, 2, 3, 4, 5, 7].map((at) => writtenAt(all, at))).toEqual(Array(7).fill(undefined))
  })
})
