import { describe, expect, it } from 'vitest'

import { lineNumber } from '../lines'
import { eventsAt, eventsFrom, NEXT, refIn, replayScript, scriptOf } from '../testing'

// Built once, outside the specs' time limit.
const REPLAY_994052 = replayScript('smogtours-gen3ou-994052')
const REPLAY_994086 = replayScript('smogtours-gen3ou-994086')
const REPLAY_994128 = replayScript('smogtours-gen3ou-994128')
const REPLAY_994141 = replayScript('smogtours-gen3ou-994141')

const DUGTRIO = { side: 'near', index: 0 } as const
const TYRANITAR = { side: 'far', index: 0 } as const
const PAIN_SPLIT = { name: 'Pain Split', kind: 'move' }

describe('the HP rules', () => {
  it('gives Leech Seed damage its cause and source, then a silent heal', () => {
    const script = REPLAY_994086
    const seeder = refIn(script, 'far', 'Beanstalk Park')

    expect(eventsFrom(script, 327).slice(0, 2)).toEqual([
      {
        kind: 'damage',
        line: 327,
        who: refIn(script, 'near', 'Blissey'),
        hp: { hp: 88, max: 100 },
        cause: { name: 'Leech Seed' },
        source: seeder,
      },
      { kind: 'heal', line: 328, who: seeder, hp: { hp: 48, max: 100 }, silent: true },
    ])
  })

  it('keeps the wisher of a Wish', () => {
    const script = REPLAY_994141
    const vaporeon = refIn(script, 'far', 'Vaporeon')

    expect(eventsAt(script, 516)).toEqual([
      {
        kind: 'heal',
        line: 516,
        who: vaporeon,
        hp: { hp: 100, max: 100 },
        status: 'par',
        cause: { name: 'Wish', kind: 'move' },
        wisher: vaporeon,
      },
    ])
  })

  it('refuses a wisher who never appeared', () => {
    expect(() => scriptOf('|-heal|p1a: Dugtrio|100/100|[from] move: Wish|[wisher] Mew')).toThrow(
      new RegExp(`^line ${String(lineNumber(NEXT))}: .*Mew`),
    )
  })

  it('keeps the status a hit leaves on the HP bar', () => {
    const script = scriptOf('|-damage|p1a: Dugtrio|54/100 par')

    expect(eventsAt(script, NEXT)).toEqual([
      { kind: 'damage', line: NEXT, who: DUGTRIO, hp: { hp: 54, max: 100 }, status: 'par' },
    ])
  })

  it('reads the damage of a partial trap, whose cause names the trapping move', () => {
    const script = scriptOf('|-damage|p1a: Dugtrio|50/100|[from] move: Wrap|[partiallytrapped]')

    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'damage',
        line: NEXT,
        who: DUGTRIO,
        hp: { hp: 50, max: 100 },
        cause: { name: 'Wrap', kind: 'move' },
      },
    ])
    expect(script.dropped.filter((drop) => drop.line >= NEXT)).toEqual([])
  })

  // Showdown's Pain Split (`@pkmn/sim` `data/moves.js`, `painsplit.onHit`) sets the target's HP on a
  // silent line, then the user's on the line that says it.
  it("sets each Pokémon's HP outright for Pain Split, the target's line silent", () => {
    const script = scriptOf(
      '|move|p1a: Dugtrio|Pain Split|p2a: Tyranitar',
      '|-sethp|p2a: Tyranitar|60/100|[from] move: Pain Split|[silent]',
      '|-sethp|p1a: Dugtrio|60/100|[from] move: Pain Split',
    )

    expect(script.dropped.filter((drop) => drop.line >= NEXT)).toEqual([])
    expect(eventsFrom(script, NEXT + 1)).toEqual([
      {
        kind: 'setHp',
        line: NEXT + 1,
        who: TYRANITAR,
        hp: { hp: 60, max: 100 },
        cause: PAIN_SPLIT,
        silent: true,
      },
      { kind: 'setHp', line: NEXT + 2, who: DUGTRIO, hp: { hp: 60, max: 100 }, cause: PAIN_SPLIT },
    ])
  })

  // `@pkmn/protocol` also types the older line that names both Pokémon with their HP.
  it('reads the older Pain Split line that names both Pokémon as two HP changes', () => {
    const script = scriptOf('|-sethp|p2a: Tyranitar|60|p1a: Dugtrio|60|[from] move: Pain Split')

    expect(script.dropped.filter((drop) => drop.line >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'setHp',
        line: NEXT,
        who: TYRANITAR,
        hp: { hp: 60, max: 100 },
        cause: PAIN_SPLIT,
        silent: true,
      },
      { kind: 'setHp', line: NEXT, who: DUGTRIO, hp: { hp: 60, max: 100 }, cause: PAIN_SPLIT },
    ])
  })
})

