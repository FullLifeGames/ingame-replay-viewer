// The platform layer of the WebAssembly build (#35, plan D7): the pinned repository of wasm.json,
// fetched shallow at its commit into .cache/wasm/platform. It is never committed and never copied
// into rom/gen3/wasm; the build copies the files it compiles into build/wasm and patches them
// there, so the checkout stays as fetched. A checkout at another commit or with changes is refused.
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'

import { git } from './rom-git.ts'
import type { RomRoots } from './rom-paths.ts'

export interface PlatformPin {
  repository: string
  commit: string
}

// The delete guard of rom-paths.ts takes these roots as it takes the ROM build's.
export interface WasmRoots extends RomRoots {
  platform: string
}

export function wasmRoots(repoDir: string): WasmRoots {
  const repo = realpathSync(repoDir)
  const cache = join(repo, '.cache', 'wasm')
  return { cache, out: join(repo, 'build', 'wasm'), platform: join(cache, 'platform') }
}

function checkPlatform(checkout: string, pin: PlatformPin): void {
  const top = git(checkout, ['rev-parse', '--show-toplevel']).trim()
  if (realpathSync(top) !== realpathSync(checkout)) {
    throw new Error(`${checkout} is not the top of a git checkout`)
  }
  const head = git(checkout, ['rev-parse', 'HEAD']).trim()
  if (head !== pin.commit) {
    throw new Error(`${checkout}: HEAD ${head} is not the pinned commit ${pin.commit}`)
  }
  const changes = git(checkout, ['status', '--porcelain', '--untracked-files=all']).trim()
  if (changes !== '') {
    throw new Error(`${checkout} has changes: ${changes.split('\n').join('; ')}`)
  }
}

export function ensurePlatform(checkout: string, pin: PlatformPin): void {
  if (!existsSync(checkout)) {
    mkdirSync(dirname(checkout), { recursive: true })
    git(dirname(checkout), ['init', '--quiet', checkout])
    git(checkout, ['fetch', '--quiet', '--depth', '1', '--no-tags', pin.repository, pin.commit])
    git(checkout, ['checkout', '--quiet', '--detach', 'FETCH_HEAD'])
  }
  checkPlatform(checkout, pin)
}

// A file of wasm.json's platform list, inside the checkout.
export function platformFile(checkout: string, file: string): string {
  const clean = normalize(file)
  if (isAbsolute(file) || clean === '..' || clean.startsWith(`..${sep}`)) {
    throw new Error(`the platform file ${file} lies outside ${checkout}`)
  }
  return join(checkout, clean)
}
