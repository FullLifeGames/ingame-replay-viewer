// Folds a hit's critical hit and effectiveness lines into the hit itself (plan D1). Showdown
// logs `-supereffective`, `-crit` and then `-damage`; a target game shows the effectiveness and
// the critical hit with the HP bar, so every game backend needs them at the hit.

import type { ScriptEvent } from './events'
import type { PokemonRef } from './types'

type Modifier = Extract<ScriptEvent, { kind: 'crit' | 'effectiveness' }>
type HitEvent = Extract<ScriptEvent, { kind: 'damage' | 'effectActivate' | 'effectEnd' }>

/** Events that close the window in which a modifier waits for its hit. */
const WINDOW_ENDS: ReadonlySet<ScriptEvent['kind']> = new Set(['move', 'switchIn', 'turn'])

const SUBSTITUTE = 'Substitute'

function isModifier(event: ScriptEvent): event is Modifier {
  return event.kind === 'crit' || event.kind === 'effectiveness'
}

/** Damage from a move, a Substitute that takes a hit, or a Substitute that breaks. */
function isHit(event: ScriptEvent): event is HitEvent {
  if (event.kind === 'damage') {
    return event.cause === undefined
  }
  if (event.kind === 'effectEnd') {
    return event.effect.name === SUBSTITUTE
  }
  return (
    event.kind === 'effectActivate' && event.effect.name === SUBSTITUTE && event.damage === true
  )
}

function isSame(a: PokemonRef, b: PokemonRef): boolean {
  return a.side === b.side && a.index === b.index
}

function fold(hit: HitEvent, modifiers: readonly Modifier[]): HitEvent {
  const crit = modifiers.some((modifier) => modifier.kind === 'crit')
  const effectiveness = modifiers.find((modifier) => modifier.kind === 'effectiveness')
  return {
    ...hit,
    ...(crit ? { crit } : {}),
    ...(effectiveness ? { effectiveness: effectiveness.effectiveness } : {}),
    folded: modifiers.map(({ line }) => line),
  }
}

/**
 * Holds each modifier until a hit on the same Pokémon takes it. The events in between wait with
 * it, so the battle script stays in log order. A move, a switch or a turn, or the end of the
 * log, lets a modifier no hit took through as its own `crit` or `effectiveness` event.
 */
export class HitFolder {
  private held: ScriptEvent[] = []

  /** Takes the events of one line; returns the events whose place is settled. */
  pass(events: readonly ScriptEvent[]): ScriptEvent[] {
    return events.flatMap((event) => this.take(event))
  }

  /** Lets every held event through, the modifiers as their own events. */
  flush(): ScriptEvent[] {
    const held = this.held
    this.held = []
    return held
  }

  private take(event: ScriptEvent): ScriptEvent[] {
    if (isModifier(event)) {
      this.held.push(event)
      return []
    }
    if (this.held.length === 0) {
      return [event]
    }
    if (WINDOW_ENDS.has(event.kind)) {
      return [...this.flush(), event]
    }
    // absorb() replaces `held`, so it runs before the push picks the array.
    const settled = isHit(event) ? this.absorb(event) : event
    this.held.push(settled)
    return this.held.some(isModifier) ? [] : this.flush()
  }

  private absorb(hit: HitEvent): HitEvent {
    const mine = this.held.filter(
      (event): event is Modifier => isModifier(event) && isSame(event.who, hit.who),
    )
    if (mine.length === 0) {
      return hit
    }
    const taken = new Set<ScriptEvent>(mine)
    this.held = this.held.filter((event) => !taken.has(event))
    return fold(hit, mine)
  }
}
