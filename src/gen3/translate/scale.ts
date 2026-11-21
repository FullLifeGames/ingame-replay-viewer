// The HP scale of the stream (D5): every Pokémon has 100 HP, the log's own scale in a replay.
import type { HpFraction } from '../../script/types'

/** The maximum HP of every Pokémon in the party tables. */
export const HP_SCALE = 100

/**
 * A logged HP on the stream's scale, always a whole number: `24/48` is 50, full HP is 100 and no
 * HP is 0. A Pokémon that has HP left keeps at least 1, and one that lost some shows at most 99,
 * so rounding never faints or heals it.
 */
export function scaleHp({ hp, max }: HpFraction): number {
  if (hp <= 0) return 0
  if (hp >= max) return HP_SCALE
  return Math.min(HP_SCALE - 1, Math.max(1, Math.round((hp * HP_SCALE) / max)))
}