describe('the status rules', () => {
  it('gives Rest as the cause of sleep, then fills the bar silently', () => {
    const script = REPLAY_994052
    const suicune = refIn(script, 'near', 'Suicune')

    expect(eventsFrom(script, 210).slice(0, 2)).toEqual([
      {
        kind: 'status',
        line: 210,
        who: suicune,
        status: 'slp',
        cause: { name: 'Rest', kind: 'move' },
      },
      {
        kind: 'heal',
        line: 211,
        who: suicune,
        hp: { hp: 100, max: 100 },
        status: 'slp',
        silent: true,
      },
    ])
  })

  it('cures Natural Cure silently before the switch', () => {
    const script = REPLAY_994052

    expect(eventsFrom(script, 326).slice(0, 2)).toMatchObject([
      {
        kind: 'cureStatus',
        line: 326,
        who: refIn(script, 'near', 'Blissey'),
        status: 'par',
        cause: { name: 'Natural Cure', kind: 'ability' },
        silent: true,
      },
      { kind: 'switchIn', line: 327 },
    ])
  })

  it("marks a cure that shows the status's own message", () => {
    const script = REPLAY_994128

    expect(eventsAt(script, 67)).toEqual([
      {
        kind: 'cureStatus',
        line: 67,
        who: refIn(script, 'near', 'Kingdra'),
        status: 'brn',
        msg: true,
      },
    ])
  })

  it('cures the team with Aromatherapy', () => {
    const script = REPLAY_994052

    expect(eventsAt(script, 290)).toEqual([
      {
        kind: 'cureTeam',
        line: 290,
        who: refIn(script, 'near', 'Blissey'),
        cause: { name: 'Aromatherapy', kind: 'move' },
      },
    ])
  })
})

describe('the stat change rules', () => {
  it('counts a raise as positive stages', () => {
    const script = REPLAY_994052

    expect(eventsAt(script, 127)).toEqual([
      {
        kind: 'statChange',
        line: 127,
        who: refIn(script, 'far', 'Metagross'),
        stat: 'spe',
        stages: 2,
      },
    ])
  })

  it('counts a drop as negative stages', () => {
    const script = REPLAY_994128

    expect(eventsAt(script, 28)).toEqual([
      {
        kind: 'statChange',
        line: 28,
        who: refIn(script, 'far', 'Tyranitar'),
        stat: 'atk',
        stages: -1,
      },
    ])
  })

  // Showdown logs a stat at its limit as a change of 0: `|-boost|p2a: Jirachi|spa|0` after Calm Mind
  // at +6 (ladder replay gen3ou-2717395946), `|-unboost|p1a: Swampert|atk|0` after Charm at -6
  // (gen3ou-2717081342).
  it('keeps the direction of a raise at its limit', () => {
    expect(eventsAt(scriptOf('|-boost|p1a: Dugtrio|spa|0'), NEXT)).toEqual([
      { kind: 'statLimit', line: NEXT, who: DUGTRIO, stat: 'spa', direction: 'up' },
    ])
  })

  it('keeps the direction of a drop at its limit', () => {
    expect(eventsAt(scriptOf('|-unboost|p1a: Dugtrio|atk|0'), NEXT)).toEqual([
      { kind: 'statLimit', line: NEXT, who: DUGTRIO, stat: 'atk', direction: 'down' },
    ])
  })

  it('keeps the cause of a stat change', () => {
    const script = scriptOf('|-boost|p1a: Dugtrio|atk|1|[from] item: Liechi Berry')

    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'statChange',
        line: NEXT,
        who: DUGTRIO,
        stat: 'atk',
        stages: 1,
        cause: { name: 'Liechi Berry', kind: 'item' },
      },
    ])
  })

  // Showdown's White Herb (`@pkmn/sim` `data/items.js`, `whiteherb.onUse`) ends the item, then
  // resets the lowered stages on a silent line.
  it('raises each lowered stat back to 0 for White Herb and leaves a raised one', () => {
    const script = scriptOf(
      '|-unboost|p1a: Dugtrio|atk|2',
      '|-boost|p1a: Dugtrio|spe|1',
      '|-unboost|p1a: Dugtrio|def|1',
      '|-enditem|p1a: Dugtrio|White Herb',
      '|-clearnegativeboost|p1a: Dugtrio|[silent]',
    )

    expect(script.dropped.filter((drop) => drop.line >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT + 4)).toEqual([
      {
        kind: 'negativeStatReset',
        line: NEXT + 4,
        who: DUGTRIO,
        restored: { atk: 2, def: 1 },
        silent: true,
      },
    ])
  })
})

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
