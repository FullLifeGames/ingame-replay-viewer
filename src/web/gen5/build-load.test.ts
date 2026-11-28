import { describe, expect, it } from 'vitest'

import { fetchBuildFiles } from './build-load'
import { ROUTINE } from '../../gen5/direct-entry.fixtures'
import { BW2_NUMBERS_VERSION } from '../../gen5/bw2-numbers'
import { POKEBW2 } from '../../gen5/pokebw2-pin'

const NUMBERS = { version: BW2_NUMBERS_VERSION, pokebw2: { ...POKEBW2 } }

type Answer = { status: number; body: string } | 'unreachable' | 'cut off'

/** A server that answers each path from `answers` (a 404 for any other), logging what the page
 * asked for. */
function server(answers: Record<string, Answer>) {
  const asked: unknown[][] = []
  const fetcher = (...args: unknown[]) => {
    asked.push(args)
    const answer = answers[String(args[0])] ?? { status: 404, body: '' }
    if (answer === 'unreachable') return Promise.reject(new TypeError('Failed to fetch'))
    if (answer === 'cut off') {
      return Promise.resolve({
        status: 200,
        text: () => Promise.reject(new TypeError('network error')),
      })
    }
    return Promise.resolve({ status: answer.status, text: () => Promise.resolve(answer.body) })
  }
  return { asked, fetcher }
}

/** What JSON.parse says of `text`, without a closing full stop. */
function parseError(text: string): string {
  try {
    JSON.parse(text)
  } catch (error) {
    return (error as Error).message.replace(/\.$/, '')
  }
  throw new Error(`${text} is JSON`)
}

const ok = (json: unknown): Answer => ({ status: 200, body: JSON.stringify(json) })
const BOTH = { '/gen5-build/bw2.json': ok(NUMBERS), '/gen5-build/routine.json': ok(ROUTINE) }

// Scene: the page asks its own server for the two files that the build machine makes and that
// the page's build output never holds (#111).
describe('fetchBuildFiles', () => {
  it('asks for both files with a plain GET and gives what they hold', async () => {
    const { asked, fetcher } = server(BOTH)
    expect(await fetchBuildFiles(fetcher)).toEqual({ numbers: NUMBERS, routine: ROUTINE })
    expect(asked).toEqual([['/gen5-build/bw2.json'], ['/gen5-build/routine.json']])
  })

  it('names each missing file and the script that makes it', async () => {
    expect(await fetchBuildFiles(server({}).fetcher)).toEqual({
      problem:
        'The server has no build/gen5/bw2.json. Run node scripts/gen5-bw2.ts on the build machine.',
    })
    const noRoutine = server({ '/gen5-build/bw2.json': ok(NUMBERS) })
    expect(await fetchBuildFiles(noRoutine.fetcher)).toEqual({
      problem:
        'The server has no build/gen5/routine.json. Run node scripts/gen5-routine.ts on the build machine.',
    })
  })

  it("passes the numbers' pin problem through", async () => {
    const other = { pokebw2: { ...POKEBW2, commit: 'b'.repeat(40) } }
    const { fetcher } = server({ ...BOTH, '/gen5-build/bw2.json': ok(other) })
    expect(await fetchBuildFiles(fetcher)).toEqual({
      problem: `build/gen5/bw2.json holds the numbers of pokebw2 ${'b'.repeat(40)}, and this page reads pokebw2 ${POKEBW2.commit}. Run node scripts/gen5-bw2.ts on the build machine to make them anew.`,
    })
  })

  it("passes the routine's problem through", async () => {
    const { fetcher } = server({ ...BOTH, '/gen5-build/routine.json': ok({ size: 1 }) })
    expect(await fetchBuildFiles(fetcher)).toEqual({
      problem:
        'build/gen5/routine.json is no routine build: it lacks bytes. Run node scripts/gen5-routine.ts on the build machine.',
    })
  })

  it('says the server could not be reached when a fetch fails', async () => {
    const { fetcher } = server({ ...BOTH, '/gen5-build/routine.json': 'unreachable' })
    expect(await fetchBuildFiles(fetcher)).toEqual({
      problem: 'The page could not reach its server for build/gen5/routine.json.',
    })
  })

  // Scene: the server answers 200 and the connection breaks while the page reads the body.
  it('says the server could not be reached when the body fails to read', async () => {
    const { fetcher } = server({ ...BOTH, '/gen5-build/bw2.json': 'cut off' })
    expect(await fetchBuildFiles(fetcher)).toEqual({
      problem: 'The page could not reach its server for build/gen5/bw2.json.',
    })
  })

  it('names another status and an answer that is no JSON', async () => {
    const failing = server({ ...BOTH, '/gen5-build/bw2.json': { status: 500, body: 'gen5: no' } })
    expect(await fetchBuildFiles(failing.fetcher)).toEqual({
      problem: 'The server answered 500 for build/gen5/bw2.json.',
    })
    const html = server({ ...BOTH, '/gen5-build/bw2.json': { status: 200, body: '<html>' } })
    expect(await fetchBuildFiles(html.fetcher)).toEqual({
      problem: `build/gen5/bw2.json is no JSON: ${parseError('<html>')}.`,
    })
  })
})
