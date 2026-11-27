import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../../script/build.ts'
import { replayScript } from '../../script/testing.ts'
import { partyTeams } from './teams.ts'

// The invented font of these specs: every printable ASCII character.
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

// Built once, outside the specs' time limit.
const SUN_RAIN = replayScript('gen5ou-2718717830')
const SAND = replayScript('smogtours-gen5ou-862240')

const speciesOf = (mons: readonly { species: string }[]) => mons.map((mon) => mon.species)

// Scene: both Gen 5 OU test replays open with Team Preview; each side's lead goes first in the
// game's party, as the game sends out slot 0.
describe('a Gen 5 OU replay’s teams', () => {
  it('puts each side’s lead in slot 0 and the rest by first switch-in', () => {
    const { parties } = partyTeams(SUN_RAIN, ASCII)
    expect(speciesOf(parties.near)).toEqual([
      'Politoed',
      'Ferrothorn',
      'Keldeo',
      'Scizor',
      'Thundurus-Therian',
      'Tentacruel',
    ])
    expect(speciesOf(parties.far)).toEqual([
      'Darmanitan',
      'Blissey',
      'Ninetales',
      'Starmie',
      'Volcarona',
      'Ferrothorn',
    ])
    const sand = partyTeams(SAND, ASCII).parties
    expect(speciesOf(sand.near)[0]).toBe('Breloom')
    expect(speciesOf(sand.far)).toEqual([
      'Landorus-Therian',
      'Conkeldurr',
      'Jirachi',
      'Tyranitar',
      'Starmie',
      'Latias',
    ])
  })

  it('gives each Pokémon what the log reveals and Hardy, at its level, gender and shininess', () => {
    const { parties } = partyTeams(SUN_RAIN, ASCII)
    expect(parties.far[2]).toEqual({
      species: 'Ninetales',
      name: 'Ninetales',
      nicknamed: false,
      level: 100,
      gender: 'M',
      shiny: false,
      nature: 'Hardy',
      ability: 'Drought',
      item: 'Leftovers',
      moves: ['Will-O-Wisp', 'Fire Blast', 'Sunny Day', 'Solar Beam'],
    })
    expect(parties.far[5]).toMatchObject({ species: 'Ferrothorn', ability: 'Iron Barbs' })
    expect(parties.near[1]).toMatchObject({
      species: 'Ferrothorn',
      shiny: true,
      ability: 'Iron Barbs',
      item: 'Leftovers',
      moves: ['Stealth Rock', 'Knock Off'],
    })
  })

  // Scene: Latias stays in the back the whole battle and Tentacruel shows no ability.
  it('gives what the log hides the species’ first ability and no item', () => {
    const sand = partyTeams(SAND, ASCII).parties
    expect(sand.far[5]).toEqual({
      species: 'Latias',
      name: 'Latias',
      nicknamed: false,
      level: 100,
      gender: 'F',
      shiny: false,
      nature: 'Hardy',
      ability: 'Levitate',
      moves: [],
    })
    expect(partyTeams(SUN_RAIN, ASCII).parties.near[5]).toMatchObject({
      species: 'Tentacruel',
      ability: 'Clear Body',
    })
  })

  it('lists each Therian forme as a fallback at its first switch-in', () => {
    const forms = (fallbacks: readonly { kind: string; detail: string }[]) =>
      fallbacks.filter((one) => one.kind === 'form').map((one) => one.detail)
    expect(forms(partyTeams(SUN_RAIN, ASCII).fallbacks)).toEqual([
      'Thundurus-Therian shows in the base form of Thundurus',
    ])
    expect(forms(partyTeams(SAND, ASCII).fallbacks)).toEqual([
      'Landorus-Therian shows in the base form of Landorus',
      'Landorus-Therian shows in the base form of Landorus',
    ])
    const firstIn = (side: 'near' | 'far', species: string) =>
      SAND.events.find(
        (event) =>
          event.kind === 'switchIn' &&
          event.who.side === side &&
          SAND.teams[side][event.who.index]?.species === species,
      )?.line
    const lines = partyTeams(SAND, ASCII).fallbacks.map((one) => one.line)
    expect(lines).toEqual([firstIn('far', 'Landorus-Therian'), firstIn('near', 'Landorus-Therian')])
  })
})

