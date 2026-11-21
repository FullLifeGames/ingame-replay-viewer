// One rule for every failure the page shows: an Error by its message, any other thrown value by
// its text. fetch.ts, session.ts and the page's status line import it.

/** A thrown value as a line of text: the Error's message, or `String(value)`. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
