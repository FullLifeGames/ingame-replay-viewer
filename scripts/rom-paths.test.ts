import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { ROM_DIR } from './rom-config.ts'
import {
  buildPaths,
  emptyInside,
  readerTree,
  REPO_DIR,
  removeInside,
  romRoots,
} from './rom-paths.ts'
import type { RomRoots } from './rom-paths.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-paths-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

interface Layout {
  repo: string
  roots: RomRoots
  outside: string
}

// A folder laid out like the repo, with a folder beside it that the guard must never reach.
function layout(): Layout {
  const base = mkdtempSync(join(scratch, 'case-'))
  const repo = join(base, 'repo')
  mkdirSync(join(repo, '.cache', 'rom', 'expansion', 'src'), { recursive: true })
  writeFileSync(join(repo, '.cache', 'rom', 'expansion', 'src', 'main.c'), 'int x;\n')
  writeFileSync(join(repo, '.cache', 'rom', 'applied.json'), '{}\n')
  mkdirSync(join(repo, 'build', 'rom', 'repro'), { recursive: true })
  writeFileSync(join(repo, 'build', 'rom', 'irv-emerald.gba'), 'rom\n')
  const outside = join(base, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'keep.txt'), 'keep\n')
  return { repo, roots: romRoots(repo), outside }
}

const refused = /may not delete/

describe('the build paths', () => {
  it('put the tree and its stamp under .cache/rom and the outputs under build/rom', () => {
    const { repo } = layout()
    const real = realpathSync(repo)
    expect(buildPaths(repo)).toEqual({
      roots: { cache: join(real, '.cache', 'rom'), out: join(real, 'build', 'rom') },
      outDir: join(real, 'build', 'rom'),
      tree: join(real, '.cache', 'rom', 'expansion'),
      stampPath: join(real, '.cache', 'rom', 'applied.json'),
    })
  })

  it('default to this checkout', () => {
    expect(REPO_DIR).toBe(join(ROM_DIR, '..', '..'))
    expect(buildPaths().tree).toBe(join(realpathSync(REPO_DIR), '.cache', 'rom', 'expansion'))
  })
})

describe('the tree for readers', () => {
  it('is the pinned tree of this checkout by default', () => {
    expect(readerTree({})).toBe(join(REPO_DIR, '.cache', 'rom', 'expansion'))
  })

  it('comes from IRV_EXPANSION_TREE when that is set', () => {
    expect(readerTree({ IRV_EXPANSION_TREE: '/srv/expansion' })).toBe('/srv/expansion')
  })

  it('refuses an empty or a relative IRV_EXPANSION_TREE', () => {
    expect(() => readerTree({ IRV_EXPANSION_TREE: '' })).toThrow(/IRV_EXPANSION_TREE/)
    expect(() => readerTree({ IRV_EXPANSION_TREE: 'expansion' })).toThrow(/absolute/)
  })
})

describe('the delete guard', () => {
  it('removes a folder inside the cache root and a file inside the output root', () => {
    const { roots } = layout()
    removeInside(roots, join(roots.cache, 'expansion'))
    removeInside(roots, join(roots.out, 'irv-emerald.gba'))
    expect(readdirSync(roots.cache)).toEqual(['applied.json'])
    expect(readdirSync(roots.out)).toEqual(['repro'])
  })

  it('does nothing for a missing path inside a root', () => {
    const { roots } = layout()
    expect(() => {
      removeInside(roots, join(roots.cache, 'repro'))
    }).not.toThrow()
  })

  it('refuses an empty or a relative path', () => {
    const { roots } = layout()
    expect(() => {
      removeInside(roots, '')
    }).toThrow(refused)
    expect(() => {
      removeInside(roots, 'expansion')
    }).toThrow(refused)
  })

  it('refuses a path outside both roots and leaves it', () => {
    const { roots, outside } = layout()
    expect(() => {
      removeInside(roots, outside)
    }).toThrow(refused)
    expect(() => {
      removeInside(roots, `${roots.cache}/../../../outside`)
    }).toThrow(refused)
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('keep\n')
  })

  it('refuses each root itself', () => {
    const { roots } = layout()
    expect(() => {
      removeInside(roots, roots.cache)
    }).toThrow(refused)
    expect(() => {
      removeInside(roots, `${roots.out}/`)
    }).toThrow(refused)
    expect(existsSync(join(roots.cache, 'expansion', 'src', 'main.c'))).toBe(true)
    expect(existsSync(join(roots.out, 'irv-emerald.gba'))).toBe(true)
  })

  it('refuses a link inside a root that points outside and keeps both', () => {
    const { roots, outside } = layout()
    const link = join(roots.cache, 'linked')
    symlinkSync(outside, link)
    expect(() => {
      removeInside(roots, link)
    }).toThrow(refused)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
  })

  it('refuses a link that leads nowhere', () => {
    const { roots } = layout()
    symlinkSync(join(roots.cache, 'gone'), join(roots.cache, 'dangling'))
    expect(() => {
      removeInside(roots, join(roots.cache, 'dangling'))
    }).toThrow(refused)
  })

  it('refuses a path below a root that is itself a link to outside', () => {
    const { repo, outside } = layout()
    rmSync(join(repo, '.cache'), { recursive: true })
    mkdirSync(join(repo, '.cache'))
    symlinkSync(dirname(outside), join(repo, '.cache', 'rom'))
    const roots = romRoots(repo)
    expect(() => {
      removeInside(roots, join(roots.cache, 'outside'))
    }).toThrow(refused)
    expect(() => {
      removeInside(roots, join(roots.cache, 'not-there', 'expansion'))
    }).toThrow(refused)
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
  })
})

describe('emptying a folder', () => {
  it('empties the output root and keeps the folder', () => {
    const { roots } = layout()
    emptyInside(roots, roots.out)
    expect(readdirSync(roots.out)).toEqual([])
  })

  it('accepts a folder that does not exist yet', () => {
    const { roots } = layout()
    expect(() => {
      emptyInside(roots, join(roots.out, 'missing'))
    }).not.toThrow()
  })

  it('refuses a folder outside both roots and leaves it', () => {
    const { roots, outside } = layout()
    expect(() => {
      emptyInside(roots, outside)
    }).toThrow(refused)
    expect(readdirSync(outside)).toEqual(['keep.txt'])
  })
})

describe('the scripts', () => {
  it('delete files only through the guard', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const scripts = readdirSync(here).filter(
      (name) => /^rom-.*\.ts$/.test(name) && !name.endsWith('.test.ts') && name !== 'rom-paths.ts',
    )
    expect(scripts.length).toBeGreaterThan(5)
    const deleting = scripts.filter((name) =>
      /\b(?:rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink)\(/.test(
        readFileSync(join(here, name), 'utf8'),
      ),
    )
    expect(deleting).toEqual([])
  })

  it('build, clean and repro never take the tree for readers', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const users = readdirSync(here)
      .filter((name) => /^rom-.*\.ts$/.test(name) && !name.endsWith('.test.ts'))
      .filter((name) => name !== 'rom-paths.ts')
      .filter((name) =>
        /\b(?:readerTree|IRV_EXPANSION_TREE)\b/.test(readFileSync(join(here, name), 'utf8')),
      )
    expect(users).toEqual([])
  })
})
