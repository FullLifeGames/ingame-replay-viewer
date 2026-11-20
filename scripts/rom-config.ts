// rom/gen3/build.json: the pinned upstream and the SHA1 of the base ROM the patch is made from.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface UpstreamPin {
  repository: string
  tag: string
  commit: string
}

export interface BuildConfig {
  upstream: UpstreamPin
  baseRom: { sha1: string }
}

export const ROM_DIR = fileURLToPath(new URL('../rom/gen3', import.meta.url))

const FULL_SHA1 = /^[0-9a-f]{40}$/

function field(value: unknown, path: string, pattern: RegExp): string {
  const found = path.split('.').reduce<unknown>((at, key) => {
    return typeof at === 'object' && at !== null ? (at as Record<string, unknown>)[key] : undefined
  }, value)
  if (typeof found !== 'string' || !pattern.test(found)) {
    throw new Error(`rom/gen3/build.json: ${path} must match ${String(pattern)}`)
  }
  return found
}

export function readBuildConfig(text: string): BuildConfig {
  const value: unknown = JSON.parse(text)
  return {
    upstream: {
      repository: field(value, 'upstream.repository', /^\S+$/),
      tag: field(value, 'upstream.tag', /^\S+$/),
      commit: field(value, 'upstream.commit', FULL_SHA1),
    },
    baseRom: { sha1: field(value, 'baseRom.sha1', FULL_SHA1) },
  }
}

export function loadBuildConfig(path = join(ROM_DIR, 'build.json')): BuildConfig {
  return readBuildConfig(readFileSync(path, 'utf8'))
}
