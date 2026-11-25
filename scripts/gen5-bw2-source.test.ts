import { describe, expect, it } from 'vitest'

import { readSources } from './gen5-bw2'
import { checkoutSteps, listedReader, POKEBW2, POKEBW2_FILES } from './gen5-bw2-source'
import { TEXT_BANKS } from './gen5-moment-scene'

const DIR = '/invented/pokebw2'

/** A reader of invented text that records each path it is asked for. */
function fakeText() {
  const asked: string[] = []
  const readText = (path: string) => {
    asked.push(path)
    return `invented text of ${path}\n`
  }
  return { asked, readText }
}

// Scene: a read outside the list must fail before the generator parses anything.
describe('listedReader', () => {
  it("returns a listed path's text, read under the checkout", () => {
    const { asked, readText } = fakeText()
    const read = listedReader(DIR, ['a/listed.c'], readText)
    expect(read('a/listed.c')).toBe(`invented text of ${DIR}/a/listed.c\n`)
    expect(asked).toEqual([`${DIR}/a/listed.c`])
  })

  it('throws with the path for any other, before it reads', () => {
    const { asked, readText } = fakeText()
    const read = listedReader(DIR, ['a/listed.c'], readText)
    expect(() => read('a/unlisted.c')).toThrow('a/unlisted.c is not in POKEBW2_FILES')
    expect(asked).toEqual([])
  })
})

// Scene: the generator reads only listed files, all of them before it parses one.
describe('readSources', () => {
  it('passes on the list', () => {
    const { readText } = fakeText()
    expect(() => readSources(listedReader(DIR, POKEBW2_FILES, readText))).not.toThrow()
  })

  it('throws at the first unlisted read, naming its path', () => {
    const gone = 'include/battle/btl_server.h'
    const files = POKEBW2_FILES.filter((path) => path !== gone)
    const { asked, readText } = fakeText()
    expect(() => readSources(listedReader(DIR, files, readText))).toThrow(
      `${gone} is not in POKEBW2_FILES`,
    )
    expect(asked).not.toContain(`${DIR}/${gone}`)
  })
})

// Scene: the sparse checkout holds exactly what the code reads, and nothing else.
describe('POKEBW2_FILES', () => {
  it("equals the paths the generator reads plus the moment script's text banks", () => {
    const read: string[] = []
    readSources((path) => {
      read.push(path)
      return ''
    })
    const expected = new Set([...read, ...Object.values(TEXT_BANKS)])
    expect(new Set(POKEBW2_FILES)).toEqual(expected)
    expect(POKEBW2_FILES).toHaveLength(expected.size)
  })
})

// Scene: CI fetches the pin with no history and no blob that no code reads.
describe('checkoutSteps', () => {
  const git = (...args: string[]) => ['-C', DIR, ...args]
  const sparse = git('sparse-checkout', 'set', '--no-cone', ...POKEBW2_FILES.map((p) => `/${p}`))

  it('fetches the pinned commit at depth 1 without blobs, sparse before the checkout', () => {
    expect(checkoutSteps('none', DIR)).toEqual([
      git('init', '-q'),
      git('remote', 'add', 'origin', POKEBW2.repository),
      sparse,
      git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', POKEBW2.commit),
      git('checkout', '-q', '--detach', 'FETCH_HEAD'),
    ])
  })

  it('sets the list again on a sparse checkout, so a list that grew reaches it', () => {
    expect(checkoutSteps('sparse', DIR)).toEqual([sparse])
  })

  it('leaves a full checkout as it is', () => {
    expect(checkoutSteps('full', DIR)).toEqual([])
  })
})
