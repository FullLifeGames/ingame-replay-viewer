// The switches scene of the moment script (#108, lane plan D10): three turns written by hand
// after the start of the test replay gen5ou-2718717830, whose leads are Politoed on the near side
// and Darmanitan on the far one. Turn 1: Politoed's Scald hits Darmanitan, so the action menu's
// first move is one the log names, and Darmanitan's Roar drags Ferrothorn in. Turn 2: Darmanitan
// switches to Blissey, then Ferrothorn to Keldeo. Turn 3: Keldeo's Secret Sword knocks Blissey
// out, and Volcarona comes in after the turn's end. The blocks: the hit, Roar, the drag, the far
// switch, the near switch, the faint and the send-in.

/** The hand turns, in the order Showdown writes their lines. */
export const SWITCHES_TURNS: readonly string[] = [
  '|turn|1',
  '|move|p1a: Politoed|Scald|p2a: Darmanitan',
  '|-supereffective|p2a: Darmanitan',
  '|-damage|p2a: Darmanitan|40/100',
  '|move|p2a: Darmanitan|Roar|p1a: Politoed',
  '|drag|p1a: Ferrothorn|Ferrothorn, F|100/100',
  '|',
  '|upkeep',
  '|turn|2',
  '|switch|p2a: Blissey|Blissey, F|100/100',
  '|switch|p1a: Keldeo|Keldeo|100/100',
  '|',
  '|upkeep',
  '|turn|3',
  '|move|p1a: Keldeo|Secret Sword|p2a: Blissey',
  '|-supereffective|p2a: Blissey',
  '|-damage|p2a: Blissey|0 fnt',
  '|faint|p2a: Blissey',
  '|',
  '|upkeep',
  '|switch|p2a: Volcarona|Volcarona, M|100/100',
]
