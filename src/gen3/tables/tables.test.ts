// The committed tables against the pin and against @pkmn's data. These run in CI, which has no
// checkout of the expansion; scripts/gen3-tables.test.ts regenerates the tables on the build
// machine.
import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import build from '../../../rom/gen3/build.json'
import { REPLAYS, replayScript } from '../../script/testing'
import { PLAYED_GENS } from '../backend'
import { abilityOf, constantOf, itemOf, moveOf, speciesOf, typeOf } from './lookup'
import type { Found } from './lookup'
import meta from './meta.json'
import { gens, itemGaps, names } from './testing'
import types from './types.json'

/** The generations the gate plays, so the tables follow it. */
const GENS = PLAYED_GENS

/** The species the expansion lacks, by generation: Rockruff-Dusk shows Rockruff (D11). */
const SPECIES_GAPS: Readonly<Partial<Record<number, readonly string[]>>> = { 9: ['Rockruff-Dusk'] }

const misses = (list: string[], lookup: (name: string) => Found) =>
  list.filter((name) => lookup(name).fallback !== undefined)

describe('meta.json (T4)', () => {
  it('records the commit and tag of rom/gen3/build.json', () => {
    expect(meta.commit).toBe(build.upstream.commit)
    expect(meta.tag).toBe(build.upstream.tag)
  })
})

describe('the played generations per @pkmn/data (T5)', () => {
  it.each(GENS)('maps every species, move and ability of Gen %i', (gen) => {
    const data = gens.get(gen)
    expect(misses(names(data.species), speciesOf)).toEqual(SPECIES_GAPS[gen] ?? [])
    expect(misses(names(data.moves), moveOf)).toEqual([])
    expect(misses(names(data.abilities), abilityOf)).toEqual([])
  })

  it.each(GENS)(
    'misses only the Gen 2 items no later generation kept, and Mail, in Gen %i',
    (gen) => {
      expect(misses(names(gens.get(gen).items), itemOf)).toEqual(itemGaps(gen))
    },
  )

  it('has at least one miss to compare, so the rule above is not empty', () => {
    expect(misses(names(gens.get(2).items), itemOf)).toContain('Mail')
    expect(misses(names(gens.get(2).items), itemOf).length).toBeGreaterThan(1)
  })
})

// A Tera type crosses into the game by its TYPE_* number (#89): every type of Gen 9, Stellar
// included, has its row under @pkmn's name.
describe('the types of Gen 9 (#89)', () => {
  const rows: Readonly<Record<string, readonly unknown[]>> = types

  it.each(names(Dex.forGen(9).types.all()))('%s has its TYPE_* row', (name) => {
    const [number, shown] = rows[constantOf('TYPE', name)] ?? []
    expect(shown).toBe(name)
    expect(typeOf(name)).toBe(number)
  })
})

type Kind = 'species' | 'moves' | 'abilities' | 'items'
type Named = Record<Kind, Set<string>>

// The field that carries a name, and the `kind` of an effect, to the list it belongs in.
const FIELDS: ReadonlyMap<unknown, Kind> = new Map([
  ['species', 'species'],
  ['move', 'moves'],
  ['ability', 'abilities'],
  ['item', 'items'],
])

// Every name a battle script carries: team species, the moves, items and abilities of its
// events, and the effects (`[from] item: Leftovers`) behind them.
function collect(value: unknown, into: Named): void {
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  for (const [key, item] of Object.entries(record)) {
    const kind = FIELDS.get(key)
    if (typeof item === 'string' && kind !== undefined) into[kind].add(item)
    collect(item, into)
  }
  const effect = FIELDS.get(record.kind)
  if (typeof record.name === 'string' && effect !== undefined) into[effect].add(record.name)
}

describe('the test replays (T6)', () => {
  it.each(REPLAYS.map((replay) => replay.id))('%s maps with no fallback', (id) => {
    const named: Named = {
      species: new Set(),
      moves: new Set(),
      abilities: new Set(),
      items: new Set(),
    }
    collect(replayScript(id), named)
    expect(named.species.size).toBeGreaterThan(0)
    expect(named.moves.size).toBeGreaterThan(0)
    expect(misses([...named.species], speciesOf)).toEqual([])
    expect(misses([...named.moves], moveOf)).toEqual([])
    expect(misses([...named.abilities], abilityOf)).toEqual([])
    expect(misses([...named.items], itemOf)).toEqual([])
  })
})
