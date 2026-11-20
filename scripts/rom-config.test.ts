import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadBuildConfig, readBuildConfig, ROM_DIR } from './rom-config.ts'

const valid = {
  upstream: { repository: 'https://example.org/x.git', tag: 'v1', commit: 'a'.repeat(40) },
  baseRom: { sha1: 'b'.repeat(40) },
}
const text = (value: unknown) => JSON.stringify(value)

describe('the build config', () => {
  it('pins the 1.17.2 tag to its full commit and the US Emerald SHA1', () => {
    expect(loadBuildConfig()).toEqual({
      upstream: {
        repository: 'https://github.com/rh-hideout/pokeemerald-expansion.git',
        tag: 'expansion/1.17.2',
        commit: '79dd436920845ebc145577649de624f65298c209',
      },
      baseRom: { sha1: 'f3ae088181bf583e55daf962a92bb46f4f1d07b7' },
    })
  })

  it('points ROM_DIR at rom/gen3', () => {
    expect(existsSync(join(ROM_DIR, 'build.json'))).toBe(true)
  })

  it('reads a valid config', () => {
    expect(readBuildConfig(text(valid))).toEqual(valid)
  })

  it.each([
    [
      'a short commit',
      { ...valid, upstream: { ...valid.upstream, commit: '79dd436' } },
      /upstream\.commit/,
    ],
    ['an empty tag', { ...valid, upstream: { ...valid.upstream, tag: '' } }, /upstream\.tag/],
    [
      'no repository',
      { ...valid, upstream: { tag: 'v1', commit: 'a'.repeat(40) } },
      /upstream\.repository/,
    ],
    ['an upper-case SHA1', { ...valid, baseRom: { sha1: 'B'.repeat(40) } }, /baseRom\.sha1/],
    ['no baseRom', { upstream: valid.upstream }, /baseRom\.sha1/],
    ['no object', [], /upstream\.repository/],
  ])('refuses %s', (_, value, message) => {
    expect(() => readBuildConfig(text(value))).toThrow(message)
  })
})
