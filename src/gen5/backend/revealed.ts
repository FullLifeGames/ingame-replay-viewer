// What the battle log reveals of each team member's moves, item and ability (#106, D4 and D7):
// the backend writes them into the party, and the rest falls back to defaults (teams.ts). Only
// the event kinds named here count; every other kind leaves the sets alone. Pure.
import { toID } from '@pkmn/data'

import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { PokemonRef, Side } from '../../script/types.ts'
import type { Gen5Fallback } from './fallbacks.ts'

/** One member's moves in the order the log first shows them, and its item and ability. */
export interface RevealedSet {
  moves: string[]
  item?: string
  ability?: string
}

export interface Revealed {
  /** Each side's sets by team index. */
  sets: Record<Side, RevealedSet[]>
  /** A fallback of kind `moves` for each move past a member's first four. */
  fallbacks: Gen5Fallback[]
}

/** The moves a Pokémon holds in the game. */
const MOVE_ROOM = 4
/** The move a Pokémon uses with none left to use; it is no move of its own. */
const STRUGGLE = 'struggle'
/** The move that swaps both Pokémon's abilities; the line that shows them is a dropped line. */
const SKILL_SWAP = 'skillswap'
/** The one ability whose item line names its holder by `[of]`: the item is the line's Pokémon's. */
const FRISK = 'frisk'
/** The ability that passes itself on to the Pokémon of `[of]`, whose own ability is gone. */
const MUMMY = 'mummy'

/** A trait that changed hands before the log revealed it: no later line shows the member's own. */
const FROZEN = Symbol('frozen')
type Trait = Map<string, string | typeof FROZEN>

interface Reading {
  readonly script: Pick<BattleScript, 'teams' | 'events'>
  readonly moves: Map<string, string[]>
  readonly transformed: Set<string>
  readonly items: Trait
  readonly abilities: Trait
  readonly fallbacks: Gen5Fallback[]
}

const keyOf = (ref: PokemonRef) => `${ref.side} ${String(ref.index)}`

/** The first word on a trait wins, a value or a freeze. */
function reveal(trait: Trait, ref: PokemonRef | undefined, value: string | typeof FROZEN): void {
  if (ref !== undefined && !trait.has(keyOf(ref))) trait.set(keyOf(ref), value)
}

function addMove(reading: Reading, ref: PokemonRef, move: string, line: number): void {
  const key = keyOf(ref)
  if (reading.transformed.has(key) || toID(move) === STRUGGLE) return
  const moves = reading.moves.get(key) ?? []
  reading.moves.set(key, moves)
  if (moves.includes(move)) return
  moves.push(move)
  if (moves.length <= MOVE_ROOM) return
  const species = reading.script.teams[ref.side][ref.index]?.species ?? String(ref.index)
  const detail = `the ${ref.side} side’s ${species} uses ${move}, a move past the four the game holds`
  reading.fallbacks.push({ line, kind: 'moves', detail })
}

/**
 * The holder of an item or ability that causes a line: the Pokémon of `[of]`, which a hit's
 * line names (Iron Barbs, Rocky Helmet), else the Pokémon of the line. A heal's `[of]` names the
 * Pokémon that caused it (Water Absorb's attacker), so a heal's holder is the Pokémon healed.
 */
function holderOf(event: ScriptEvent): PokemonRef | undefined {
  const who = 'who' in event ? event.who : undefined
  if (event.kind === 'heal') return who
  return ('source' in event ? event.source : undefined) ?? who
}

/** The kinds that read the item or ability of their `[from]` themselves. */
const OWN_CAUSE: ReadonlySet<ScriptEvent['kind']> = new Set(['ability', 'item', 'itemEnd'])

/** The item and ability a line's `[from]` names. */
function readCause(reading: Reading, event: ScriptEvent): void {
  const cause = 'cause' in event ? event.cause : undefined
  if (cause === undefined || OWN_CAUSE.has(event.kind)) return
  if (cause.kind === 'ability') reveal(reading.abilities, holderOf(event), cause.name)
  if (cause.kind === 'item') reveal(reading.items, holderOf(event), cause.name)
}

/**
 * An item shown: on its own (Air Balloon) or by Frisk, whose holder `[of]` names, the line's
 * Pokémon's. Any other cause changed the item's hands (Trick, Thief, Pickup, Pickpocket), and an
 * ability that causes it is the line's Pokémon's.
 */
