// The page's GETs: the build outputs from its own server and a replay JSON from Showdown. A failed
// request or an answer other than 2xx becomes one line that names the URL and keeps the server's
// own words, so the dev server's "run npm run rom:build" reaches the status line.

/** A request that failed, or an answer the page cannot use. */
export class FetchError extends Error {
  override name = 'FetchError'
}

/** The browser's fetch, narrowed to a GET of one URL. */
type Fetcher = (url: string) => Promise<Response>

const browserFetch: Fetcher = (url) => fetch(url)

/** An error page's first line, short enough for the status line. */
const LONGEST_BODY = 200

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

async function refusal(url: string, response: Response): Promise<FetchError> {
  const [line = ''] = (await response.text()).trim().split('\n')
  const body = line.trim().slice(0, LONGEST_BODY)
  const said = body === '' ? '' : `: ${body}`
  return new FetchError(`${url} answered ${String(response.status)}${said}`)
}

async function answer(url: string, fetcher: Fetcher): Promise<Response> {
  let response: Response
  try {
    response = await fetcher(url)
  } catch (error) {
    throw new FetchError(`${url} could not be fetched: ${messageOf(error)}`)
  }
  if (!response.ok) throw await refusal(url, response)
  return response
}

/** The bytes at `url`. */
export async function fetchBytes(url: string, fetcher = browserFetch): Promise<Uint8Array> {
  return new Uint8Array(await (await answer(url, fetcher)).arrayBuffer())
}

/** The JSON at `url`, parsed. */
export async function fetchJson(url: string, fetcher = browserFetch): Promise<unknown> {
  const text = await (await answer(url, fetcher)).text()
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new FetchError(`${url} did not answer with JSON: ${messageOf(error)}`)
  }
}
