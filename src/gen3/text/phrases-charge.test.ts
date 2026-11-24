import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import { chargeTurnOf } from '../tables/charge'
import { chargeLine } from './phrases-charge'
import { sceneOf } from './testing'

const CHARGING = Dex.moves.all().filter((move) => move.gen <= 3 && move.flags.charge === 1)

describe('the charge lines (P1)', () => {
  const { event, mon } = sceneOf('prepare', '|-prepare|p2a: Tyranitar|Solar Beam')

  it("say the line of the move's charge turn", () => {
    const sunlight = chargeTurnOf('Solar Beam')?.stringId
    expect(chargeLine(mon(event.user), 'Solar Beam', sunlight)).toEqual({
      text: 'The opposing Tyranitar absorbed light!',
    })
  })

  it('give every charging move of Gen 1 to 3 its game line', () => {
    const own = CHARGING.filter(
      ({ name }) => chargeLine(mon(event.user), name, chargeTurnOf(name)?.stringId).fallback,
    )
    expect(own.map(({ name }) => name)).toEqual([])
  })

  it('word a charge turn the game has no line for, and list it', () => {
    expect(chargeLine(mon(event.user), 'Geomancy', undefined)).toEqual({
      text: 'The opposing Tyranitar is charging Geomancy!',
      fallback: { kind: 'phrase', detail: 'no game message for the charge turn of Geomancy' },
    })
  })
})
