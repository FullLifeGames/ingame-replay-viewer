// The hits scene of the moment script (#107, lane plan D14): a turn written by hand for the leads
// of the test replay gen5ou-2718717830, Politoed on the near side and Darmanitan on the far one.
// Darmanitan's Grass Knot hits Politoed super effectively and critically, Politoed's Focus Blast
// misses, and Politoed's Leftovers heal it at the turn's end. The log keeps the test replay's
// lines before its first turn, so the parties, the names and their fallbacks stay the replay's,
// and the hand turn reveals Politoed's Leftovers.

/** The hand turn, in the order Showdown writes its lines. */
export const HITS_TURN: readonly string[] = [
  '|turn|1',
  '|move|p2a: Darmanitan|Grass Knot|p1a: Politoed',
  '|-supereffective|p1a: Politoed',
  '|-crit|p1a: Politoed',
  '|-damage|p1a: Politoed|38/100',
  '|move|p1a: Politoed|Focus Blast|p2a: Darmanitan|[miss]',
  '|-miss|p1a: Politoed|p2a: Darmanitan',
  '|',
  '|-heal|p1a: Politoed|44/100|[from] item: Leftovers',
  '|upkeep',
]

/** `log`'s lines before its first `|turn|` line, then the hand turn. */
export function hitsLog(log: string): string {
  const lines = log.split('\n')
  const turn = lines.findIndex((line) => line.startsWith('|turn|'))
  if (turn < 0) throw new Error('the log has no |turn| line')
  return `${[...lines.slice(0, turn), ...HITS_TURN].join('\n')}\n`
}
