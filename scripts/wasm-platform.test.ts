import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { withoutGitVariables } from './rom-git.ts'
import { ensurePlatform, platformFile, wasmRoots } from './wasm-platform.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-platform-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const run = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: withoutGitVariables(process.env),
  }).trim()

// A repository that stands in for the platform's upstream, with two commits.
function upstream(): { repository: string; first: string; second: string } {
  const repository = mkdtempSync(join(scratch, 'upstream-'))
  run(repository, 'init', '--quiet', '--initial-branch=main')
  run(repository, 'config', 'user.email', 'spec@example.invalid')
  run(repository, 'config', 'user.name', 'spec')
  run(repository, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
  mkdirSync(join(repository, 'src', 'platform'), { recursive: true })
  writeFileSync(join(repository, 'src', 'platform', 'bios.c'), 'int first;\n')
  run(repository, 'add', '.')
  run(repository, 'commit', '--quiet', '-m', 'first')
  const first = run(repository, 'rev-parse', 'HEAD')
  writeFileSync(join(repository, 'src', 'platform', 'bios.c'), 'int second;\n')
  run(repository, 'commit', '--quiet', '-am', 'second')
  return { repository, first, second: run(repository, 'rev-parse', 'HEAD') }
}

const checkoutIn = () => join(mkdtempSync(join(scratch, 'repo-')), '.cache', 'wasm', 'platform')

describe('the WebAssembly paths', () => {
  it('put the platform under .cache/wasm and the outputs under build/wasm', () => {
    const repo = mkdtempSync(join(scratch, 'repo-'))
    const real = realpathSync(repo)
    expect(wasmRoots(repo)).toEqual({
      cache: join(real, '.cache', 'wasm'),
      out: join(real, 'build', 'wasm'),
      platform: join(real, '.cache', 'wasm', 'platform'),
    })
  })
})

describe('the platform checkout', () => {
  it('fetches the pinned commit into a missing folder, shallow', () => {
    const { repository, first } = upstream()
    const checkout = checkoutIn()
    ensurePlatform(checkout, { repository, commit: first })
    expect(run(checkout, 'rev-parse', 'HEAD')).toBe(first)
    expect(run(checkout, 'rev-parse', '--is-shallow-repository')).toBe('true')
    expect(readFileSync(join(checkout, 'src', 'platform', 'bios.c'), 'utf8')).toBe('int first;\n')
  })

  it('keeps a checkout that is already at the pin', () => {
    const { repository, first } = upstream()
    const checkout = checkoutIn()
    ensurePlatform(checkout, { repository, commit: first })
    expect(() => {
      ensurePlatform(checkout, { repository: '/nowhere', commit: first })
    }).not.toThrow()
  })

  it('refuses a checkout at another commit', () => {
    const { repository, first, second } = upstream()
    const checkout = checkoutIn()
    ensurePlatform(checkout, { repository, commit: first })
    expect(() => {
      ensurePlatform(checkout, { repository, commit: second })
    }).toThrow(`HEAD ${first} is not the pinned commit ${second}`)
  })

  it('refuses a checkout with changes and leaves them', () => {
    const { repository, first } = upstream()
    const checkout = checkoutIn()
    ensurePlatform(checkout, { repository, commit: first })
    const bios = join(checkout, 'src', 'platform', 'bios.c')
    writeFileSync(bios, 'int changed;\n')
    expect(() => {
      ensurePlatform(checkout, { repository, commit: first })
    }).toThrow(/has changes: .*src\/platform\/bios\.c/)
    expect(readFileSync(bios, 'utf8')).toBe('int changed;\n')
  })

  it('refuses a folder that is not the top of a checkout', () => {
    const { repository, first } = upstream()
    expect(() => {
      ensurePlatform(join(repository, 'src'), { repository, commit: first })
    }).toThrow(/is not the top of a git checkout/)
  })
})

describe('a platform file', () => {
  it('lies inside the checkout', () => {
    expect(platformFile('/r/.cache/wasm/platform', 'src/platform/dma.c')).toBe(
      '/r/.cache/wasm/platform/src/platform/dma.c',
    )
  })

  it.each([['../dma.c'], ['/abs/dma.c'], ['src/../../dma.c']])('refuses %s', (file) => {
    expect(() => platformFile('/r/.cache/wasm/platform', file)).toThrow(file)
  })
})

describe('the WebAssembly scripts', () => {
  it('delete files only through the guard of rom-paths.ts', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const scripts = readdirSync(here).filter(
      (name) => /^wasm-.*\.ts$/.test(name) && !name.endsWith('.test.ts'),
    )
    expect(scripts.length).toBeGreaterThan(5)
    const deleting = scripts.filter((name) =>
      /\b(?:rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink)\(/.test(
        readFileSync(join(here, name), 'utf8'),
      ),
    )
    expect(deleting).toEqual([])
  })
})
