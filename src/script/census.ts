// The named list: the line kinds of @pkmn/protocol that the battle script neither shows nor drops
// by kind, each with its group and its reason. Only specs read it: the kind census
// (`census.test.ts`) finds every kind a rule, a drop reason or a place here.

import type { Protocol } from '@pkmn/protocol'

/**
 * Why a kind is on the named list: a server never writes it into a battle room's log, only
 * formats the build or the backend refuses log it, or a Gen 1 to 3 singles battle can log it
 * and no rule shows it yet.
 */
type NamedGroup = 'not in a replay log' | 'refused format' | 'no rule yet'

interface NamedKind {
  readonly group: NamedGroup
  readonly reason: string
}

const OUTSIDE: NamedKind = {
  group: 'not in a replay log',
  reason: "a server sends it to one client, outside a battle room's log",
}

/** A kind that only Gen 4 and later log; the backend refuses those battles. */
const newer = (what: string): NamedKind => ({
  group: 'refused format',
  reason: `${what}: only Gen 4 and later log it, and the backend refuses those battles`,
})

/** A kind that only doubles and triples log; the build refuses those battles. */
const notSingles = (what: string): NamedKind => ({
  group: 'refused format',
  reason: `${what}: only doubles and triples log it, and the build refuses those battles`,
})

const noRule = (what: string): NamedKind => ({ group: 'no rule yet', reason: what })

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

  // Refused formats.
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
  '|swap|': notSingles('a Pokémon moving to another position'),
  '|-center|': notSingles('the last Pokémon of a triple battle moving to the centre'),
  '|-combine|': notSingles('two moves combined'),
  '|-waiting|': notSingles('a move waiting for an ally to combine with'),

  // No rule yet: Gen 1 to 3 singles battles can log these.
  '|clearpoke|': noRule('the start of Team Preview, which a format can add as a rule'),
  '|poke|': noRule('a Pokémon declared for Team Preview, which a format can add as a rule'),
  '|teampreview|': noRule('the end of Team Preview, which a format can add as a rule'),
  '|updatepoke|': noRule("a Pokémon's details revealed after Team Preview"),
  '|message|': noRule('a message from the server in the battle (`|-message|` has a rule)'),
  '|custom|': noRule("a format's own line for its client; no rule reads it"),
  '|-formechange|': noRule('a forme change that ends when the Pokémon leaves'),
  '|-notarget|': noRule('a move that fails for want of a target'),
  '|-sethp|': noRule("a Pokémon's HP set outright, as when two Pokémon share their HP"),
  '|-copyboost|': noRule("one Pokémon's stat stages copied to another"),
  '|-clearnegativeboost|': noRule("one Pokémon's lowered stat stages reset"),
  '|-transform|': noRule('a Pokémon transforming into another'),
  '|-prepare|': noRule('the charging turn of a two-turn move'),
  '|-singlemove|': noRule("a move whose effect lasts until the user's next move"),
  '|-anim|': noRule("a move's animation without the move's effects"),
  '|-ohko|': noRule('a one-hit knockout'),
}
