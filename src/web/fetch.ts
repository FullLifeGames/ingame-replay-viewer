// The page's GETs: the build outputs from its own server and a replay JSON from Showdown. A failed
// request or an answer other than 2xx becomes one line that names the URL and keeps the server's
// own words, so the dev server's "run npm run rom:build" reaches the status line.
import { messageOf } from './message'

/** A request that failed, or an answer the page cannot use. */
export class FetchError extends Error {
  override name = 'FetchError'
  /** The URL the page asked for. */
  readonly url: string
  /** The answer's HTTP status; undefined when no answer came. */
  readonly status: number | undefined

  constructor(message: string, url: string, status?: number) {
    super(message)
    this.url = url
    this.status = status
  }
}

/** The browser's fetch, narrowed to a GET of one URL. */
type Fetcher = (url: string) => Promise<Response>

const browserFetch: Fetcher = (url) => fetch(url)

/** An error page's first line, short enough for the status line. */
const LONGEST_BODY = 200

async function refusal(url: string, response: Response): Promise<FetchError> {
  const [line = ''] = (await response.text()).trim().split('\n')
  const body = line.trim().slice(0, LONGEST_BODY)
  const said = body === '' ? '' : `: ${body}`
  return new FetchError(`${url} answered ${String(response.status)}${said}`, url, response.status)
}

async function answer(url: string, fetcher: Fetcher): Promise<Response> {
  let response: Response
  try {
    response = await fetcher(url)
  } catch (error) {
    throw new FetchError(`${url} could not be fetched: ${messageOf(error)}`, url)
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
  const response = await answer(url, fetcher)
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    const said = `${url} did not answer with JSON: ${messageOf(error)}`
    throw new FetchError(said, url, response.status)
  }
}
