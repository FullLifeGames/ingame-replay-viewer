import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadWasmConfig, readWasmConfig, WASM_DIR } from './wasm-config.ts'

const valid = {
  emscripten: { version: '7.0.0' },
  exclude: ['src/agb_flash.c'],
  defines: { 'src/recorded_battle.c': ['IRV_WASM_NO_SAVE_SIZE_ASSERTS', 'LEVEL=2'] },
  flags: { 'src/ow_abilities.c': ['-Wno-error=incompatible-function-pointer-types'] },
  jobs: 2,
}
const text = (value: unknown) => JSON.stringify(value)
const borrowed = {
  repository: 'https://example.org/platform.git',
  commit: 'c'.repeat(40),
  files: ['include/platform.h'],
  defines: ['PORTABLE'],
}

describe('the WebAssembly build config', () => {
  it('pins Emscripten 7.0.0 and two jobs, and borrows no platform files', () => {
    const config = loadWasmConfig()
    expect(config.emscripten.version).toBe('7.0.0')
    // Our platform layer stands in for the borrowed one (#43): wasm.json pins no checkout.
    expect(Object.keys(config).sort()).toEqual([
      'defines',
      'emscripten',
      'exclude',
      'flags',
      'jobs',
    ])
    // random.c compiles from its overlay copy (patch 0009), with no define of its own.
    expect(config.defines).toEqual({ 'src/recorded_battle.c': ['IRV_WASM_NO_SAVE_SIZE_ASSERTS'] })
    expect(config.flags['src/ow_abilities.c']).toEqual([
      '-Wno-error=incompatible-function-pointer-types',
    ])
    expect(config.jobs).toBe(2)
  })

  it('points WASM_DIR at rom/gen3/wasm', () => {
    expect(existsSync(join(WASM_DIR, 'wasm.json'))).toBe(true)
  })

  it('reads a valid config', () => {
    expect(readWasmConfig(text(valid))).toEqual(valid)
  })

  it.each([
    ['a version with a prefix', { ...valid, emscripten: { version: 'v7.0.0' } }, /emscripten/],
    ['an excluded file outside src', { ...valid, exclude: ['../x.c'] }, /exclude/],
    ['an exclude that is no list', { ...valid, exclude: 'src/x.c' }, /exclude/],
    ['a define with a space', { ...valid, defines: { 'src/x.c': ['A B'] } }, /defines/],
    // -DRandom32=Other renames the file's own calls too (review W1): patch the file instead.
    ['a define that renames', { ...valid, defines: { 'src/x.c': ['A=B'] } }, /renames A to B/],
    ['defines for a file outside src', { ...valid, defines: { 'x.c': ['A'] } }, /defines/],
    ['a flag that is no option', { ...valid, flags: { 'src/x.c': ['Wall'] } }, /flags\.src/],
    ['a flag with a space', { ...valid, flags: { 'src/x.c': ['-W all'] } }, /flags\.src/],
    ['flags for a file outside src', { ...valid, flags: { 'x.c': ['-Wall'] } }, /flags/],
    ['flags that are no map', { ...valid, flags: ['-Wall'] }, /flags/],
    ['zero jobs', { ...valid, jobs: 0 }, /jobs/],
    ['no object', [], /emscripten\.version/],
    // A field it does not know would change nothing, silently; the borrowed checkout is one.
    ['the borrowed platform checkout', { ...valid, platform: borrowed }, /platform is no field/],
    ['a field with a slip', { ...valid, job: 2 }, /job is no field/],
  ])('refuses %s', (_, value, message) => {
    expect(() => readWasmConfig(text(value))).toThrow(message)
  })
})
