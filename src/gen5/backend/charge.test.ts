import { describe, expect, it } from 'vitest'

import { NEXT, scriptOf } from '../../script/testing.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import { writeScript } from './moves.ts'
import { gen5Move } from './names.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Alice's Dugtrio, mon ID 40, stands at position 0, and
// Bob's Tyranitar, mon ID 10, at position 1. Line NEXT is `|turn|1`.

/** What the short log `|turn|1` and `lines` writes: every command in order, and the fallbacks of
 * events by kind, line and detail. */
function written(...lines: string[]) {
  const { actions, fallbacks } = writeScript(scriptOf('|turn|1', ...lines), NUMBERS)
  return {
    commands: actions.flatMap((action) => action.flatMap((event) => event.commands)),
    fallbacks: fallbacks.flatMap((one) =>
      'event' in one ? [`${one.event} ${String(one.line - NEXT)} ${one.kind}`] : [],
    ),
  }
}

const SOLAR_BEAM = gen5Move('Solar Beam')

// Scene: gen5ou-2718717830's turn 8 (script lines 129 to 133), Ninetales's Solar Beam in sun on
// Politoed, as Tyranitar's on Dugtrio. The simulator logs the move line [still], then -prepare
// and -anim of the same move, then the hit. The server skips the charge turn
// (ServerControl_CheckChargeTurn): the move line, the charge's line, the charge's look, the
// release's look, then the hit.
describe('a charge skip', () => {
  it('plays the move line, the charge line, both looks and the hit', () => {
    expect(
      written(
        '|move|p2a: Tyranitar|Solar Beam||[still]',
        '|-prepare|p2a: Tyranitar|Solar Beam',
        '|-anim|p2a: Tyranitar|Solar Beam|p1a: Dugtrio',
        '|-supereffective|p1a: Dugtrio',
        '|-damage|p1a: Dugtrio|21/100',
      ),
    ).toEqual({
      commands: [
        { command: 'SC_MOVE_MSG', args: [10, SOLAR_BEAM] },
        {
          command: 'SC_MSG_SET',
          message: lineId(NUMBERS.text, GEN5_EFFECT_LINES.absorbedLight),
          args: [10],
        },
        { command: 'SC_MOVE_ANIM', args: [1, 0, SOLAR_BEAM, 0] },
        { command: 'SC_MOVE_ANIM', args: [1, 0, SOLAR_BEAM, NUMBERS.flow.chargeRelease] },
        { command: 'SC_OP_SUBTRACT_HP', args: [40, 79] },
        {
          command: 'SC_DAMAGE_PLURAL',
          args: [1, NUMBERS.flow.damageKinds.super, SOLAR_BEAM],
          bytes: [40],
        },
        {
          command: 'SC_MSG_STD',
          message: lineId(NUMBERS.text, GEN5_LINES.superEffective),
          args: [],
        },
      ],
      fallbacks: [],
    })
  })

  // A charge turn that the move spends: the release comes a turn later.
  it('lists a charge turn the move spends as unplayed', () => {
    expect(
      written('|move|p2a: Tyranitar|Solar Beam||[still]', '|-prepare|p2a: Tyranitar|Solar Beam'),
    ).toEqual({ commands: [], fallbacks: ['move 1 unplayed', 'prepare 2 unplayed'] })
  })

  // Sky Attack through a Power Herb has the same lines, and the backend has no charge line for it.
  it('lists a skip of a move with no generated charge line as unplayed, its bar moving', () => {
    expect(
      written(
        '|move|p2a: Tyranitar|Sky Attack||[still]',
        '|-prepare|p2a: Tyranitar|Sky Attack',
        '|-anim|p2a: Tyranitar|Sky Attack|p1a: Dugtrio',
        '|-damage|p1a: Dugtrio|50/100',
      ),
    ).toEqual({
      commands: [
        { command: 'SC_OP_SUBTRACT_HP', args: [40, 50] },
        { command: 'SC_UPDATE_HP_GAUGE', args: [40] },
      ],
      fallbacks: ['move 1 unplayed', 'prepare 2 unplayed', 'anim 3 unplayed', 'damage 4 unplayed'],
    })
  })

  // The server's order for a release that misses is not read yet: the skip waits whole.
  it('lists a skip whose release misses as unplayed', () => {
    expect(
      written(
        '|move|p2a: Tyranitar|Solar Beam||[still]',
        '|-prepare|p2a: Tyranitar|Solar Beam',
        '|-anim|p2a: Tyranitar|Solar Beam|p1a: Dugtrio|[miss]',
        '|-miss|p2a: Tyranitar|p1a: Dugtrio',
      ).fallbacks,
    ).toEqual(['move 1 unplayed', 'prepare 2 unplayed', 'anim 3 unplayed', 'miss 4 unplayed'])
  })

  it('lists a look of its own with no charge as unplayed', () => {
    expect(
      written(
        '|move|p2a: Tyranitar|Solar Beam||[still]',
        '|-anim|p2a: Tyranitar|Solar Beam|p1a: Dugtrio',
      ).fallbacks,
    ).toEqual(['move 1 unplayed', 'anim 2 unplayed'])
  })
})
