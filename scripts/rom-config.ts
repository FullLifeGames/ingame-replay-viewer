// rom/gen3/build.json: the pinned upstream, the SHA1 of the base ROM the patch is made from, and
// the make job cap (3 keeps a build beside another session on devbox's 6 shared cores and 12 GB).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPO_DIR } from './rom-paths.ts'

export interface UpstreamPin {
  repository: string
  tag: string
  commit: string
}

export interface BuildConfig {
  upstream: UpstreamPin
  baseRom: { sha1: string }
  make: { jobs: number }
}

export const ROM_DIR = join(REPO_DIR, 'rom', 'gen3')

const FULL_SHA1 = /^[0-9a-f]{40}$/

function lookup(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => {
    return typeof at === 'object' && at !== null ? (at as Record<string, unknown>)[key] : undefined
  }, value)
}

function field(value: unknown, path: string, pattern: RegExp): string {
  const found = lookup(value, path)
  if (typeof found !== 'string' || !pattern.test(found)) {
    throw new Error(`rom/gen3/build.json: ${path} must match ${String(pattern)}`)
  }
  return found
}

function positiveInteger(value: unknown, path: string): number {
  const found = lookup(value, path)
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
    throw new Error(`rom/gen3/build.json: ${path} must be a positive integer`)
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
    make: { jobs: positiveInteger(value, 'make.jobs') },
  }
}

export function loadBuildConfig(path = join(ROM_DIR, 'build.json')): BuildConfig {
  return readBuildConfig(readFileSync(path, 'utf8'))
}
