// The Gen 5 page's last word on a pick (#111): a throw anywhere between the dump's pick and the
// emulator's start ends in a sentence on the status line, never in a page left at "Loading
// <label>.". The sentence is pinned whole in pick-guard.test.ts.

/** Why the pick stopped, from what the page's code threw. */
export function pickFailedLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `The page stopped before the game started: ${message}`
}

/** Runs the pick and says its throw, if any. */
export async function guardPick(
  pick: () => Promise<void>,
  say: (line: string) => void,
): Promise<void> {
  try {
    await pick()
  } catch (error) {
    say(pickFailedLine(error))
  }
}
