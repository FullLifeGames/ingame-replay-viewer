// The rule from a client and a party slot to a mon ID (#106), from btl_main.c of the pinned
// pokebw2 checkout: each client's first mon ID (`sClientFirstMonIds`) and the count of mon IDs a
// client holds, from the search `MonIDToClientID`, which `GetClientIDFromMonID` calls as it is.
// PokeCon_CreateClientParty gives the Pokémon in party slot n the client's first ID plus n. Part of
// build/gen5/bw2.json; the errors name roles and show no number.
import type { MonIds } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, literal, stripComments } from './gen5-bw2-c.ts'

const TABLE = 'sClientFirstMonIds'
const SEARCH = 'MonIDToClientID'
const INVERSE = 'GetClientIDFromMonID'

/** The table's values, one per client; throws unless its size is a literal and it holds as many
 * plain numbers. */
function firstIds(code: string): number[] {
  const match = new RegExp(`\\b${TABLE}\\[(\\w+)\\]\\s*=\\s*\\{([^}]*)\\}`).exec(code)
  const size = match?.[1] === undefined ? undefined : literal(match[1])
  if (match === null || size === undefined) throw new Error(`no ${TABLE}[<n>] = { ... } here`)
  const values = (match[2] ?? '').split(',').filter((value) => value.trim() !== '')
  const ids = values.map(literal)
  if (ids.length !== size || ids.some((id) => id === undefined)) {
    throw new Error(`${TABLE} holds other than one plain number per client`)
  }
  return ids as number[]
}

const squash = (text: string) => stripComments(text).replace(/\s+/g, ' ').trim()

/** The function's parameter: its one `u8 <name>`. */
function parameter(code: string, name: string): string {
  const found = new RegExp(`\\b${name}\\(\\s*u8 (\\w+)\\s*\\)\\s*\\{`).exec(code)?.[1]
  if (found === undefined) throw new Error(`${name} takes no one u8 mon ID`)
  return found
}

/** The count of mon IDs per client: the search walks `clients` table entries and returns the
 * index whose `first <= id <= first + span` holds. */
function perClient(code: string, clients: number): number {
  const id = parameter(code, SEARCH)
  const body = squash(bodyOf(code, `${SEARCH}(`))
  const loop = /for \((\w+) = 0; \1 < (\w+); \1\+\+\) \{ (.*) \} return 0;$/.exec(body)
  const [, index = '', bound = '', inner = ''] = loop ?? []
  const pattern = new RegExp(
    `^(\\w+) = ${TABLE}\\[${index}\\]; (\\w+) = \\1 \\+ (\\w+); ` +
      `if \\(${id} >= \\1 && ${id} <= \\2\\) \\{ return ${index}; \\}$`,
  )
  const span = literal(pattern.exec(inner)?.[3] ?? '')
  if (literal(bound) !== clients || span === undefined) {
    throw new Error(`${SEARCH} is no search of each client's first mon ID and a span`)
  }
  return span + 1
}

/** Throws unless the inverse returns the search of its argument, and nothing else. */
function checkInverse(code: string): void {
  const id = parameter(code, INVERSE)
  if (squash(bodyOf(code, `${INVERSE}(`)) !== `return ${SEARCH}(${id});`) {
    throw new Error(`${INVERSE} is not ${SEARCH} of its argument`)
  }
}

/** Each client's first mon ID and the count per client, checked: one first ID per client, the
 * inverse plain, and no two clients' ranges meeting. */
export function monIdRule(mainC: string): MonIds {
  const code = stripComments(mainC)
  const firstByClient = firstIds(code)
  const count = perClient(code, firstByClient.length)
  checkInverse(code)
  const sorted = [...firstByClient].sort((a, b) => a - b)
  if (sorted.some((first, at) => at > 0 && first < (sorted[at - 1] ?? 0) + count)) {
    throw new Error("two clients' mon ID ranges overlap")
  }
  return { firstByClient, perClient: count }
}

/** Throws when a client's mon IDs hold fewer than a party (PARTY_SIZE). */
export function checkPartyRoom(rule: MonIds, partySize: number): void {
  if (rule.perClient < partySize) throw new Error("a client's mon IDs hold less than PARTY_SIZE")
}
