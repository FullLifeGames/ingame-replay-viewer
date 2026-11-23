// A Showdown replay's ID: the shape the viewer takes from a link or a saved file (#56), the
// longest one it takes, and the password part that ends a private replay's ID, which a public
// report leaves out (#59).

/** Showdown's replay IDs: lowercase words joined by single hyphens, as gen3ou-1234567890. */
const REPLAY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The longest ID the viewer takes. Showdown's longest today has 94 characters: a server prefix as
 * `smogtours-` (10), the longest format ID of its config/formats.ts (39), a battle number of 10
 * digits with its hyphen (11), and a private replay's password part (34, below). 120 leaves room
 * for a longer format or server name.
 */
export const LONGEST_REPLAY_ID = 120

/**
 * A private replay's password part: Showdown's server/replays.ts writes the ID as the public one,
 * a hyphen, a password of 31 lowercase letters and digits, and "pw". It follows the battle's
 * number and ends the ID, before a link's path, query, hash or `.json`.
 */
const PASSWORD_PART = /(-\d+)-[a-z0-9]+pw(?=$|[/?#.])/gi

/** Whether `text` has the shape and the length of a Showdown replay ID. */
export function isReplayId(text: string): boolean {
  return text.length <= LONGEST_REPLAY_ID && REPLAY_ID.test(text)
}

/** `text`, an ID or a link as typed, with every private replay's password part cut out. */
export function withoutPassword(text: string): string {
  return text.replace(PASSWORD_PART, '$1')
}
