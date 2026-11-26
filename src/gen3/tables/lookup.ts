// The expansion's numbers and display names for @pkmn's species, moves, abilities and items
// (plan §4). The tables come from the pinned sources through `npm run gen3:tables`; the name rule
// that turns a @pkmn name into the expansion's constant lives here and nowhere else.
import { Dex } from '@pkmn/dex'

import { Gen3Error } from '../errors'
import abilities from './abilities.json'
import { genericMove } from './generic'
import items from './items.json'
import moves from './moves.json'
import species from './species.json'

export type Prefix = 'SPECIES' | 'MOVE' | 'ABILITY' | 'ITEM'

/**
 * The expansion's constant for a @pkmn name: `Farfetch’d` is `SPECIES_FARFETCHD`, `Type: Null`
 * is `SPECIES_TYPE_NULL`. Diacritics go, `' ’ . : %` go, other runs of signs become `_`.
 */
export function constantOf(prefix: Prefix, name: string): string {
  const word = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’.:%]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()
  return `${prefix}_${word}`
}

interface Row {
  readonly number: number
  /** The expansion's display name; null where the generator found none. */
  readonly name: string | null
}

export type Table = ReadonlyMap<string, Row>

/** A table file's rows `CONSTANT: [number, display name]`, checked once at load. */
export function readTable(file: string, json: Readonly<Record<string, readonly unknown[]>>): Table {
  const table = new Map<string, Row>()
  for (const [constant, [number, name]] of Object.entries(json)) {
    if (typeof number !== 'number' || (typeof name !== 'string' && name !== null)) {
      throw new Gen3Error(`${file}.json: ${constant} is not [number, name]`)
    }
    table.set(constant, { number, name })
  }
  return table
}

const TABLES: Readonly<Record<Prefix, Table>> = {
  SPECIES: readTable('species', species),
  MOVE: readTable('moves', moves),
  ABILITY: readTable('abilities', abilities),
  ITEM: readTable('items', items),
}

type FallbackKind = 'form' | 'move' | 'ability' | 'item'

/** What the game shows instead of a name the expansion lacks; the backend adds the line. */
interface TableFallback {
  readonly kind: FallbackKind
  readonly detail: string
}

export interface Found {
  readonly number: number
  /** The name for text: the expansion's display name where it has one. */
  readonly name: string
  readonly fallback?: TableFallback
}

function rowOf(prefix: Prefix, name: string): Found | undefined {
  const row = TABLES[prefix].get(constantOf(prefix, name))
  return row === undefined ? undefined : { number: row.number, name: row.name ?? name }
}

const missing = (prefix: Prefix, name: string) =>
  `${name} has no ${constantOf(prefix, name)} in the expansion`

export function speciesOf(name: string): Found {
  const known = Dex.species.get(name)
  if (!known.exists) throw new Gen3Error(`unknown species "${name}"`)
  const own = rowOf('SPECIES', known.name)
  if (own !== undefined) return own
  const base = rowOf('SPECIES', known.baseSpecies)
  if (base === undefined) {
    throw new Gen3Error(
      `${known.name} has no ${constantOf('SPECIES', known.name)} and no base species in the expansion`,
    )
  }
  const detail = `${missing('SPECIES', known.name)}; it shows ${base.name}`
  return { ...base, fallback: { kind: 'form', detail } }
}

// Every Hidden Power type is one move in the expansion: `Hidden Power Fire` has the id
// `hiddenpower`, and that id names `Hidden Power`.
export function moveOf(name: string): Found {
  const known = Dex.moves.get(name)
  if (!known.exists) throw new Gen3Error(`unknown move "${name}"`)
  const real = Dex.moves.get(known.id).name
  const own = rowOf('MOVE', real)
  if (own !== undefined) return own
  const generic = genericMove(known.type, known.category, (other) => rowOf('MOVE', other)?.number)
  const first = `the first ${known.type} ${known.category} move`
  const detail = `${missing('MOVE', real)}; it plays ${generic.name}, ${first}`
  return { number: generic.number, name: real, fallback: { kind: 'move', detail } }
}

// An ability or item without a constant is text alone: number 0 is ABILITY_NONE or ITEM_NONE.
function textOnly(prefix: Prefix, name: string, kind: FallbackKind, shows: string): Found {
  const own = rowOf(prefix, name)
  if (own !== undefined) return own
  return { number: 0, name, fallback: { kind, detail: `${missing(prefix, name)}; ${shows}` } }
}

/** Whether `constant` holds the words of `form` as whole parts: TEAL in `…_TEAL_MASK`. */
const holdsForm = (constant: string, form: string) =>
  `${constant}_`.includes(`${constantOf('ABILITY', form).slice('ABILITY'.length)}_`)

/**
 * The ability whose display name is `name` without its parentheses, for the forms the expansion
 * keeps as constants of their own under one name: `Embody Aspect (Teal)` is
 * `ABILITY_EMBODY_ASPECT_TEAL_MASK`, and the log's bare `As One` is one of `ABILITY_AS_ONE_*`. The
 * words in parentheses pick the constant that holds them; where none does, the lower number.
 */
function sharedName(name: string): Found | undefined {
  const [, shown = name, form] = /^(.+?) \((.+)\)$/.exec(name) ?? []
  const rows = [...TABLES.ABILITY].filter(([, row]) => row.name === shown)
  const formed = rows.filter(([constant]) => form !== undefined && holdsForm(constant, form))
  const numbers = (formed.length > 0 ? formed : rows).map(([, row]) => row.number)
  const [lowest] = numbers.toSorted((a, b) => a - b)
  return lowest === undefined ? undefined : { number: lowest, name: shown }
}

export function abilityOf(name: string): Found {
  const known = Dex.abilities.get(name)
  const real = known.exists ? known.name : name
  const shows = 'text without a pop-up'
  return rowOf('ABILITY', real) ?? sharedName(real) ?? textOnly('ABILITY', real, 'ability', shows)
}

export function itemOf(name: string): Found {
  const known = Dex.items.get(name)
  return textOnly('ITEM', known.exists ? known.name : name, 'item', 'text only')
}
