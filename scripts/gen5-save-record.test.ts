// The saves we made from New Game ship in src/web/gen5/saves/ (#78, ADR 0002), and
// docs/gen5-save.md records each one. This spec holds the record to the files: every save's path,
// then its lines "SHA-256: `<hex>`" and "Size: <n> bytes", equal to the committed file's.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GEN5_PATHS } from './gen5-paths.ts'

const DOC = join(GEN5_PATHS.repo, 'docs', 'gen5-save.md')

interface SaveRecord {
  sha256: string | undefined
  size: number | undefined
}

/** The first SHA-256 and size lines after the save's path in the doc. */
function recordOf(doc: string, path: string): SaveRecord {
  const at = doc.indexOf(`\`${path}\``)
  const after = at < 0 ? '' : doc.slice(at)
  const sha256 = /^(?:- )?SHA-256: `([0-9a-f]{64})`$/m.exec(after)?.[1]
  const size = /^(?:- )?Size: (\d+) bytes$/m.exec(after)?.[1]
  return { sha256, size: size === undefined ? undefined : Number(size) }
}

const saves = existsSync(GEN5_PATHS.saves)
  ? readdirSync(GEN5_PATHS.saves)
      .filter((name) => name.endsWith('.sav'))
      .sort()
  : []

describe('the record of the committed saves', () => {
  it('finds at least one save in the folder', () => {
    expect(saves.length).toBeGreaterThan(0)
  })

  it('holds the SHA-256 and size of every save', () => {
    const doc = readFileSync(DOC, 'utf8')
    for (const name of saves) {
      const file = join(GEN5_PATHS.saves, name)
      const bytes = readFileSync(file)
      expect(recordOf(doc, relative(GEN5_PATHS.repo, file)), name).toEqual({
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
      })
    }
  })

  it('reads a record from the lines after the path alone', () => {
    const doc = 'SHA-256: `' + 'a'.repeat(64) + '`\n\n`x/y.sav`\n\nSHA-256: `' + 'b'.repeat(64)
    expect(recordOf(`${doc}\`\nSize: 12 bytes\n`, 'x/y.sav')).toEqual({
      sha256: 'b'.repeat(64),
      size: 12,
    })
    expect(recordOf(doc, 'x/z.sav')).toEqual({ sha256: undefined, size: undefined })
  })
})
