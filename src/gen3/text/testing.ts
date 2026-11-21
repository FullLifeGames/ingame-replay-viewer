// Spec helpers for the phrases: one scene as a short battle log, its event and its names.
import type { ScriptEvent } from '../../script/events'
import { NEXT, scriptOf } from '../../script/testing'
import type { PokemonRef, Side } from '../../script/types'
import { type Mon, nameMon, nameTrainer } from './names'

// By kind, also where one event type carries two kinds (`sideStart | sideEnd`).
type EventOf<K extends ScriptEvent['kind']> = ScriptEvent extends infer E
  ? E extends { readonly kind: infer Kinds }
    ? K extends Kinds
      ? E
      : never
    : never
  : never

interface Scene<K extends ScriptEvent['kind']> {
  /** The first event of the kind after the intro and the leads. */
  readonly event: EventOf<K>
  /** The last event of the kind. */
  readonly last: EventOf<K>
  /** The name of a team member as text shows it. */
  readonly mon: (ref: PokemonRef) => Mon
  /** A player's name as text shows it: Alice near, Bob far. */
  readonly trainer: (side: Side) => string
}

/** Alice's Dugtrio (near) meets Bob's Tyranitar (far), then `lines`. */
export function sceneOf<K extends ScriptEvent['kind']>(kind: K, ...lines: string[]): Scene<K> {
  const script = scriptOf(...lines)
  const events = script.events.filter(
    (candidate): candidate is EventOf<K> => candidate.line >= NEXT && candidate.kind === kind,
  )
  const [event] = events
  const last = events.at(-1)
  if (event === undefined || last === undefined) throw new Error(`no ${kind} event in the scene`)
  const mon = (ref: PokemonRef) => {
    const member = script.teams[ref.side][ref.index]
    if (member === undefined) throw new Error(`no team member ${ref.side} ${String(ref.index)}`)
    return nameMon(ref.side, member).mon
  }
  const trainer = (side: Side) => {
    const player = script.events.find(
      (candidate) => candidate.kind === 'player' && candidate.side === side,
    )
    if (player?.kind !== 'player') throw new Error(`no player on the ${side} side`)
    return nameTrainer(player.name).text
  }
  return { event, last, mon, trainer }
}
