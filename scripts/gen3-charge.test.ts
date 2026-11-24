import { describe, expect, it } from 'vitest'

import { chargeTurns } from './gen3-charge.ts'

// A `gMovesInfo` in miniature: a two-turn move, one with an effect on its charge turn behind an
// `#if` (as Skull Bash's), a move with no charge and a commented one.
const MOVES_INFO = `const struct MoveInfo gMovesInfo[MOVES_COUNT_ALL] =
{
    [MOVE_POUND] = { .name = COMPOUND_STRING("Pound"), .argument = { .power = 40 } },
    [MOVE_FLY] =
    {
        .name = COMPOUND_STRING("Fly"),
        .argument.twoTurnAttack = { .stringId = STRINGID_PKMNFLEWHIGH, .state = STATE_ON_AIR },
    },
    [MOVE_SKULL_BASH] =
    {
    #if B_UPDATED_MOVE_DATA >= GEN_2
        .additionalEffects = ADDITIONAL_EFFECTS({
            .moveEffect = MOVE_EFFECT_STAT_PLUS,
            .onChargeTurnOnly = TRUE,
        }),
    #endif
        .argument.twoTurnAttack = { .stringId = STRINGID_PKMNLOWEREDHEAD },
    },
    // [MOVE_GONE] = { .argument.twoTurnAttack = { .stringId = STRINGID_X } },
};
`

describe('chargeTurns', () => {
  it("reads each two-turn move's charge line and whether its animation comes first", () => {
    expect(chargeTurns(MOVES_INFO)).toEqual({
      MOVE_FLY: { stringId: 'STRINGID_PKMNFLEWHIGH', animationFirst: false },
      MOVE_SKULL_BASH: { stringId: 'STRINGID_PKMNLOWEREDHEAD', animationFirst: true },
    })
  })

  it('refuses a two-turn move that names no line', () => {
    const text = '[MOVE_X] = { .argument.twoTurnAttack = { .state = STATE_ON_AIR } },'
    expect(() => chargeTurns(text)).toThrow(/MOVE_X: twoTurnAttack names no stringId/)
  })
})
