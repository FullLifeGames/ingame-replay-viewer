// The effects scene of the moment script (#109, lane plan 109-6): six turns written by hand
// after the start of the test replay smogtours-gen5ou-862240, whose leads are Breloom on the
// near side and Landorus on the far one; the game plays the lead's Intimidate itself. Turn 1:
// Landorus sets Stealth Rock on the near side, Breloom makes a Substitute (the doll and its line),
// and Breloom's Toxic Orb poisons it at the turn's end (the icon). Turn 2: Landorus's Earthquake
// breaks the doll (its hit and its fading), and Poison Heal heals Breloom. Turn 3: Starmie comes in
// for Landorus, then Tyranitar for Breloom, with Stealth Rock's hit, Sand Stream's pop-up and the
// sandstorm's start; the sand buffets Starmie. Turn 4: Starmie's Scald burns Tyranitar (the icon),
// Tyranitar's Crunch hits Starmie, then the sand, Tyranitar's Leftovers and the burn's damage.
// Turn 5: Landorus comes in for Tyranitar with Stealth Rock's hit, Intimidate's pop-up and
// Starmie's Attack drop, and the sand. Turn 6: Tyranitar comes back with its burn icon and takes
// Stealth Rock's hit. Every line plays through the backend as buildGen5Replay writes it.

/** The hand turns, in the order Showdown writes their lines. */
export const EFFECTS_TURNS: readonly string[] = [
  '|turn|1',
  '|move|p2a: Landorus|Stealth Rock|p1a: Breloom',
  '|-sidestart|p1: tizio potente ao|move: Stealth Rock',
  '|move|p1a: Breloom|Substitute|p1a: Breloom',
  '|-start|p1a: Breloom|Substitute',
  '|-damage|p1a: Breloom|75/100',
  '|',
  '|-status|p1a: Breloom|tox|[from] item: Toxic Orb',
  '|upkeep',
  '|turn|2',
  '|move|p2a: Landorus|Earthquake|p1a: Breloom',
  '|-resisted|p1a: Breloom',
  '|-end|p1a: Breloom|Substitute',
  '|',
  '|-heal|p1a: Breloom|88/100 tox|[from] ability: Poison Heal',
  '|upkeep',
  '|turn|3',
  '|switch|p2a: Starmie|Starmie|100/100',
  '|switch|p1a: Tyranitar|Tyranitar, F|100/100',
  '|-damage|p1a: Tyranitar|94/100|[from] Stealth Rock',
  '|-weather|Sandstorm|[from] ability: Sand Stream|[of] p1a: Tyranitar',
  '|',
  '|-weather|Sandstorm|[upkeep]',
  '|-damage|p2a: Starmie|94/100|[from] Sandstorm',
  '|upkeep',
  '|turn|4',
  '|move|p2a: Starmie|Scald|p1a: Tyranitar',
  '|-supereffective|p1a: Tyranitar',
  '|-damage|p1a: Tyranitar|52/100',
  '|-status|p1a: Tyranitar|brn',
  '|move|p1a: Tyranitar|Crunch|p2a: Starmie',
  '|-supereffective|p2a: Starmie',
  '|-damage|p2a: Starmie|40/100',
  '|',
  '|-weather|Sandstorm|[upkeep]',
  '|-damage|p2a: Starmie|34/100|[from] Sandstorm',
  '|-heal|p1a: Tyranitar|58/100 brn|[from] item: Leftovers',
  '|-damage|p1a: Tyranitar|46/100 brn|[from] brn',
  '|upkeep',
  '|turn|5',
  '|switch|p1a: Landorus|Landorus-Therian, M|100/100',
  '|-damage|p1a: Landorus|88/100|[from] Stealth Rock',
  '|-ability|p1a: Landorus|Intimidate|boost',
  '|-unboost|p2a: Starmie|atk|1',
  '|',
  '|-weather|Sandstorm|[upkeep]',
  '|-damage|p2a: Starmie|28/100|[from] Sandstorm',
  '|upkeep',
  '|turn|6',
  '|switch|p1a: Tyranitar|Tyranitar, F|46/100 brn',
  '|-damage|p1a: Tyranitar|40/100 brn|[from] Stealth Rock',
]
