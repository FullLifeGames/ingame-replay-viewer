// The named list: the line kinds of @pkmn/protocol that the battle script neither shows nor drops
// by kind, each with its group and its reason. The build gives a line of such a kind its reason
// (`noRuleReason`); the kind census (`census.test.ts`) finds every kind a rule, a drop reason or
// a place here.

import type { Protocol } from '@pkmn/protocol'

/**
 * Why a kind is on the named list: a server never writes it into a battle room's log, only
 * formats the build refuses log it, or only Gen 4 and later log it and no rule shows it yet.
 */
type NamedGroup = 'not in a replay log' | 'refused format' | 'newer generation'

interface NamedKind {
  readonly group: NamedGroup
  readonly reason: string
}

const OUTSIDE: NamedKind = {
  group: 'not in a replay log',
  reason: "a server sends it to one client, outside a battle room's log",
}

/** A kind that only Gen 4 and later log; no rule shows it yet (#86). */
const newer = (what: string): NamedKind => ({
  group: 'newer generation',
  reason: `${what}: only Gen 4 and later log it, and no rule shows it yet`,
})

/** A kind that only doubles and triples log; the build refuses those battles. */
const notSingles = (what: string): NamedKind => ({
  group: 'refused format',
  reason: `${what}: only doubles and triples log it, and the build refuses those battles`,
})

/** The kinds on the named list. */
export const NAMED_KINDS: Readonly<Partial<Record<Protocol.ArgName, NamedKind>>> = {
  // Not in a replay log.
  '|init|': OUTSIDE,
  '|title|': OUTSIDE,
  '|users|': OUTSIDE,
  '|deinit|': OUTSIDE,
  '|noinit|': OUTSIDE,
  '|expire|': OUTSIDE,
  '|battle|': OUTSIDE,
  '|popup|': OUTSIDE,
  '|pm|': OUTSIDE,
  '|usercount|': OUTSIDE,
  '|nametaken|': OUTSIDE,
  '|challstr|': OUTSIDE,
  '|updateuser|': OUTSIDE,
  '|customgroups|': OUTSIDE,
  '|formats|': OUTSIDE,
  '|updatesearch|': OUTSIDE,
  '|updatechallenges|': OUTSIDE,
  '|queryresponse|': OUTSIDE,
  '|askreg|': OUTSIDE,
  '|pagehtml|': OUTSIDE,
  '|selectorhtml|': OUTSIDE,
  '|controlshtml|': OUTSIDE,
  '|fieldhtml|': OUTSIDE,
  '|refresh|': OUTSIDE,
  '|tempnotify|': OUTSIDE,
  '|tempnotifyoff|': OUTSIDE,
  '|request|': OUTSIDE,
  '|sentchoice|': OUTSIDE,
  '|tournament|create|': OUTSIDE,
  '|tournament|update|': OUTSIDE,
  '|tournament|updateEnd|': OUTSIDE,
  '|tournament|error|': OUTSIDE,
  '|tournament|forceend|': OUTSIDE,
  '|tournament|join|': OUTSIDE,
  '|tournament|leave|': OUTSIDE,
  '|tournament|replace|': OUTSIDE,
  '|tournament|start|': OUTSIDE,
  '|tournament|disqualify|': OUTSIDE,
  '|tournament|battlestart|': OUTSIDE,
  '|tournament|battleend|': OUTSIDE,
  '|tournament|end|': OUTSIDE,
  '|tournament|scouting|': OUTSIDE,
  '|tournament|autostart|': OUTSIDE,
  '|tournament|autodq|': OUTSIDE,

  // Newer generations.
  '|detailschange|': newer('a permanent forme change'),
  '|replace|': newer('the end of a disguise as another team member'),
  '|-swapboost|': newer('stat stages swapped between two Pokémon'),
  '|-invertboost|': newer('stat stages inverted'),
  '|-clearboost|': newer("one Pokémon's stat stages cleared by a move"),
  '|-clearpositiveboost|': newer('raised stat stages taken away'),
  '|-fieldstart|': newer('a field condition starting'),
  '|-fieldend|': newer('a field condition ending'),
  '|-swapsideconditions|': newer('side conditions swapped between the sides'),
  '|-endability|': newer('an ability suppressed'),
  '|-mega|': newer('Mega Evolution'),
  '|-primal|': newer('Primal Reversion'),
  '|-burst|': newer('Ultra Burst'),
  '|-zpower|': newer('a Z-Move'),
  '|-zbroken|': newer('a Z-Move breaking through protection'),
  '|-candynamax|': newer('Dynamax becoming available'),
  '|-terastallize|': newer('Terastallization'),

  // Refused formats.
  '|swap|': notSingles('a Pokémon moving to another position'),
  '|-center|': notSingles('the last Pokémon of a triple battle moving to the centre'),
  '|-combine|': notSingles('two moves combined'),
  '|-waiting|': notSingles('a move waiting for an ally to combine with'),
}

/**
 * Why the build drops a line of `kind`, which has no rule: the named list's reason, or "no rule
 * for" the kind when the list lacks it, as for a kind newer than the census.
 */
export const noRuleReason = (kind: Protocol.ArgName): string =>
  NAMED_KINDS[kind]?.reason ?? `no rule for ${kind}`
