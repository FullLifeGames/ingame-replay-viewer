import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { speciesOf } from '../tables/lookup'
import { plain, popUp, streamOfLog } from '../testing'

const CASTFORM_IN = '|switch|p2a: Castform|Castform|100/100'
const formChange = (name: string) => ({
  op: 'formChange',
  side: 'far',
  species: speciesOf(name).number,
})

/** The instructions of the log lines from `from` on, without the END that closes the log. */
function sceneFrom(from: number, ...lines: string[]) {
  return streamOfLog(...lines)
    .instructions.filter(({ line, instruction }) => line >= from && instruction.op !== 'end')
    .map(({ instruction }) => plain(instruction))
}

const fallbacksOf = (...lines: string[]) =>
  streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)

describe("Castform's Forecast", () => {
  // `BattleScript_BattlerFormChangeWithString`: the pop-up, flushtextbox, the change and its
  // animation, then STRINGID_PKMNTRANSFORMED.
  it('shows the pop-up, empties the text box, changes the form, then says so', () => {
    const lines = [
      CASTFORM_IN,
      '|-weather|SunnyDay',
      '|-formechange|p2a: Castform|Castform-Sunny|[msg]|[from] ability: Forecast',
    ]
    expect(sceneFrom(NEXT + 2, ...lines)).toEqual([
      popUp('far', 'Forecast', true),
      { op: 'flushTextBox' },
      formChange('Castform-Sunny'),
      'The opposing Castform transformed!',
      popUp('far', 'Forecast', false),
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })

  it('turns Castform back with the same op and its base species when the weather ends', () => {
    const scene = sceneFrom(
      NEXT + 4,
      CASTFORM_IN,
      '|-weather|RainDance',
      '|-formechange|p2a: Castform|Castform-Rainy|[msg]|[from] ability: Forecast',
      '|-weather|none',
      '|-formechange|p2a: Castform|Castform|[msg]|[from] ability: Forecast',
    )
    expect(scene).toEqual([
      popUp('far', 'Forecast', true),
      { op: 'flushTextBox' },
      formChange('Castform'),
      'The opposing Castform transformed!',
      popUp('far', 'Forecast', false),
    ])
    expect(formChange('Castform').species).toBe(351)
  })

  it('names our own Pokémon without "The opposing"', () => {
    const scene = sceneFrom(
      NEXT + 1,
      '|switch|p1a: Cloud|Castform|100/100',
      '|-formechange|p1a: Cloud|Castform-Snowy|[msg]|[from] ability: Forecast',
    )
    expect(scene).toContain('Cloud transformed!')
  })
})

describe('a form change by anything but Forecast', () => {
  it('plays as Forecast does without the pop-up and names the fallback', () => {
    const lines = [CASTFORM_IN, '|-formechange|p2a: Castform|Castform-Sunny|[msg]']
    expect(sceneFrom(NEXT + 1, ...lines)).toEqual([
      { op: 'flushTextBox' },
      formChange('Castform-Sunny'),
      'The opposing Castform transformed!',
    ])
    expect(fallbacksOf(...lines)).toEqual([
      {
        line: NEXT + 1,
        kind: 'form',
        detail: 'Castform-Sunny by no cause: Gen 3 changes forms by Forecast only',
      },
    ])
  })

  it('names the cause it came from', () => {
    const lines = [CASTFORM_IN, '|-formechange|p2a: Castform|Castform-Rainy|[from] item: Damp Rock']
    expect(fallbacksOf(...lines).map(({ detail }) => detail)).toEqual([
      'Castform-Rainy by Damp Rock: Gen 3 changes forms by Forecast only',
    ])
  })

  it('names a form the expansion lacks and shows its base species', () => {
    const lines = ['|-formechange|p2a: Tyranitar|Rockruff-Dusk|[msg]|[from] ability: Forecast']
    expect(sceneFrom(NEXT, ...lines)).toContainEqual({
      op: 'formChange',
      side: 'far',
      species: speciesOf('Rockruff').number,
    })
    expect(fallbacksOf(...lines).map(({ kind }) => kind)).toEqual(['form'])
  })
})
