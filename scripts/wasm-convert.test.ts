import { describe, expect, it } from 'vitest'

import { convertTargets, dataObjects } from './wasm-convert.ts'

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
