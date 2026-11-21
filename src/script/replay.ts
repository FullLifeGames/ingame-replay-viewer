// A replay as Showdown saves it (`replay.pokemonshowdown.com/<id>.json`). Only the fields the
// viewer reads are kept; the battle script starts from `log`.

export interface Replay {
  readonly id: string
  readonly format: string
  readonly formatid: string
  readonly players: readonly string[]
  readonly log: string
}

/** The replay JSON lacks a field the viewer reads, or holds it with the wrong type. */
export class ReplayError extends Error {
  override name = 'ReplayError'
}

type Json = Record<string, unknown>

function isObject(json: unknown): json is Json {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

function isString(value: unknown): boolean {
  return typeof value === 'string'
}

function isNameList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isString)
}

const FIELD_CHECKS: Record<keyof Replay, (value: unknown) => boolean> = {
  id: isString,
  format: isString,
  formatid: isString,
  players: isNameList,
  log: isString,
}

function wrongFields(json: Json): string[] {
  return Object.entries(FIELD_CHECKS)
    .filter(([key, check]) => !check(json[key]))
    .map(([key]) => key)
}

function isReplay(json: Json): json is Json & Replay {
  return wrongFields(json).length === 0
}

/** Checks a parsed replay JSON and keeps the fields the viewer reads. */
export function readReplay(json: unknown): Replay {
  if (!isObject(json)) {
    throw new ReplayError('replay JSON is not an object')
  }
  if (!isReplay(json)) {
    const names = wrongFields(json).map((key) => `"${key}"`)
    throw new ReplayError(`replay JSON lacks ${names.join(', ')} or holds the wrong type there`)
  }
  const { id, format, formatid, players, log } = json
  return { id, format, formatid, players, log }
}
