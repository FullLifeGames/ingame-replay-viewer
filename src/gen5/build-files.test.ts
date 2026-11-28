import { describe, expect, it } from 'vitest'

import {
  BUILD_FILES,
  BUILD_PREFIX,
  buildFileProblem,
  buildFileUrl,
  checkedNumbers,
  numbersOf,
  routineOf,
} from './build-files'
import { BW2_NUMBERS_VERSION } from './bw2-numbers'
import { ROUTINE } from './direct-entry.fixtures'
import { POKEBW2 } from './pokebw2-pin'

const THEIRS = 'a'.repeat(40)

const numbersAt = (commit: string, version: unknown = BW2_NUMBERS_VERSION) => ({
  version,
  pokebw2: { repository: POKEBW2.repository, commit },
})

describe('numbersOf', () => {
  // Scene: build/gen5/bw2.json was made before the pin moved; the page must not play it.
  it('refuses a numbers file of another pokebw2 pin with a sentence that names both pins', () => {
    expect(numbersOf(numbersAt(THEIRS))).toEqual({
      problem: `build/gen5/bw2.json holds the numbers of pokebw2 ${THEIRS}, and this page reads pokebw2 ${POKEBW2.commit}. Run node scripts/gen5-bw2.ts on the build machine to make them anew.`,
    })
  })

  it('refuses a numbers file that names no pokebw2 commit', () => {
    const problem =
      'build/gen5/bw2.json names no pokebw2 commit. Run node scripts/gen5-bw2.ts on the build machine to make it anew.'
    for (const json of [{}, { pokebw2: {} }, { pokebw2: { commit: 7 } }, null, 'text', []]) {
      expect(numbersOf(json)).toEqual({ problem })
    }
  })

  it('passes the numbers of the pinned commit through as they are', () => {
    const json = numbersAt(POKEBW2.commit)
    const got = numbersOf(json)
    expect('numbers' in got && got.numbers).toBe(json)
  })

  it('holds the file to the pin it is given', () => {
    expect(numbersOf(numbersAt(THEIRS), THEIRS)).toEqual({ numbers: numbersAt(THEIRS) })
  })

  // Scene: build/gen5/bw2.json was made at the same pin before a key joined the numbers (#118's
  // text box); the page must not play it and fail later with a message of the library.
  it('refuses a numbers file of another version with a sentence that names both versions', () => {
    const older = BW2_NUMBERS_VERSION - 1
    expect(numbersOf(numbersAt(POKEBW2.commit, older))).toEqual({
      problem: `build/gen5/bw2.json holds its numbers in version ${String(older)}, and this page reads version ${String(BW2_NUMBERS_VERSION)}. Run node scripts/gen5-bw2.ts on the build machine to make them anew.`,
    })
  })

  it('refuses a numbers file that names no version', () => {
    const problem = `build/gen5/bw2.json names no version of its numbers, and this page reads version ${String(BW2_NUMBERS_VERSION)}. Run node scripts/gen5-bw2.ts on the build machine to make them anew.`
    const none = { pokebw2: numbersAt(POKEBW2.commit).pokebw2 }
    for (const json of [none, numbersAt(POKEBW2.commit, '2'), numbersAt(POKEBW2.commit, null)]) {
      expect(numbersOf(json)).toEqual({ problem })
    }
  })
})

// Scene: the run scripts read build/gen5/bw2.json on the build machine through the page's check.
describe('checkedNumbers', () => {
  it('passes the numbers of the pin and the version through', () => {
    const json = numbersAt(POKEBW2.commit)
    expect(checkedNumbers(json)).toBe(json)
  })

  it("throws the page's sentence for a file it refuses", () => {
    const older = numbersAt(POKEBW2.commit, BW2_NUMBERS_VERSION - 1)
    const { problem } = numbersOf(older) as { problem: string }
    expect(problem).toMatch(/^build\/gen5\/bw2.json holds its numbers in version /)
    expect(() => checkedNumbers(older)).toThrow(new Error(problem))
  })
})

describe('routineOf', () => {
  const lacks = (field: string) =>
    `build/gen5/routine.json is no routine build: it lacks ${field}. Run node scripts/gen5-routine.ts on the build machine.`

  it('passes a routine build through as it is', () => {
    const got = routineOf(ROUTINE)
    expect('routine' in got && got.routine).toBe(ROUTINE)
  })

  // Scene: an older build or a hand-made file lacks a field the direct entry reads.
  it('names the first field the build lacks', () => {
    const without = (field: string) =>
      Object.fromEntries(Object.entries(ROUTINE).filter(([name]) => name !== field))
    for (const field of ['bytes', 'size', 'functions', 'order', 'sha256']) {
      expect(routineOf(without(field))).toEqual({ problem: lacks(field) })
    }
    expect(routineOf(null)).toEqual({ problem: lacks('bytes') })
  })

  it('takes a field of the wrong kind as lacking', () => {
    expect(routineOf({ ...ROUTINE, bytes: 'code' })).toEqual({ problem: lacks('bytes') })
    expect(routineOf({ ...ROUTINE, size: 1.5 })).toEqual({ problem: lacks('size') })
    const noMain = { init: 0, exit: 2 }
    expect(routineOf({ ...ROUTINE, functions: noMain })).toEqual({ problem: lacks('functions') })
    expect(routineOf({ ...ROUTINE, order: [1] })).toEqual({ problem: lacks('order') })
    expect(routineOf({ ...ROUTINE, sha256: 0 })).toEqual({ problem: lacks('sha256') })
  })

  it('refuses a byte outside 0 to 255', () => {
    const problem =
      'build/gen5/routine.json is no routine build: its bytes hold a value outside 0 to 255. Run node scripts/gen5-routine.ts on the build machine.'
    for (const byte of [256, -1, 1.5, '1']) {
      expect(routineOf({ ...ROUTINE, bytes: [0, byte] })).toEqual({ problem })
    }
  })
})

describe('buildFileUrl', () => {
  it('places both files under the build prefix', () => {
    expect(BUILD_PREFIX).toBe('/gen5-build/')
    expect(BUILD_FILES).toEqual({ numbers: 'bw2.json', routine: 'routine.json' })
    expect(buildFileUrl('numbers')).toBe('/gen5-build/bw2.json')
    expect(buildFileUrl('routine')).toBe('/gen5-build/routine.json')
  })
})

describe('buildFileProblem', () => {
  it('passes every 2xx answer', () => {
    expect(buildFileProblem('numbers', 200)).toBeUndefined()
    expect(buildFileProblem('routine', 204)).toBeUndefined()
  })

  it('names the file and its script on a 404', () => {
    expect(buildFileProblem('routine', 404)).toBe(
      'The server has no build/gen5/routine.json. Run node scripts/gen5-routine.ts on the build machine.',
    )
  })

  it('names any other status, and status 0 as no answer', () => {
    expect(buildFileProblem('numbers', 500)).toBe(
      'The server answered 500 for build/gen5/bw2.json.',
    )
    expect(buildFileProblem('numbers', 0)).toBe(
      'The page could not reach its server for build/gen5/bw2.json.',
    )
  })
})
