// The places of the battle's gauge that the hide of the near box's HP numbers reads (#137), from
// pokebw2 by scripts/gen5-bw2-gauge.ts into the key `gauge` of build/gen5/bw2.json. Bw2Numbers in
// bw2-numbers.ts holds it.
import type { Bw2Symbol, StructLayout } from './bw2-numbers.ts'

/** The structs on the way from sBtlvEffect to the HP numbers' actor, by pokebw2's names. */
type GaugeStruct = 'BtlvEffect' | 'BtlvGauge' | 'BtlvGaugeEntry' | 'ClActor'

/** The values the hide checks and writes, by pokebw2's names. */
export type GaugeConstant =
  | 'GX_OAM_MODE_NORMAL'
  | 'GX_OAM_MODE_OBJWND'
  | 'NNS_G2D_RND_OVERWRITE_OBJMODE'
  | 'NNS_G2D_RND_OVERWRITE_PRIORITY'
  | 'FX32_SHIFT'
  | 'BTLV_MCSS_POS_SINGLE_PLAYER'

/** The gauge's places: the effect work's root symbol, the layouts along the chain (BtlvEffect up
 * to `gauge`, BtlvGauge up to `loaded`, a whole BtlvGaugeEntry, ClActor up to `cellOnly`), and the
 * values. */
export interface GaugeNumbers {
  effect: Bw2Symbol
  layouts: Record<GaugeStruct, StructLayout>
  constants: Record<GaugeConstant, number>
}
