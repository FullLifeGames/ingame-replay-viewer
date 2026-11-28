// The two files the build machine makes and the Gen 5 page reads (#111): the numbers that
// scripts/gen5-bw2.ts generates from the pinned pokebw2 checkout, and the routine that
// scripts/gen5-routine.ts builds. Both servers answer them under BUILD_PREFIX from build/gen5/
// (scripts/gen5-files.ts), and the page's build output holds neither. Here are their routes, the
// checks on what they hold and every sentence the page shows when one is wrong.
import { BW2_NUMBERS_VERSION, type Bw2Numbers } from './bw2-numbers.ts'
import { POKEBW2 } from './pokebw2-pin.ts'
import type { RoutineBuild } from './routine-order.ts'

/** Where both servers answer the build files. */
export const BUILD_PREFIX = '/gen5-build/'

/** Each build file's name in build/gen5/ and under BUILD_PREFIX. */
export const BUILD_FILES = { numbers: 'bw2.json', routine: 'routine.json' } as const

export type BuildFile = keyof typeof BUILD_FILES

/** The script that makes each build file on the build machine. */
const MAKERS: Record<BuildFile, string> = {
  numbers: 'scripts/gen5-bw2.ts',
  routine: 'scripts/gen5-routine.ts',
}

export const buildFileUrl = (file: BuildFile) => `${BUILD_PREFIX}${BUILD_FILES[file]}`

const pathOf = (file: BuildFile) => `build/gen5/${BUILD_FILES[file]}`

const runMaker = (file: BuildFile) => `Run node ${MAKERS[file]} on the build machine`

/** The sentence for a fetch of a build file that got no answer. */
export const buildFileUnreachable = (file: BuildFile) =>
  `The page could not reach its server for ${pathOf(file)}.`

/** The sentence for the server's answer to a build file, or undefined for a 2xx. Status 0 is a
 * fetch that got no answer. */
export function buildFileProblem(file: BuildFile, status: number): string | undefined {
  if (status >= 200 && status <= 299) return undefined
  if (status === 0) return buildFileUnreachable(file)
  if (status === 404) return `The server has no ${pathOf(file)}. ${runMaker(file)}.`
  return `The server answered ${String(status)} for ${pathOf(file)}.`
}

/** The sentence for a build file whose text JSON.parse refused with `message`. */
export const buildFileNoJson = (file: BuildFile, message: string) =>
  `${pathOf(file)} is no JSON: ${message.replace(/\.$/, '')}.`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The pokebw2 commit the numbers name, if they name one. */
function commitOf(json: unknown): string | undefined {
  const source = isRecord(json) ? json.pokebw2 : undefined
  const commit = isRecord(source) ? source.commit : undefined
  return typeof commit === 'string' ? commit : undefined
}

/** The version of the numbers' shape the file names, if it names one. */
function versionOf(json: unknown): number | undefined {
  const version = isRecord(json) ? json.version : undefined
  return typeof version === 'number' ? version : undefined
}

/** The sentence for numbers whose shape is not this page's, or undefined when it is. */
function versionProblem(json: unknown): string | undefined {
  const version = versionOf(json)
  if (version === BW2_NUMBERS_VERSION) return undefined
  const ours = `this page reads version ${String(BW2_NUMBERS_VERSION)}`
  const theirs =
    version === undefined
      ? 'names no version of its numbers'
      : `holds its numbers in version ${String(version)}`
  return `${pathOf('numbers')} ${theirs}, and ${ours}. ${runMaker('numbers')} to make them anew.`
}

/** The numbers as the page reads them, or the sentence why not: they must name `pin`, the commit
 * this page was built for, since numbers of another commit can drive the game wrong, and
 * BW2_NUMBERS_VERSION, since a file of another shape fails later where a key is missing. */
export function numbersOf(
  json: unknown,
  pin: string = POKEBW2.commit,
): { numbers: Bw2Numbers } | { problem: string } {
  const commit = commitOf(json)
  const again = runMaker('numbers')
  if (commit === undefined) {
    return { problem: `${pathOf('numbers')} names no pokebw2 commit. ${again} to make it anew.` }
  }
  if (commit !== pin) {
    return {
      problem: `${pathOf('numbers')} holds the numbers of pokebw2 ${commit}, and this page reads pokebw2 ${pin}. ${again} to make them anew.`,
    }
  }
  const problem = versionProblem(json)
  return problem === undefined ? { numbers: json as Bw2Numbers } : { problem }
}

/** The numbers through numbersOf's check, for the run scripts: its sentence as an Error. */
export function checkedNumbers(json: unknown): Bw2Numbers {
  const got = numbersOf(json)
  if ('problem' in got) throw new Error(got.problem)
  return got.numbers
}

const isCount = (value: unknown) => Number.isInteger(value)

const isByte = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255

/** Each field of the routine's build that the direct entry reads, with its check, in the order
 * the sentence names the first one missing. The order block itself is takeover's to check
 * (src/gen5/direct-takeover.ts). */
const ROUTINE_FIELDS: readonly [string, (value: unknown) => boolean][] = [
  ['bytes', Array.isArray],
  ['size', isCount],
  ['functions', (value) => isRecord(value) && [value.init, value.main, value.exit].every(isCount)],
  ['order', (value) => Array.isArray(value) && value.every((name) => typeof name === 'string')],
  ['sha256', (value) => typeof value === 'string'],
]

/** The routine's build as the page reads it, or the sentence why not. */
export function routineOf(json: unknown): { routine: RoutineBuild } | { problem: string } {
  const build = isRecord(json) ? json : {}
  const lacking = ROUTINE_FIELDS.find(([field, holds]) => !holds(build[field]))
  const noBuild = `${pathOf('routine')} is no routine build`
  const again = `${runMaker('routine')}.`
  if (lacking !== undefined) return { problem: `${noBuild}: it lacks ${lacking[0]}. ${again}` }
  if (!(build.bytes as unknown[]).every(isByte)) {
    return { problem: `${noBuild}: its bytes hold a value outside 0 to 255. ${again}` }
  }
  return { routine: json as RoutineBuild }
}
