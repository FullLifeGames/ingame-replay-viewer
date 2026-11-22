import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { WasmPaths } from './wasm-compile.ts'
import { asmObjects, compiledObjects, glueSources, linkCommand, linkSettings } from './wasm-link.ts'

const paths: WasmPaths = {
  tree: '/repo/.cache/rom/expansion',
  out: '/repo/build/wasm',
  obj: '/repo/build/wasm/obj',
  shadow: '/repo/rom/gen3/wasm/include',
  overlay: '/repo/build/wasm/overlay',
  emcc: '/tools/emsdk/upstream/emscripten/emcc',
}

const scratch = mkdtempSync(join(tmpdir(), 'irv-link-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const touch = (path: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
}

describe('the objects of the link', () => {
  it('takes one object per file that compile.json records', () => {
    const entries = [
      { source: 'src/main.c', ok: true },
      { source: 'src/m4a.c', ok: true },
    ]
    expect(compiledObjects(entries, paths)).toEqual([
      '/repo/build/wasm/obj/src/main.o',
      '/repo/build/wasm/obj/src/m4a.o',
    ])
  })

  // The borrowed platform files left the build (#43, B9); a record from before still names them.
  it('refuses a compile record that names a platform file and asks for a new compile', () => {
    const entries = [
      { source: 'src/main.c', ok: true },
      { source: 'platform/src/platform/bios.c', ok: true },
    ]
    expect(() => compiledObjects(entries, paths)).toThrow(
      /platform\/src\/platform\/bios\.c.*npm run wasm:build -- --compile/,
    )
  })

  it('refuses a compile record with a failed file and names it', () => {
    const entries = [
      { source: 'src/main.c', ok: true },
      { source: 'src/pokedex.c', ok: false },
    ]
    expect(() => compiledObjects(entries, paths)).toThrow(/src\/pokedex\.c/)
  })

  it('refuses an empty compile record', () => {
    expect(() => compiledObjects([], paths)).toThrow(/no file/)
  })

  it('takes every converted data object under build/wasm/asm, sorted, and nothing else', () => {
    const asm = join(scratch, 'asm')
    for (const name of ['sound/songs/midi/mus_b.o', 'data/event_scripts.o', 'data/a.s']) {
      touch(join(asm, name))
    }
    touch(join(asm, 'convert.json'))
    expect(asmObjects(asm)).toEqual([
      join(asm, 'data/event_scripts.o'),
      join(asm, 'sound/songs/midi/mus_b.o'),
    ])
  })

  it('refuses a data folder without objects', () => {
    const empty = join(scratch, 'empty')
    mkdirSync(empty)
    expect(() => asmObjects(empty)).toThrow(/wasm:convert/)
  })

  it('finds the C files of the glue, sorted, without headers', () => {
    const glue = join(scratch, 'glue')
    for (const name of ['irv_wasm_stubs.c', 'irv_wasm_frame.c', 'irv_wasm.h']) {
      touch(join(glue, name))
    }
    expect(glueSources([glue])).toEqual([
      join(glue, 'irv_wasm_frame.c'),
      join(glue, 'irv_wasm_stubs.c'),
    ])
  })
})

describe('the link command', () => {
  const objects = ['/repo/build/wasm/obj/src/main.o', '/repo/build/wasm/asm/data/a.o']
  const argv = linkCommand(paths, objects)

  it('runs emcc on the named objects and writes the module under build/wasm', () => {
    expect(argv[0]).toBe(paths.emcc)
    expect(argv).toEqual(expect.arrayContaining(objects))
    expect(argv[argv.indexOf('-o') + 1]).toBe('/repo/build/wasm/irv-emerald.js')
  })

  it('refuses an object outside build/wasm', () => {
    expect(() => linkCommand(paths, ['/repo/.cache/rom/expansion/build/emerald/main.o'])).toThrow(
      /outside \/repo\/build\/wasm/,
    )
  })

  it.each([
    '-sINVOKE_RUN=0',
    '-sMODULARIZE',
    '-sEXPORT_ES6',
    '-sENVIRONMENT=web,worker,node',
    '-sGLOBAL_BASE=134217728',
    '-sINITIAL_MEMORY=268435456',
    '-sALLOW_MEMORY_GROWTH=0',
    '-sSTACK_SIZE=1048576',
    '-sSUPPORT_LONGJMP=emscripten',
    '-sERROR_ON_UNDEFINED_SYMBOLS=1',
    '-sEXPORTED_FUNCTIONS=_AgbMain,_IrvWasm_Slot,_IrvWasm_Progress',
    '-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU16',
    '--profiling-funcs',
  ])('sets %s', (flag) => {
    expect(argv).toContain(flag)
  })

  it('links at -O2 unless asked for -O0', () => {
    expect(argv).toContain('-O2')
    expect(argv).not.toContain('-O0')
    expect(linkCommand(paths, objects, '-O0')).toContain('-O0')
    expect(linkCommand(paths, objects, '-O0')).not.toContain('-O2')
  })

  it('puts static data at the cartridge address, above every GBA memory range', () => {
    const settings = linkSettings()
    expect(settings.globalBase).toBe(0x08000000)
    expect(settings.initialMemory).toBeGreaterThan(settings.globalBase + settings.stackSize)
  })
})
