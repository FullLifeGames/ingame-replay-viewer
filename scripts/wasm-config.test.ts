import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadWasmConfig, readWasmConfig, WASM_DIR } from './wasm-config.ts'

const valid = {
  emscripten: { version: '7.0.0' },
  platform: {
    repository: 'https://example.org/platform.git',
    commit: 'c'.repeat(40),
    files: ['src/platform/bios.c', 'include/platform/dma.h'],
    defines: ['RENDERER_EASY_DRAW'],
  },
  exclude: ['src/agb_flash.c'],
  defines: { 'src/recorded_battle.c': ['IRV_WASM_NO_SAVE_SIZE_ASSERTS', 'LEVEL=2'] },
  flags: { 'src/ow_abilities.c': ['-Wno-error=incompatible-function-pointer-types'] },
  jobs: 2,
}
const text = (value: unknown) => JSON.stringify(value)
const noCommit = Object.fromEntries(
  Object.entries(valid.platform).filter(([key]) => key !== 'commit'),
)
const platform = (change: object) => ({ ...valid, platform: { ...valid.platform, ...change } })

describe('the WebAssembly build config', () => {
  it('pins Emscripten 7.0.0, the platform commit and two jobs', () => {
    const config = loadWasmConfig()
    expect(config.emscripten.version).toBe('7.0.0')
    expect(config.platform.commit).toBe('db1cab3d2dc9f0e0a9f4a3d67983e5acf30a9a46')
    // random.c compiles from its overlay copy (patch 0009), with no define of its own.
    expect(config.defines).toEqual({ 'src/recorded_battle.c': ['IRV_WASM_NO_SAVE_SIZE_ASSERTS'] })
    expect(config.flags['src/ow_abilities.c']).toEqual([
      '-Wno-error=incompatible-function-pointer-types',
    ])
    // PORTABLE turns on the sound files' hand-off to the host and their PSG synthesis.
    expect(config.platform.defines).toEqual(['IRV_WASM_PLATFORM', 'RENDERER_EASY_DRAW', 'PORTABLE'])
    expect(config.platform.files).toEqual(
      expect.arrayContaining([
        'src/music_player.c',
        'src/sound_mixer.c',
        'src/platform/cgb_audio.c',
      ]),
    )
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
    ['a short platform commit', platform({ commit: 'db1cab3' }), /platform\.commit/],
    ['a version with a prefix', { ...valid, emscripten: { version: 'v7.0.0' } }, /emscripten/],
    ['no platform files', platform({ files: [] }), /files/],
    ['an excluded file outside src', { ...valid, exclude: ['../x.c'] }, /exclude/],
    ['an exclude that is no list', { ...valid, exclude: 'src/x.c' }, /exclude/],
    ['a define with a space', { ...valid, defines: { 'src/x.c': ['A B'] } }, /defines/],
    // -DRandom32=Other renames the file's own calls too (review W1): patch the file instead.
    ['a define that renames', { ...valid, defines: { 'src/x.c': ['A=B'] } }, /renames A to B/],
    ['a platform define that renames', platform({ defines: ['A=_b1'] }), /renames A to _b1/],
    ['defines for a file outside src', { ...valid, defines: { 'x.c': ['A'] } }, /defines/],
    ['a platform file that is no C file or header', platform({ files: ['src/a.s'] }), /files/],
    ['a platform define with a space', platform({ defines: ['A B'] }), /platform\.defines/],
    ['a flag that is no option', { ...valid, flags: { 'src/x.c': ['Wall'] } }, /flags\.src/],
    ['a flag with a space', { ...valid, flags: { 'src/x.c': ['-W all'] } }, /flags\.src/],
    ['flags for a file outside src', { ...valid, flags: { 'x.c': ['-Wall'] } }, /flags/],
    ['flags that are no map', { ...valid, flags: ['-Wall'] }, /flags/],
    ['zero jobs', { ...valid, jobs: 0 }, /jobs/],
    ['no object', [], /emscripten\.version/],
  ])('refuses %s', (_, value, message) => {
    expect(() => readWasmConfig(text(value))).toThrow(message)
  })
})
