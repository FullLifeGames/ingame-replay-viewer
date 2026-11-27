// The effect rules load on their own (W6-145): `effects.ts` imports only types from `./index`, so a
// module that loads it before the rules' index meets no import cycle.
import { describe, expect, it } from 'vitest'

import { EFFECT_RULES } from './effects'
import { ruleFor } from './index'

describe('the effect rules', () => {
  it('load before the rules index and reach it', () => {
    expect(ruleFor('|-activate|')).toBe(EFFECT_RULES['|-activate|'])
  })
})
