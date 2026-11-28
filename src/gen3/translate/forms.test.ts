import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { teraTypeGap } from '../fallbacks'
import { speciesOf } from '../tables/lookup'
import { plain, popUp, streamOfLog } from '../testing'

const CASTFORM_IN = '|switch|p2a: Castform|Castform|100/100'
const formChange = (name: string) => ({
  op: 'formChange',
  side: 'far',
  species: speciesOf(name).number,
})
const megaEvolve = (name: string) => ({
  op: 'megaEvolve',
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

describe('a Terastallization (#88, #89)', () => {
  // `BattleScript_Terastallization`: flushtextbox, STRINGID_PKMNSTORINGENERGY, the charge and the
  // activate animations, then STRINGID_PKMNTERASTALLIZEDINTO. TERA plays both animations.
  it('empties the text box, says the far Pokémon stores energy, Terastallizes it, then says so', () => {
    const line = '|-terastallize|p2a: Tyranitar|Fairy'
    expect(sceneFrom(NEXT, line)).toEqual([
      { op: 'flushTextBox' },
      'The opposing Tyranitar is storing energy!',
      { op: 'tera', side: 'far', teraType: 19 },
      'The opposing Tyranitar terastallized into the Fairy type!',
    ])
    expect(fallbacksOf(line)).toEqual([])
  })

  it('names our own Pokémon without "The opposing" and takes the type by its name', () => {
    const line = '|-terastallize|p1a: Dugtrio|Stellar'
    expect(sceneFrom(NEXT, line)).toEqual([
      { op: 'flushTextBox' },
      'Dugtrio is storing energy!',
      { op: 'tera', side: 'near', teraType: 20 },
      'Dugtrio terastallized into the Stellar type!',
    ])
    expect(fallbacksOf(line)).toEqual([])
  })

  it('says both lines of a Tera type the game lacks and names it, with no TERA', () => {
    const line = '|-terastallize|p2a: Tyranitar|???'
    expect(sceneFrom(NEXT, line)).toEqual([
      { op: 'flushTextBox' },
      'The opposing Tyranitar is storing energy!',
      'The opposing Tyranitar terastallized into the ??? type!',
    ])
    expect(fallbacksOf(line)).toEqual([{ line: NEXT, ...teraTypeGap('???') }])
  })
})

describe('a Mega Evolution (#125, #126)', () => {
  // `BattleScript_MegaEvolution`: flushtextbox, STRINGID_MEGAEVOREACTING, the Mega Evolution with
  // its animation and mark (MEGA_EVOLVE), then STRINGID_MEGAEVOEVOLVED.
  const megaOf = (ident: string, details: string, base: string, stone: string) => [
    `|switch|${ident}|${base}|100/100`,
    `|detailschange|${ident}|${details}`,
    `|-mega|${ident}|${base}|${stone}`,
  ]

  it('empties the text box, says the stone reacts, Mega Evolves the far Pokémon, then says so', () => {
    const lines = megaOf('p2a: Venusaur', 'Venusaur-Mega, M', 'Venusaur', 'Venusaurite')
    expect(sceneFrom(NEXT + 2, ...lines)).toEqual([
      { op: 'flushTextBox' },
      "The opposing Venusaur's Venusaurite is reacting to Bob's Mega Ring!",
      megaEvolve('Venusaur-Mega'),
      'The opposing Venusaur has Mega Evolved into Mega Venusaur!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })

  it('names our own Pokémon without "The opposing" and our player\'s Mega Ring', () => {
    const lines = megaOf('p1a: Alakazam', 'Alakazam-Mega, M', 'Alakazam', 'Alakazite')
    expect(sceneFrom(NEXT + 2, ...lines)).toEqual([
      { op: 'flushTextBox' },
      "Alakazam's Alakazite is reacting to Alice's Mega Ring!",
      { op: 'megaEvolve', side: 'near', species: speciesOf('Alakazam-Mega').number },
      'Alakazam has Mega Evolved into Mega Alakazam!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
    expect(megaEvolve('Alakazam-Mega').species).not.toBe(speciesOf('Alakazam').number)
  })

  it("says Rayquaza's fervent wish in place of a stone", () => {
    const lines = megaOf('p2a: Rayquaza', 'Rayquaza-Mega', 'Rayquaza', '')
    expect(sceneFrom(NEXT + 2, ...lines)).toEqual([
      { op: 'flushTextBox' },
      "Bob's fervent wish has reached the opposing Rayquaza!",
      megaEvolve('Rayquaza-Mega'),
      'The opposing Rayquaza has Mega Evolved into Mega Rayquaza!',
    ])
  })

  it('says both lines of a forme the expansion lacks and names the form alone, with no op', () => {
    const lines = [
      '|detailschange|p2a: Tyranitar|Rockruff-Dusk, M',
      '|-mega|p2a: Tyranitar|Tyranitar|Tyranitarite',
    ]
    expect(sceneFrom(NEXT + 1, ...lines)).toEqual([
      { op: 'flushTextBox' },
      "The opposing Tyranitar's Tyranitarite is reacting to Bob's Mega Ring!",
      'The opposing Tyranitar has Mega Evolved into Mega Rockruff!',
    ])
    const noted = fallbacksOf(...lines).filter(({ line }) => line === NEXT + 1)
    expect(noted.map(({ kind }) => kind)).toEqual(['form'])
  })
})

describe('a Mega that comes back (#126)', () => {
  // The ROM keeps the species of a party slot that Mega Evolved, so a comeback is the switch alone.
  const VENUSAUR_IN = '|switch|p2a: Venusaur|Venusaur, M|100/100'
  const away = '|switch|p2a: Tyranitar|Tyranitar, M|100/100'
  const mega = [
    VENUSAUR_IN,
    '|detailschange|p2a: Venusaur|Venusaur-Mega, M',
    '|-mega|p2a: Venusaur|Venusaur|Venusaurite',
  ]
  const back = '|switch|p2a: Venusaur|Venusaur-Mega, M|80/100'

  it('names no gap and plays neither a form change nor a Mega Evolution at a comeback', () => {
    const lines = [...mega, away, back, away, back]
    expect(fallbacksOf(...lines)).toEqual([])
    const ops = sceneFrom(NEXT + 3, ...lines).flatMap((step) =>
      typeof step === 'string' ? [] : [step.op],
    )
    expect(ops).toContain('switchIn')
    expect(ops).not.toContain('formChange')
    expect(ops).not.toContain('megaEvolve')
  })

  it('names none for a Pokémon that never Mega Evolved, nor for a Castform after Forecast', () => {
    const forecast = '|-formechange|p2a: Castform|Castform-Sunny|[msg]|[from] ability: Forecast'
    const lines = [VENUSAUR_IN, away, VENUSAUR_IN, CASTFORM_IN, '|-weather|SunnyDay', forecast]
    expect(fallbacksOf(...lines, away, CASTFORM_IN)).toEqual([])
  })
})
