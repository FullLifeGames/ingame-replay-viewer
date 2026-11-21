// Running the expansion's make (plan §6) and recording the toolchain it ran with. Plain `make`, no
// release flavour (plan §13, ruling 5), with a pinned locale, time zone and hash seed so that two
// builds give the same ROM.
import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'

import { withoutGitVariables } from './rom-git.ts'

export interface MakeOptions {
  tree: string
  jobs: number
  logPath: string
  env: NodeJS.ProcessEnv
}

// DEVKITARM switches the toolchain, the make variables leak a parent make's flags, and
// GITHUB_REPOSITORY_OWNER turns on upstream's own warning flags (Makefile:183-193). The GIT_*
// variables go by the rule of rom-git.ts.
const DROPPED = new Set([
  'DEVKITARM',
  'MAKEFLAGS',
  'MFLAGS',
  'MAKELEVEL',
  'GITHUB_REPOSITORY_OWNER',
])

const PINNED = { LC_ALL: 'C', TZ: 'UTC', PYTHONHASHSEED: '0' }

const LOG_TAIL_LINES = 20

export function makeEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = Object.entries(withoutGitVariables(env)).filter(([key]) => !DROPPED.has(key))
  return { ...Object.fromEntries(kept), ...PINNED }
}

function logTail(logPath: string): string {
  const lines = readFileSync(logPath, 'utf8').trimEnd().split('\n')
  return lines.slice(-LOG_TAIL_LINES).join('\n')
}

// `-O` keeps each target's output together, so an error in the log sits next to its command.
// make runs in makeEnvironment(env), so no caller can forget the pins.
export function runMake(options: MakeOptions): void {
  const log = openSync(options.logPath, 'w')
  try {
    const result = spawnSync('make', [`-j${String(options.jobs)}`, '-O'], {
      cwd: options.tree,
      env: makeEnvironment(options.env),
      stdio: ['ignore', log, log],
    })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) {
      const status = result.status ?? `signal ${String(result.signal)}`
      throw new Error(
        `make failed with status ${String(status)}; see ${options.logPath}:\n${logTail(options.logPath)}`,
      )
    }
  } finally {
    closeSync(log)
  }
}

// The linker's --print-memory-usage table (Makefile:580) has one row per memory region.
export function readRomUsage(log: string): string | undefined {
  const match = /^\s*ROM:\s+(\d+ \w+)\s+(\d+ \w+)\s+([\d.]+%)\s*$/m.exec(log)
  if (match === null) return undefined
  return `ROM: ${match[1] as string} of ${match[2] as string}, ${match[3] as string}`
}

function firstLine(command: string, args: string[], env: NodeJS.ProcessEnv): string | undefined {
  const result = spawnSync(command, args, { encoding: 'utf8', env })
  if (result.error !== undefined || result.status !== 0) return undefined
  return result.stdout.split('\n')[0]?.trim()
}

export function toolVersions(tools: string[], env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    tools.map((tool) => [tool, firstLine(tool, ['--version'], env) ?? 'missing']),
  )
}

export function packageVersions(
  packages: string[],
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  return Object.fromEntries(
    packages.map((name) => [
      name,
      firstLine('dpkg-query', ['-W', '-f=${Version}', name], env) ?? 'not installed',
    ]),
  )
}
