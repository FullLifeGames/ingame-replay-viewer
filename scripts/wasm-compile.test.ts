import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  checkNamedSources,
  compileCommands,
  glueCommands,
  pipelineScript,
  treeSources,
  wasmPaths,
  wasmRoots,
} from './wasm-compile.ts'
import type { CompileCommand, WasmPaths } from './wasm-compile.ts'
import { loadWasmConfig } from './wasm-config.ts'
import type { WasmConfig } from './wasm-config.ts'
import { LAYER_DIR } from './wasm-layer.ts'

const paths: WasmPaths = {
  tree: '/repo/.cache/rom/expansion',
  out: '/repo/build/wasm',
  obj: '/repo/build/wasm/obj',
  shadow: '/repo/rom/gen3/wasm/include',
  overlay: '/repo/build/wasm/overlay',
  emcc: '/tools/emsdk/upstream/emscripten/emcc',
}
const config: WasmConfig = {
  emscripten: { version: '7.0.0' },
  exclude: ['src/agb_flash.c'],
  defines: { 'src/recorded_battle.c': ['IRV_WASM_NO_SAVE_SIZE_ASSERTS'] },
  flags: { 'src/ow_abilities.c': ['-Wno-error=incompatible-function-pointer-types'] },
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
    ['a flag', { ...config, exclude: [], defines: {}, flags: { 'src/gone.c': ['-Wall'] } }],
  ])('refuses %s that names no source of the tree', (_, named) => {
    expect(() => {
      checkNamedSources(named, ['src/main.c', 'src/random.c'])
    }).toThrow(/src\/gone\.c/)
  })

  it('accepts a config whose every name is a source of the tree', () => {
    expect(() => {
      checkNamedSources(config, ['src/agb_flash.c', 'src/ow_abilities.c', 'src/recorded_battle.c'])
    }).not.toThrow()
  })

  it('gives the defines of wasm.json to their file only', () => {
    const define = '-DIRV_WASM_NO_SAVE_SIZE_ASSERTS'
    const recorded = only(compileCommands(loadWasmConfig(), ['src/recorded_battle.c'], paths))
    expect(recorded.preprocess).toContain(define)
    const main = only(compileCommands(loadWasmConfig(), ['src/main.c'], paths))
    expect(main.preprocess).not.toContain(define)
  })

  it('compiles src/random.c from its overlay copy, with no define of its own', () => {
    const options = { optimise: '-O2', overlay: ['src/random.c'] } as const
    const random = only(compileCommands(loadWasmConfig(), ['src/random.c'], paths, options))
    expect(random.preprocess).toContain(`${paths.overlay}/src/random.c`)
    const main = only(compileCommands(loadWasmConfig(), ['src/main.c'], paths))
    const defines = (argv: string[]) => argv.filter((arg) => arg.startsWith('-D'))
    expect(defines(random.preprocess)).toEqual(defines(main.preprocess))
  })

  it('adds the flags of wasm.json to the compile step of that file only', () => {
    const flag = '-Wno-error=incompatible-function-pointer-types'
    const [abilities, main] = compileCommands(config, ['src/ow_abilities.c', 'src/main.c'], paths)
    expect(abilities?.compile.slice(-4)).toEqual([
      flag,
      '-o',
      `${paths.obj}/src/ow_abilities.o`,
      '-',
    ])
    expect(abilities?.preprocess).not.toContain(flag)
    expect(main?.compile).not.toContain(flag)
  })

  it('compiles an overlaid file from its copy under build/wasm/overlay, into the same object', () => {
    const options = { optimise: '-O2' as const, overlay: ['src/script.c'] }
    const [script, main] = compileCommands(config, ['src/script.c', 'src/main.c'], paths, options)
    expect(script?.preprocess.at(-1)).toBe('/repo/build/wasm/overlay/src/script.c')
    expect(script?.preproc[4]).toBe('/repo/build/wasm/overlay/src/script.c')
    expect(script?.object).toBe('/repo/build/wasm/obj/src/script.o')
    expect(main?.preprocess.at(-1)).toBe('src/main.c')
  })

  it('refuses an overlay copy of a file the build does not compile', () => {
    const options = { optimise: '-O2' as const, overlay: ['src/agb_flash.c'] }
    expect(() => compileCommands(config, ['src/agb_flash.c'], paths, options)).toThrow(
      /src\/agb_flash\.c/,
    )
  })

  it('puts the shadow include dir first on -iquote and -I, the tree include on -iquote only', () => {
    const { preprocess } = only(compileCommands(config, ['src/main.c'], paths))
    // An overlay copy of a header comes before the tree's own.
    expect(pairs(preprocess, '-iquote')).toEqual([
      paths.shadow,
      `${paths.overlay}/include`,
      'include',
    ])
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

describe('the WebAssembly roots', () => {
  // The delete guard of rom-paths.ts takes them as it takes the ROM build's.
  it('put the cache under .cache/wasm and the outputs under build/wasm, and nothing else', () => {
    const repo = mkdtempSync(join(tmpdir(), 'irv-roots-'))
    const real = realpathSync(repo)
    expect(wasmRoots(repo)).toEqual({
      cache: join(real, '.cache', 'wasm'),
      out: join(real, 'build', 'wasm'),
    })
    rmSync(repo, { recursive: true })
  })
})

describe('the glue commands', () => {
  const glue = ['/repo/rom/gen3/wasm/src/irv_wasm_frame.c']

  it('compile each C file of the glue into build/wasm/obj/glue, with no define of its own', () => {
    const command = only(glueCommands(paths, glue))
    expect(command.source).toBe('glue/irv_wasm_frame.c')
    expect(command.object).toBe('/repo/build/wasm/obj/glue/irv_wasm_frame.o')
    expect(command.preprocess.at(-1)).toBe(glue[0])
    expect(command.preprocess).toContain('-DIRV_WASM')
    expect(
      command.preprocess.filter((arg) => arg.startsWith('-D') && arg !== '-DIRV_WASM'),
    ).toEqual(['-DMODERN=1', '-DTESTING=0', '-DEMERALD'])
    expect(command.compile).toContain('-O2')
  })

  // The borrowed platform headers left with their files (#43, B9): our layer's come last.
  it("reach our platform layer's headers after the tree include, and no other folder", () => {
    const { preprocess } = only(glueCommands(paths, glue))
    expect(pairs(preprocess, '-iquote')).toEqual([
      paths.shadow,
      `${paths.overlay}/include`,
      'include',
      LAYER_DIR,
    ])
  })
})

describe('the pipeline script', () => {
  it('joins the three stages with pipes and quotes every argument for the shell', () => {
    const script = pipelineScript({
      source: 'src/a.c',
      object: '/o/a.o',
      preprocess: ['emcc', '-E', "-DNAME=it's", 'src/a.c'],
      preproc: ['preproc', '-i'],
      compile: ['emcc', '-o', '/o dir/a.o', '-'],
    })
    expect(script).toBe(
      "'emcc' '-E' '-DNAME=it'\\''s' 'src/a.c' | 'preproc' '-i' | 'emcc' '-o' '/o dir/a.o' '-'",
    )
  })
})

describe('the sources of the tree', () => {
  const tree = mkdtempSync(join(tmpdir(), 'irv-wasm-tree-'))
  afterAll(() => {
    rmSync(tree, { recursive: true, force: true })
  })
  const files = ['src/b.c', 'src/a.c', 'src/x/y.c', 'src/x/y/z.c', 'src/x/y/z/deep.c']
  for (const file of [...files, 'src/data.inc.c', 'src/notes.h']) {
    mkdirSync(dirname(join(tree, file)), { recursive: true })
    writeFileSync(join(tree, file), '')
  }

  it('lists src/*.c down to three levels, sorted, without .inc.c, as the Makefile does', () => {
    expect(treeSources(tree)).toEqual(['src/a.c', 'src/b.c', 'src/x/y.c', 'src/x/y/z.c'])
  })
})

function pathsFor(emsdk: string): WasmPaths {
  return { ...paths, emcc: `${emsdk}/upstream/emscripten/emcc` }
}
