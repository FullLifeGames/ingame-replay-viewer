// A replay the user names in the page (plan "Replay input (v1)"): an ID or a link to
// replay.pokemonshowdown.com, read as the URL of the replay's JSON there, which answers with open
// CORS.

/** Input that names no replay on replay.pokemonshowdown.com. */
export class ReplayInputError extends Error {
  override name = 'ReplayInputError'
}

/** Showdown's replay host, which the page asks for a replay's JSON. */
export const REPLAY_HOST = 'replay.pokemonshowdown.com'
const ASK = `paste a replay ID or a link to ${REPLAY_HOST}`

/** Showdown's replay IDs: lowercase words joined by single hyphens, as gen3ou-1234567890. */
const REPLAY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** The path of a link to a replay, after the host; a link without a scheme reads as https. */
function pathOfLink(text: string): string {
  const link = SCHEME.test(text) ? text : `https://${text}`
  if (!URL.canParse(link)) {
    throw new ReplayInputError(`"${text}" is not a link: ${ASK}`)
  }
  const url = new URL(link)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ReplayInputError(`${url.protocol} is not a web link: ${ASK}`)
  }
  if (url.hostname !== REPLAY_HOST) {
    throw new ReplayInputError(`${url.hostname} is not ${REPLAY_HOST}: ${ASK}`)
  }
  return url.pathname.slice(1)
}

/** The replay ID in `text`, without the `?p2` or `#...` of a link, a trailing slash or a suffix. */
function idOf(text: string): string {
  const path = text.includes('/') ? pathOfLink(text) : text.replace(/[?#].*$/, '')
  const id = path.replace(/\/$/, '').replace(/\.(?:json|log)$/, '')
  if (!REPLAY_ID.test(id)) {
    throw new ReplayInputError(
      `"${id}" is not a replay ID: replay IDs look like smogtours-gen3ou-994052; ${ASK}`,
    )
  }
  return id
}

/** The URL of the replay JSON that `input`, an ID or a link, names. */
export function replayJsonUrl(input: string): string {
  const text = input.trim()
  if (text === '') {
    throw new ReplayInputError(`No replay given: ${ASK}`)
  }
  return `https://${REPLAY_HOST}/${idOf(text)}.json`
}
