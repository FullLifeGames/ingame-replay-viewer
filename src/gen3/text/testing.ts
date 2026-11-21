// Spec helpers for the phrases: one scene as a short battle log, its event and its names.
import type { ScriptEvent } from '../../script/events'
import { NEXT, scriptOf } from '../../script/testing'
import type { PokemonRef } from '../../script/types'
import { type Mon, nameMon } from './names'

type EventOf<K extends ScriptEvent['kind']> = Extract<ScriptEvent, { kind: K }>

interface Scene<K extends ScriptEvent['kind']> {
  /** The first event of the kind after the intro and the leads. */
  readonly event: EventOf<K>
  /** The name of a team member as text shows it. */
  readonly mon: (ref: PokemonRef) => Mon
}

/** Alice's Dugtrio (near) meets Bob's Tyranitar (far), then `lines`. */
export function sceneOf<K extends ScriptEvent['kind']>(kind: K, ...lines: string[]): Scene<K> {
  const script = scriptOf(...lines)
  const event = script.events.find(
    (candidate): candidate is EventOf<K> => candidate.line >= NEXT && candidate.kind === kind,
  )
  if (event === undefined) throw new Error(`no ${kind} event in the scene`)
  const mon = (ref: PokemonRef) => {
    const member = script.teams[ref.side][ref.index]
    if (member === undefined) throw new Error(`no team member ${ref.side} ${String(ref.index)}`)
    return nameMon(ref.side, member).mon
  }
  return { event, mon }
}
