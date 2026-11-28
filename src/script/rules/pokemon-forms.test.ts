// The rules for the lines that change a Pokémon's form: Castform's Forecast, Terastallization and
// Mega Evolution.
import { describe, expect, it } from 'vitest'

import { eventsAt, NEXT, scriptOf } from '../testing'

const TYRANITAR = { side: 'far', index: 0 } as const

describe('the form change rule', () => {
  const CASTFORM = { side: 'far', index: 1 } as const
  const FORECAST = { name: 'Forecast', kind: 'ability' }

  // Showdown's Forecast: `formeChange(forme, this.effect, false, '0', '[msg]')`, which logs the
  // species, `[msg]` and the ability as `[from]`.
  it('turns Castform into its Sunny form by Forecast and back when the sun ends', () => {
    const script = scriptOf(
      '|switch|p2a: Castform|Castform|100/100',
      '|-weather|SunnyDay',
      '|-formechange|p2a: Castform|Castform-Sunny|[msg]|[from] ability: Forecast',
      '|-weather|none',
      '|-formechange|p2a: Castform|Castform|[msg]|[from] ability: Forecast',
    )

    expect(script.dropped.filter((drop) => drop.line >= NEXT)).toEqual([])
    const changes = script.events.filter((event) => event.kind === 'formChange')
    expect(changes).toEqual([
      {
        kind: 'formChange',
        line: NEXT + 2,
        who: CASTFORM,
        species: 'Castform-Sunny',
        cause: FORECAST,
        msg: true,
      },
      {
        kind: 'formChange',
        line: NEXT + 4,
        who: CASTFORM,
        species: 'Castform',
        cause: FORECAST,
        msg: true,
      },
    ])
  })

  it('reads a form change with no cause and no message', () => {
    const script = scriptOf(
      '|switch|p2a: Castform|Castform|100/100',
      '|-formechange|p2a: Castform|Castform-Rainy',
    )

    expect(eventsAt(script, NEXT + 1)).toEqual([
      { kind: 'formChange', line: NEXT + 1, who: CASTFORM, species: 'Castform-Rainy' },
    ])
  })
})

describe('the Terastallization rule (#88)', () => {
  it('reads the Pokémon and the type it terastallized into', () => {
    const script = scriptOf('|-terastallize|p2a: Tyranitar|Fairy')

    expect(script.dropped.filter((drop) => drop.line >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT)).toEqual([
      { kind: 'terastallize', line: NEXT, who: TYRANITAR, type: 'Fairy' },
    ])
  })
})

describe('the Mega Evolution rule (#125)', () => {
  const VENUSAUR = { side: 'far', index: 1 } as const
  const RAYQUAZA = { side: 'near', index: 1 } as const

  // Showdown writes the Mega's details first, then `-mega` with the base species and the stone.
  it('reads the Mega forme the line before set, and the stone', () => {
    const script = scriptOf(
      '|switch|p2a: Venusaur|Venusaur, M|100/100',
      '|detailschange|p2a: Venusaur|Venusaur-Mega, M',
      '|-mega|p2a: Venusaur|Venusaur|Venusaurite',
    )

    expect(
      script.dropped
        .filter((drop) => drop.line >= NEXT)
        .map(({ line, reason }) => ({ line, reason })),
    ).toEqual([{ line: NEXT + 1, reason: 'state' }])
    expect(eventsAt(script, NEXT + 2)).toEqual([
      {
        kind: 'megaEvolve',
        line: NEXT + 2,
        who: VENUSAUR,
        species: 'Venusaur-Mega',
        item: 'Venusaurite',
      },
    ])
  })

  it('reads a Mega Evolution with no stone, as Rayquaza takes', () => {
    const script = scriptOf(
      '|switch|p1a: Rayquaza|Rayquaza|100/100',
      '|detailschange|p1a: Rayquaza|Rayquaza-Mega',
      '|-mega|p1a: Rayquaza|Rayquaza|',
    )

    expect(eventsAt(script, NEXT + 2)).toEqual([
      { kind: 'megaEvolve', line: NEXT + 2, who: RAYQUAZA, species: 'Rayquaza-Mega' },
    ])
  })
})