// A short Gen 5 log with Team Preview: three near, two far; each side sends out its last member.
const PREVIEW_LOG = [
  '|gametype|singles',
  '|player|p1|Ann|1|',
  '|player|p2|Bob|2|',
  '|gen|5',
  '|tier|[Gen 5] OU',
  '|clearpoke',
  '|poke|p1|Landorus-Therian, M|item',
  '|poke|p1|Keldeo|item',
  '|poke|p1|Ferrothorn, F|item',
  '|poke|p2|Ninetales, M|item',
  '|poke|p2|Starmie|item',
  '|teampreview',
  '|teamsize|p1|3',
  '|teamsize|p2|2',
  '|start',
  '|switch|p1a: Fé|Ferrothorn, F|100/100',
  '|switch|p2a: Starmie|Starmie, shiny|100/100',
  '|turn|1',
  '',
].join('\n')
const TEAMPREVIEW_LINE = 11

describe('Team Preview’s members that never switch in', () => {
  const script = buildBattleScript(PREVIEW_LOG)

  it('follow the members sent out, by their base name, not shiny', () => {
    const { parties } = partyTeams(script, ASCII)
    expect(speciesOf(parties.near)).toEqual(['Ferrothorn', 'Landorus-Therian', 'Keldeo'])
    expect(parties.near[1]).toMatchObject({ name: 'Landorus', nicknamed: false, shiny: false })
    expect(parties.far[0]).toMatchObject({ name: 'Starmie', nicknamed: false, shiny: true })
  })

  it('list a forme at the Team Preview line, and a nickname’s missing character at its switch-in', () => {
    expect(partyTeams(script, ASCII).fallbacks).toEqual([
      {
        line: TEAMPREVIEW_LINE,
        kind: 'form',
        detail: 'Landorus-Therian shows in the base form of Landorus',
      },
      {
        line: 15,
        kind: 'character',
        detail: 'the name of the near side’s Ferrothorn "Fé" shows "?" for "é"',
      },
    ])
    expect(partyTeams(script, ASCII).parties.near[0]).toMatchObject({ name: 'F?', nicknamed: true })
  })

  // Scene: Team Preview shows a member the client's team lacks; the party still takes it.
  it('come from Team Preview where the team lacks them', () => {
    const preview = script.preview ?? { near: [], far: [] }
    const scizor = { species: 'Scizor', gender: 'F', level: 100 } as const
    const more = { ...script, preview: { ...preview, near: [...preview.near, scizor] } }
    expect(speciesOf(partyTeams(more, ASCII).parties.near)).toEqual([
      'Ferrothorn',
      'Landorus-Therian',
      'Keldeo',
      'Scizor',
    ])
  })
})

// A short Gen 5 log without Team Preview: Ann's Zoroark, nicknamed, comes in disguised as Latios,
// and Crunch ends the disguise before Ferrothorn first switches in.
const ILLUSION_LOG = [
  '|gen|5',
  '|player|p1|Ann|1|',
  '|player|p2|Bob|2|',
  '|teamsize|p1|3',
  '|teamsize|p2|1',
  '|start',
  '|switch|p1a: Latios|Latios, M|100/100',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
  '|turn|1',
  '|move|p2a: Tyranitar|Crunch|p1a: Latios',
  '|-damage|p1a: Latios|40/100',
  '|replace|p1a: Trickster|Zoroark, F, shiny',
  '|-end|p1a: Trickster|Illusion',
  '|turn|2',
  '|switch|p1a: Ferrothorn|Ferrothorn, F|100/100',
  '|turn|3',
  '',
].join('\n')

// Scene: the end of Illusion's disguise shows Zoroark for the first time; the party takes it
// there, as a switch-in, with its nickname and shininess.
describe('a member that first shows when its disguise ends', () => {
  it('keeps its nickname and its place by that line', () => {
    const { parties } = partyTeams(buildBattleScript(ILLUSION_LOG), ASCII)
    expect(speciesOf(parties.near)).toEqual(['Latios', 'Zoroark', 'Ferrothorn'])
    expect(parties.near[1]).toMatchObject({ name: 'Trickster', nicknamed: true, shiny: true })
  })
})
