import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadWasmConfig, readWasmConfig, WASM_DIR } from './wasm-config.ts'

const valid = {
  emscripten: { version: '7.0.0' },
  platform: {
    repository: 'https://example.org/platform.git',
    commit: 'c'.repeat(40),
    files: ['src/platform/bios.c'],
  },
  exclude: ['src/agb_flash.c'],
  defines: { 'src/random.c': ['Random32=IrvWasm_UnusedRandom32'] },
  jobs: 2,
}
const text = (value: unknown) => JSON.stringify(value)
const noCommit = { repository: valid.platform.repository, files: valid.platform.files }

describe('the WebAssembly build config', () => {
  it('pins Emscripten 7.0.0, the platform commit and two jobs', () => {
    const config = loadWasmConfig()
    expect(config.emscripten.version).toBe('7.0.0')
    expect(config.platform.commit).toBe('db1cab3d2dc9f0e0a9f4a3d67983e5acf30a9a46')
    expect(config.defines['src/random.c']).toEqual(['Random32=IrvWasm_UnusedRandom32'])
    expect(config.jobs).toBe(2)
  })

  it('points WASM_DIR at rom/gen3/wasm', () => {
    expect(existsSync(join(WASM_DIR, 'wasm.json'))).toBe(true)
  })

  it('reads a valid config', () => {
    expect(readWasmConfig(text(valid))).toEqual(valid)
  })

  it.each([
    ['no platform commit', { ...valid, platform: noCommit }, /platform\.commit/],
    [
      'a short platform commit',
      { ...valid, platform: { ...valid.platform, commit: 'db1cab3' } },
      /platform\.commit/,
    ],
    ['a version with a prefix', { ...valid, emscripten: { version: 'v7.0.0' } }, /emscripten/],
    ['no platform files', { ...valid, platform: { ...valid.platform, files: [] } }, /files/],
    ['an excluded file outside src', { ...valid, exclude: ['../x.c'] }, /exclude/],
    ['an exclude that is no list', { ...valid, exclude: 'src/x.c' }, /exclude/],
    ['a define with a space', { ...valid, defines: { 'src/x.c': ['A B'] } }, /defines/],
    ['defines for a file outside src', { ...valid, defines: { 'x.c': ['A'] } }, /defines/],
    ['zero jobs', { ...valid, jobs: 0 }, /jobs/],
    ['no object', [], /emscripten\.version/],
  ])('refuses %s', (_, value, message) => {
    expect(() => readWasmConfig(text(value))).toThrow(message)
  })
})
