import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  buildHost,
  hostCommand,
  LAYER_DIR,
  layerInput,
  layerSources,
  readLayerOutput,
} from './wasm-layer.ts'
import { glueSources } from './wasm-link.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-layer-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function touch(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '')
}

describe('the C files of our platform layer', () => {
  it('are the C files of rom/gen3/wasm/layer, sorted, without headers and without the harness', () => {
    const layer = join(scratch, 'layer')
    for (const name of ['irv_sine.c', 'irv_bios.c', 'irv_bios.h', 'host/irv_layer_host.c']) {
      touch(join(layer, name))
    }
    expect(layerSources(layer)).toEqual([join(layer, 'irv_bios.c'), join(layer, 'irv_sine.c')])
  })

  it('enter the module with the glue', () => {
    const sources = glueSources()
    const layer = layerSources().filter((source) => !source.includes('/irv_mp2k_'))
    expect(sources).toEqual(expect.arrayContaining(layer))
    expect(sources).toEqual(
      expect.arrayContaining([expect.stringMatching(/src\/irv_wasm_frame\.c$/)]),
    )
    expect(sources.some((source) => source.includes('/host/'))).toBe(false)
  })

  it('keep the sequencer and its layout check out of the module until the sound swap (B8b)', () => {
    const sequencer = layerSources().filter((source) => source.includes('/irv_mp2k_'))
    expect(sequencer.length).toBeGreaterThan(0)
    expect(glueSources().filter((source) => /\/irv_(wasm_)?mp2k_/.test(source))).toEqual([])
    expect(hostCommand('/tmp/out/irv_layer_host', {})).toEqual(expect.arrayContaining(sequencer))
  })

  it('may not share a name with a file of the glue, whose objects share one folder', () => {
    const glue = join(scratch, 'glue-a')
    const layer = join(scratch, 'layer-a')
    touch(join(glue, 'irv_bios.c'))
    touch(join(layer, 'irv_bios.c'))
    expect(() => glueSources([glue, layer])).toThrow(/irv_bios\.c.*twice/)
  })
})

describe('the host harness', () => {
  it("compiles the layer natively with the module's file list and warnings as errors", () => {
    const argv = hostCommand('/tmp/out/irv_layer_host', {})
    expect(argv[0]).toBe('cc')
    expect(argv).toEqual(
      expect.arrayContaining(['-std=gnu17', '-Wall', '-Wextra', '-Werror', '-DIRV_HOST']),
    )
    expect(argv).toEqual(expect.arrayContaining(layerSources()))
    const host = ['irv_layer_host.c', 'irv_layer_host_script.c'].map((name) =>
      join(LAYER_DIR, 'host', name),
    )
    expect(argv).toEqual(expect.arrayContaining(host))
    expect(argv.slice(-2)).toEqual(['-o', '/tmp/out/irv_layer_host'])
  })

  it('takes the compiler from CC', () => {
    expect(hostCommand('/tmp/h', { CC: 'clang' })[0]).toBe('clang')
  })

  it('fails with the install line when there is no compiler', () => {
    expect(() => buildHost(scratch, { CC: 'irv-no-such-cc' })).toThrow(
      /no C compiler irv-no-such-cc.*apt install gcc/,
    )
  })
})

describe('the harness protocol', () => {
  it('sends the arguments, the source and the destination, little-endian, each with its length', () => {
    const input = layerInput({ args: [7, 0x01020304], src: [0xaa], dest: new Uint8Array(2) })
    expect(Array.from(input)).toEqual([
      2, 0, 0, 0, 7, 0, 0, 0, 4, 3, 2, 1, 1, 0, 0, 0, 0xaa, 2, 0, 0, 0, 0, 0,
    ])
  })

  it('reads the result and the destination back', () => {
    const output = readLayerOutput(Uint8Array.from([0x34, 0x12, 0, 0, 9, 8]))
    expect(output.result).toBe(0x1234)
    expect(Array.from(output.dest)).toEqual([9, 8])
  })

  it('refuses an output too short to hold a result', () => {
    expect(() => readLayerOutput(new Uint8Array(3))).toThrow(/3 bytes/)
  })
})
