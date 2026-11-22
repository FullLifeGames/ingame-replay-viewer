import { describe, expect, it } from 'vitest'

import { wasmPaths } from './wasm-compile.ts'
import { convertTargets, dataObjects, signatureObjects } from './wasm-convert.ts'

const paths = { build: '/repo/.cache/rom/expansion/build/emerald', out: '/repo/build/wasm' }

describe('the data objects of the tree', () => {
  it('takes data/*.o and every object under sound/, and nothing from src/', () => {
    const listing = ['data/maps.o', 'data/maps.d', 'sound/songs/midi/mus_x.o', 'src/main.o']
    expect(dataObjects(listing)).toEqual(['data/maps.o', 'sound/songs/midi/mus_x.o'])
  })
})

describe('the targets of wasm:convert', () => {
  it('writes the assembly and the object under build/wasm/asm', () => {
    expect(convertTargets(['data/battle_scripts_1.o'], paths)).toEqual([
      {
        object: 'data/battle_scripts_1.o',
        elf: '/repo/.cache/rom/expansion/build/emerald/data/battle_scripts_1.o',
        asm: '/repo/build/wasm/asm/data/battle_scripts_1.s',
        wasm: '/repo/build/wasm/asm/data/battle_scripts_1.o',
      },
    ])
  })

  it.each([['../src/main.o'], ['/abs/data/maps.o'], ['data/maps.s']])('refuses %s', (object) => {
    expect(() => convertTargets([object], paths)).toThrow(object)
  })
})

// build/wasm/obj also holds the census's -O0 objects of excluded files; their prototypes must not
// give a data object its function types (review U1).
describe('the C objects that give the function types', () => {
  const build = wasmPaths('/repo')
  const records: Record<string, { source: string; ok: boolean }[]> = {
    'compile.json': [{ source: 'src/main.c', ok: true }],
    'glue.json': [{ source: 'glue/irv_wasm_frame.c', ok: true }],
  }

  it('are the objects compile.json and glue.json record, and no other', () => {
    expect(signatureObjects(build, (name) => records[name] ?? [])).toEqual([
      '/repo/build/wasm/obj/src/main.o',
      '/repo/build/wasm/obj/glue/irv_wasm_frame.o',
    ])
  })

  it('refuse a record with a failed file', () => {
    const failed: typeof records = {
      ...records,
      'glue.json': [{ source: 'glue/irv_wasm_frame.c', ok: false }],
    }
    expect(() => signatureObjects(build, (name) => failed[name] ?? [])).toThrow(
      /glue\.json records failed files: glue\/irv_wasm_frame\.c/,
    )
  })
})
