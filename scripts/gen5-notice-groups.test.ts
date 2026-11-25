import { describe, expect, it } from 'vitest'

import {
  groupNotices,
  openingComment,
  OWN_NAME,
  PATHS_SHOWN,
  type ReadTree,
  treeHtml,
} from './gen5-notice-groups'

// Invented files: two carry the same notice but for their own names, one another, one none.
const MIT = (name: string) =>
  `/* Copyright (C) 2020 Team\n * applies to this file (${name}).\n * MIT <text>\n */\n#include <a.h>\n`
const FILES = [
  { path: 'lib/a/one.c', text: MIT('one.c') },
  { path: 'lib/b/two.h', text: MIT('two.h') },
  { path: 'lib/zip.c', text: '\n/*\n  Copyright (C) 2013 Somebody\n  zlib terms\n*/\nint x;\n' },
  { path: 'lib/plain.c', text: '#include "plain.h"\n/* not at the top */\n' },
]

describe('openingComment', () => {
  it('takes the block comment a file opens with, after blank lines', () => {
    expect(openingComment('\n  /* one\r\n two */\nint x;')).toBe('/* one\n two */')
  })

  it('takes a run of line comments a file opens with', () => {
    expect(openingComment('// one\n// two\nint x;\n// three')).toBe('// one\n// two')
  })

  it('gives nothing for a file that opens with code, or is empty', () => {
    expect(openingComment('#include <a.h>\n/* later */')).toBeUndefined()
    expect(openingComment('')).toBeUndefined()
  })

  it('stops on a block comment that never closes', () => {
    expect(() => openingComment('/* open')).toThrow('never closes')
  })
})

// Scene: libretro-common's files carry different notices, and the page shows each one.
describe('groupNotices', () => {
  const read = groupNotices(FILES)

  it('groups the files by their notice, reading a file own name in it as one name', () => {
    expect(read.groups).toEqual([
      {
        text: `/* Copyright (C) 2020 Team\n * applies to this file (${OWN_NAME}).\n * MIT <text>\n */`,
        paths: ['lib/a/one.c', 'lib/b/two.h'],
      },
      { text: '/*\n  Copyright (C) 2013 Somebody\n  zlib terms\n*/', paths: ['lib/zip.c'] },
    ])
  })

  it('keeps a file with no opening comment apart, and leaves no file out', () => {
    expect(read.bare).toEqual(['lib/plain.c'])
    const counted = read.groups.reduce((sum, group) => sum + group.paths.length, read.bare.length)
    expect(counted).toBe(FILES.length)
  })
})

describe('treeHtml', () => {
  const tree: ReadTree = {
    component: 'retroarch',
    part: 'lib & co',
    folder: 'lib/',
    extensions: ['.c', '.h'],
    commit: 'a'.repeat(40),
    ...groupNotices(FILES),
  }
  const textOf = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')
  const text = textOf(treeHtml(tree))

  it('names the folder, the commit, the count of files and of distinct texts', () => {
    expect(text).toContain('lib &amp; co')
    expect(text).toContain(
      'The opening comment of each .c and .h file under lib/ at commit aaaaaaa: 4 files, 2 distinct texts.',
    )
    expect(text).toContain('reads &lt;this file&gt; in its place')
  })

  it('shows each distinct text once, escaped, with its count and its paths', () => {
    expect(text).toContain('2 files carry this text: lib/a/one.c, lib/b/two.h')
    expect(text).toContain('1 file carries this text: lib/zip.c')
    expect(text.split('Copyright (C) 2020 Team')).toHaveLength(2)
    expect(text).toContain('MIT &lt;text&gt;')
  })

  it('lists the files with no notice by path', () => {
    expect(text).toContain('No notice in the file: lib/plain.c')
  })

  it(`names the paths of a group of ${String(PATHS_SHOWN)} files or fewer, and counts a larger one`, () => {
    const many = Array.from({ length: PATHS_SHOWN + 1 }, (_, n) => `lib/f${String(n)}.c`)
    const big = treeHtml({ ...tree, groups: [{ text: '/* x */', paths: many }], bare: [] })
    expect(textOf(big)).toContain(`${String(PATHS_SHOWN + 1)} files carry this text.`)
    expect(big).not.toContain('lib/f0.c')
  })
})
