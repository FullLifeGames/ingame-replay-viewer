import { describe, expect, it } from 'vitest'

import { checkNamedSources, compileCommands, wasmPaths } from './wasm-compile.ts'
import type { CompileCommand, WasmPaths } from './wasm-compile.ts'
import { loadWasmConfig } from './wasm-config.ts'
import type { WasmConfig } from './wasm-config.ts'

const paths: WasmPaths = {
  tree: '/repo/.cache/rom/expansion',
  out: '/repo/build/wasm',
  obj: '/repo/build/wasm/obj',
  shadow: '/repo/rom/gen3/wasm/include',
  emcc: '/tools/emsdk/upstream/emscripten/emcc',
}
const config: WasmConfig = {
  emscripten: { version: '7.0.0' },
  platform: { repository: 'https://example.org/p.git', commit: 'c'.repeat(40), files: ['a.c'] },
  exclude: ['src/agb_flash.c'],
  defines: { 'src/random.c': ['Random32=IrvWasm_UnusedRandom32'] },
  jobs: 2,
}

const only = (commands: CompileCommand[]): CompileCommand => {
  expect(commands).toHaveLength(1)
  return commands[0] as CompileCommand
}
const pairs = (argv: string[], flag: string) =>
  argv.flatMap((arg, at) => (arg === flag ? [argv[at + 1]] : []))

describe('the compile commands', () => {
  it('gives an excluded file no command', () => {
    const commands = compileCommands(config, ['src/agb_flash.c', 'src/main.c'], paths)
    expect(commands.map((command) => command.source)).toEqual(['src/main.c'])
  })

  it.each([
    ['an exclude', { ...config, exclude: ['src/gone.c'] }],
    ['a define', { ...config, exclude: [], defines: { 'src/gone.c': ['A'] } }],
  ])('refuses %s that names no source of the tree', (_, named) => {
    expect(() => {
      checkNamedSources(named, ['src/main.c', 'src/random.c'])
    }).toThrow(/src\/gone\.c/)
  })

  it('accepts a config whose every name is a source of the tree', () => {
    expect(() => {
      checkNamedSources(config, ['src/agb_flash.c', 'src/random.c'])
    }).not.toThrow()
  })

  it('renames Random32 in src/random.c, as wasm.json asks', () => {
    const random = only(compileCommands(loadWasmConfig(), ['src/random.c'], paths))
    expect(random.preprocess).toContain('-DRandom32=IrvWasm_UnusedRandom32')
    const main = only(compileCommands(loadWasmConfig(), ['src/main.c'], paths))
    expect(main.preprocess).not.toContain('-DRandom32=IrvWasm_UnusedRandom32')
  })

  it('puts the shadow include dir first on -iquote and -I, the tree include on -iquote only', () => {
    const { preprocess } = only(compileCommands(config, ['src/main.c'], paths))
    expect(pairs(preprocess, '-iquote')).toEqual([paths.shadow, 'include'])
    // The tree's include holds a strings.h of its own that would hide libc's from <strings.h>.
    expect(pairs(preprocess, '-I')).toEqual([paths.shadow])
  })

  it('writes every object under build/wasm/obj, never into the tree', () => {
    const { object } = only(compileCommands(config, ['src/battle_main.c'], paths))
    expect(object).toBe('/repo/build/wasm/obj/src/battle_main.o')
  })

  it.each([['../escape.c'], ['/abs/main.c'], ['src/../../escape.c']])(
    'refuses the source %s, whose object would land outside build/wasm/obj',
    (source) => {
      expect(() => compileCommands(config, [source], paths)).toThrow(/outside/)
    },
  )

  it('runs the expansion pipeline: cpp with its CPPFLAGS, preproc, then the compiler', () => {
    const command = only(compileCommands(config, ['src/main.c'], paths))
    expect(command.preprocess.slice(0, 2)).toEqual([paths.emcc, '-E'])
    expect(command.preprocess).toEqual(
      expect.arrayContaining([
        '-Wno-trigraphs',
        '-DMODERN=1',
        '-DTESTING=0',
        '-DEMERALD',
        '-std=gnu17',
        '-DIRV_WASM',
      ]),
    )
    expect(command.preprocess.at(-1)).toBe('src/main.c')
    expect(command.preproc).toEqual([
      'tools/preproc/preproc',
      '-i',
      '-g',
      'build/assets',
      'src/main.c',
      'charmap.txt',
    ])
    expect(command.compile).toEqual(
      expect.arrayContaining([paths.emcc, '-x', 'c', '-c', '-O2', '-std=gnu17']),
    )
    expect(command.compile.slice(-3)).toEqual(['-o', '/repo/build/wasm/obj/src/main.o', '-'])
  })

  it('compiles at -O0 when the census asks for it', () => {
    const command = only(compileCommands(config, ['src/main.c'], paths, { optimise: '-O0' }))
    expect(command.compile).toContain('-O0')
    expect(command.compile).not.toContain('-O2')
  })

  it('finds the tree, the outputs, the shadow headers and emcc from the repo and EMSDK', () => {
    expect(wasmPaths('/repo', { EMSDK: '/opt/emsdk' }, '/home/u')).toEqual(pathsFor('/opt/emsdk'))
    expect(wasmPaths('/repo', {}, '/home/u')).toEqual(pathsFor('/home/u/tools/emsdk'))
  })
})

function pathsFor(emsdk: string): WasmPaths {
  return { ...paths, emcc: `${emsdk}/upstream/emscripten/emcc` }
}