function readItem(reading: Reading, event: Extract<ScriptEvent, { kind: 'item' }>): void {
  const { cause, source, who } = event
  const frisk = cause?.kind === 'ability' && toID(cause.name) === FRISK
  if (cause === undefined || frisk) {
    if (frisk) reveal(reading.abilities, source, cause.name)
    reveal(reading.items, who, event.item)
    return
  }
  if (cause.kind === 'ability') reveal(reading.abilities, who, cause.name)
  reveal(reading.items, who, FROZEN)
  reveal(reading.items, source, FROZEN)
}

/** An item that ends was the line's Pokémon's. The ability that ends it (Pickpocket) is the
 * thief's, whom the line does not name: the thief's own `item` line reads it. */
function readItemEnd(reading: Reading, event: Extract<ScriptEvent, { kind: 'itemEnd' }>): void {
  reveal(reading.items, event.who, event.item)
}

/**
 * An ability on its holder's own line: `-activate` and `-start` name the holder (Flash Fire,
 * Mummy), `-block` names it by `[of]` when it shields another Pokémon, else as the line's
 * Pokémon (Sticky Hold). Mummy also replaces the ability of the Pokémon of `[of]`.
 */
function readOwnAbility(
  reading: Reading,
  event: Extract<ScriptEvent, { kind: 'effectActivate' | 'effectStart' | 'block' }>,
): void {
  if (event.effect.kind !== 'ability') return
  const holder = event.kind === 'block' ? holderOf(event) : event.who
  reveal(reading.abilities, holder, event.effect.name)
  if (toID(event.effect.name) === MUMMY) reveal(reading.abilities, event.source, FROZEN)
}

/** An ability shown: on its own, the Pokémon's; by Trace, Trace is the Pokémon's and the ability
 * its target's; by a move (Role Play, Entrainment), both changed. */
function readAbility(reading: Reading, event: Extract<ScriptEvent, { kind: 'ability' }>): void {
  const { cause, source, who } = event
  if (cause === undefined) {
    reveal(reading.abilities, who, event.ability)
  } else if (cause.kind === 'ability') {
    reveal(reading.abilities, who, cause.name)
    reveal(reading.abilities, source, event.ability)
  } else {
    reveal(reading.abilities, who, FROZEN)
    reveal(reading.abilities, source, FROZEN)
  }
}

function readMove(reading: Reading, event: Extract<ScriptEvent, { kind: 'move' }>): void {
  if (toID(event.move) === SKILL_SWAP) {
    reveal(reading.abilities, event.user, FROZEN)
    reveal(reading.abilities, event.target, FROZEN)
  }
  if (event.calledBy === undefined) addMove(reading, event.user, event.move, event.line)
}

type Readers = {
  readonly [K in ScriptEvent['kind']]?: (
    reading: Reading,
    event: Extract<ScriptEvent, { kind: K }>,
  ) => void
}

/** The kinds that reveal a move, an item or an ability, or that start or end a transformed copy. */
const READERS: Readers = {
  move: readMove,
  cant: (reading, event) => {
    if (event.move !== undefined) addMove(reading, event.who, event.move, event.line)
  },
  transform: (reading, event) => reading.transformed.add(keyOf(event.who)),
  switchIn: (reading, event) => reading.transformed.delete(keyOf(event.who)),
  item: readItem,
  itemEnd: readItemEnd,
  ability: readAbility,
  effectActivate: (reading, event) => {
    if (event.effect.kind === 'item') reveal(reading.items, event.who, event.effect.name)
    readOwnAbility(reading, event)
  },
  effectStart: readOwnAbility,
  block: readOwnAbility,
}

function readEvent(reading: Reading, event: ScriptEvent): void {
  readCause(reading, event)
  const read = READERS[event.kind] as ((reading: Reading, event: ScriptEvent) => void) | undefined
  read?.(reading, event)
}

function setOf(reading: Reading, ref: PokemonRef): RevealedSet {
  const key = keyOf(ref)
  const item = reading.items.get(key)
  const ability = reading.abilities.get(key)
  return {
    moves: (reading.moves.get(key) ?? []).slice(0, MOVE_ROOM),
    ...(typeof item === 'string' ? { item } : {}),
    ...(typeof ability === 'string' ? { ability } : {}),
  }
}

/** Each team member's moves, item and ability as the script's events reveal them. */
export function revealedSets(script: Pick<BattleScript, 'teams' | 'events'>): Revealed {
  const reading: Reading = {
    script,
    moves: new Map(),
    transformed: new Set(),
    items: new Map(),
    abilities: new Map(),
    fallbacks: [],
  }
  for (const event of script.events) readEvent(reading, event)
  const side = (of: Side) => script.teams[of].map((_, index) => setOf(reading, { side: of, index }))
  return { sets: { near: side('near'), far: side('far') }, fallbacks: reading.fallbacks }
}
