import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { withoutGitVariables } from './rom-git.ts'
import { readSeries } from './rom-upstream.ts'
import { WASM_DIR } from './wasm-config.ts'
import { patchedFiles, prepareCopies } from './wasm-overlay.ts'
import type { CopySet } from './wasm-overlay.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-overlay-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const patch = (file: string, from: string, to: string) =>
  [
    'Why: the spec needs it.',
    '',
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    `-${from}`,
    `+${to}`,
    '',
  ].join('\n')

// An upstream tree, a patch folder and the build folder the copies go to.
function layout(patches: Record<string, string>): CopySet {
  const base = realpathSync(mkdtempSync(join(scratch, 'case-')))
  write(join(base, 'tree', 'src', 'a.c'), 'int a;\n')
  write(join(base, 'tree', 'src', 'b.c'), 'int b;\n')
  write(join(base, 'tree', 'include', 'h.h'), 'int h;\n')
  write(join(base, 'patches', 'series'), `# order\n${Object.keys(patches).join('\n')}\n`)
  for (const [name, text] of Object.entries(patches)) write(join(base, 'patches', name), text)
  const roots = { cache: join(base, '.cache', 'wasm'), out: join(base, 'build', 'wasm') }
  return {
    from: join(base, 'tree'),
    to: join(roots.out, 'overlay'),
    patches: join(base, 'patches'),
    roots,
  }
}

describe('the files of a patch', () => {
  it('come from its diff --git lines, below the reason', () => {
    const text = `${patch('src/a.c', 'x', 'y')}${patch('include/h.h', 'x', 'y')}`
    expect(patchedFiles(text, '0001-a.patch')).toEqual(['src/a.c', 'include/h.h'])
  })

  it('refuse a patch that adds a file', () => {
    const text = 'diff --git a/src/n.c b/src/n.c\nnew file mode 100644\n'
    expect(() => patchedFiles(text, '0001-n.patch')).toThrow(/0001-n\.patch adds src\/n\.c/)
  })

  it('refuse a patch that steps out of its folder', () => {
    expect(() => patchedFiles(patch('../x.c', 'a', 'b'), '0001-x.patch')).toThrow(
      /outside.*\.\.\/x\.c/,
    )
  })

  it('refuse a patch that names no file', () => {
    expect(() => patchedFiles('just words\n', '0001-x.patch')).toThrow(/0001-x\.patch/)
  })
})

describe('the patched copies', () => {
  it('copy each file a patch names and patch the copy, leaving the tree as it is', () => {
    const set = layout({
      '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;'),
      '0002-h.patch': patch('include/h.h', 'int h;', 'int h2;'),
    })
    expect(prepareCopies(set)).toEqual(['include/h.h', 'src/a.c'])
    expect(readFileSync(join(set.to, 'src', 'a.c'), 'utf8')).toBe('int a2;\n')
    expect(readFileSync(join(set.to, 'include', 'h.h'), 'utf8')).toBe('int h2;\n')
    expect(existsSync(join(set.to, 'src', 'b.c'))).toBe(false)
    expect(readFileSync(join(set.from, 'src', 'a.c'), 'utf8')).toBe('int a;\n')
  })

  it('apply two patches to one file in the order of the series', () => {
    const set = layout({
      '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;'),
      '0002-a.patch': patch('src/a.c', 'int a2;', 'int a3;'),
    })
    expect(prepareCopies(set)).toEqual(['src/a.c'])
    expect(readFileSync(join(set.to, 'src', 'a.c'), 'utf8')).toBe('int a3;\n')
  })

  // build/wasm lies inside our repository. There git apply resolves a/src/a.c from the
  // repository's root, skips it and exits 0, unless a ceiling stops its search (review W2).
  it('patch the copies when the build folder lies inside a git repository', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;') })
    const base = dirname(set.from)
    const init = spawnSync('git', ['init', '-q'], {
      cwd: base,
      env: withoutGitVariables(process.env),
    })
    expect(init.status).toBe(0)
    expect(prepareCopies(set)).toEqual(['src/a.c'])
    expect(readFileSync(join(set.to, 'src', 'a.c'), 'utf8')).toBe('int a2;\n')
  })

  it('stop when a patch applies and leaves its file as it was', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int a;', 'int a;') })
    expect(() => prepareCopies(set)).toThrow(/0001-a\.patch left src\/a\.c as it was/)
  })

  it('refuse a patch that does not apply and name it', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int other;', 'int a2;') })
    expect(() => prepareCopies(set)).toThrow(/0001-a\.patch does not apply/)
  })

  it('drop the copies of a run before', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;') })
    write(join(set.to, 'src', 'stale.c'), 'int stale;\n')
    prepareCopies(set)
    expect(existsSync(join(set.to, 'src', 'stale.c'))).toBe(false)
  })

  it('make no copy for an empty series', () => {
    const set = layout({})
    expect(prepareCopies(set)).toEqual([])
  })

  it('refuse a folder for the copies outside build/wasm', () => {
    const set = layout({})
    expect(() => prepareCopies({ ...set, to: join(set.from, 'copies') })).toThrow(/may not delete/)
  })
})

describe('rom/gen3/wasm/patches/series', () => {
  const dir = join(WASM_DIR, 'patches')
  const names = readSeries(readFileSync(join(dir, 'series'), 'utf8'))
  const files = names.flatMap((name) => patchedFiles(readFileSync(join(dir, name), 'utf8'), name))

  it('lists every patch of its folder and no other', () => {
    const folder = readdirSync(dir).filter((name) => name.endsWith('.patch'))
    expect([...names].sort()).toEqual(folder.sort())
  })

  // The division rewrite gives libgcc's result for every division of the module (#66), so the
  // shake animations' zero divisor needs no patch of its own (#91).
  it('leaves the shake animations of pokemon_animation.c to the division rewrite', () => {
    expect(files).not.toContain('src/pokemon_animation.c')
  })
})
