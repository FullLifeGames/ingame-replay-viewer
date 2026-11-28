// The invented places of the routes' specs (src/gen5/route.ts, trainer-route.ts and
// continue-route.ts): the map's events and the save's trainer under pokebw2's names, far from any
// real town's or route's. scripts/gen5-fixtures-real.test.ts holds that no number here equals the
// generated one under the same name, and scripts/gen5-derived-real.test.ts holds the same of the
// places the routes derive from them.
import type { ActorPlace, RoutePlaces } from './bw2-numbers.ts'

/** Invented places of the map's events. */
export const PLACES: RoutePlaces = {
  hughTrigger: { x: 10, z: 100, width: 5 },
  battleTrigger: { x: 10, z: 102, width: 5 },
  outlookTrigger: { x: 10, z: 105, width: 5 },
  bianca: { x: 12, z: 90 },
}

/** An invented tile of the save's trainer. */
export const TRAINER: ActorPlace = { x: 30, z: 300 }
