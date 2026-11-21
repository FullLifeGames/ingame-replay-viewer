// The HP scale of the stream (D5): every Pokémon has 100 HP, the log's own scale in a replay.
import type { HpFraction } from '../../script/types'

/** The maximum HP of every Pokémon in the party tables. */
export const HP_SCALE = 100

/**
 * A logged HP on the stream's scale: `24/48` is 50. A Pokémon that has HP left keeps at least 1,
 * and one that lost some shows at most 99, so rounding never faints or heals it.
 */
export function scaleHp({ hp, max }: HpFraction): number {
  if (max === HP_SCALE || hp <= 0 || hp >= max)
    return Math.max(0, Math.min(hp, max) * (HP_SCALE / max))
  return Math.min(HP_SCALE - 1, Math.max(1, Math.round((hp * HP_SCALE) / max)))
}
