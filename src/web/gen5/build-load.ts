// The Gen 5 page's loader of the two build files (#111): the numbers and the routine that the
// build machine makes, fetched from the page's own server under BUILD_PREFIX. It gives both, or
// the one sentence why the page cannot play (src/gen5/build-files.ts holds the sentences).
import {
  type BuildFile,
  buildFileNoJson,
  buildFileProblem,
  buildFileUnreachable,
  buildFileUrl,
  numbersOf,
  routineOf,
} from '../../gen5/build-files.ts'
import type { Bw2Numbers } from '../../gen5/bw2-numbers.ts'
import type { RoutineBuild } from '../../gen5/routine-order.ts'

type Fetcher = (url: string) => Promise<{ status: number; text(): Promise<string> }>

/** The build file's JSON from the server by a plain GET, or the sentence why there is none. A
 * fetch or a body read that fails means the server could not be reached. */
async function fetchJson(
  file: BuildFile,
  fetcher: Fetcher,
): Promise<{ json: unknown } | { problem: string }> {
  let text: string
  try {
    const answer = await fetcher(buildFileUrl(file))
    const problem = buildFileProblem(file, answer.status)
    if (problem !== undefined) return { problem }
    text = await answer.text()
  } catch {
    return { problem: buildFileUnreachable(file) }
  }
  try {
    return { json: JSON.parse(text) as unknown }
  } catch (error) {
    return { problem: buildFileNoJson(file, (error as Error).message) }
  }
}

/** Both build files, numbers first, or the first sentence why the page cannot play. */
export async function fetchBuildFiles(
  fetcher: Fetcher,
): Promise<{ numbers: Bw2Numbers; routine: RoutineBuild } | { problem: string }> {
  const numbersJson = await fetchJson('numbers', fetcher)
  if ('problem' in numbersJson) return numbersJson
  const numbers = numbersOf(numbersJson.json)
  if ('problem' in numbers) return numbers
  const routineJson = await fetchJson('routine', fetcher)
  if ('problem' in routineJson) return routineJson
  const routine = routineOf(routineJson.json)
  if ('problem' in routine) return routine
  return { numbers: numbers.numbers, routine: routine.routine }
}
