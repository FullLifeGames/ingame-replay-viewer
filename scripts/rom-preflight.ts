// Checks before a ROM build (plan §6): the toolchain on PATH, enough free memory for a heavy run
// (AGENTS.md), and the user's base ROM by its SHA1. Each problem is one line for the user.
import { createHash } from 'node:crypto'
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export interface PreflightInput {
  pathVariable: string
  meminfo: string
  baseRomPath: string
  baseRomSha1: string
}

// The tools the build runs: the preflight requires each, and build-info.json records its version.
export const BUILD_TOOLS = [
  'arm-none-eabi-gcc',
  'arm-none-eabi-as',
  'arm-none-eabi-ld',
  'arm-none-eabi-nm',
  'make',
  'python3',
  'pkg-config',
]

// The packages of the expansion's docs/install/linux/UBUNTU.md, plus pkgconf for tools/gbagfx.
export const APT_PACKAGES = [
  'binutils-arm-none-eabi',
  'gcc-arm-none-eabi',
  'libnewlib-arm-none-eabi',
  'libpng-dev',
  'pkgconf',
]

export const APT_INSTALL =
  'sudo apt-get update && sudo apt-get install -y --no-install-recommends ' + APT_PACKAGES.join(' ')

const GIB = 1024 ** 3
const MIN_AVAILABLE = 3 * GIB

const DEFAULT_BASE_ROM = join(homedir(), 'roms', 'Pokemon - Emerald Version (USA, Europe).gba')

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function toolProblem(pathVariable: string): string | undefined {
  const dirs = pathVariable.split(delimiter).filter((dir) => dir !== '')
  const missing = BUILD_TOOLS.filter((tool) => !dirs.some((dir) => isExecutable(join(dir, tool))))
  if (missing.length === 0) return undefined
  return `missing ${missing.join(', ')}; install the build tools with: ${APT_INSTALL}`
}

function memoryProblem(meminfo: string): string | undefined {
  const match = /^MemAvailable:\s+(\d+) kB$/m.exec(meminfo)
  if (match === null) return 'no MemAvailable line in /proc/meminfo'
  const available = Number(match[1]) * 1024
  if (available >= MIN_AVAILABLE) return undefined
  const gib = (available / GIB).toFixed(1)
  return `only ${gib} GiB of memory available, the ROM build needs ${String(MIN_AVAILABLE / GIB)} GiB; let other heavy checks end first (free -g)`
}

function baseRomProblem(path: string, expectedSha1: string): string | undefined {
  if (!existsSync(path)) return `no base ROM at ${path}; set IRV_BASE_ROM to your US Emerald dump`
  const sha1 = createHash('sha1').update(readFileSync(path)).digest('hex')
  if (sha1 === expectedSha1) return undefined
  return `the base ROM ${path} has SHA1 ${sha1}, rom/gen3/build.json expects ${expectedSha1}`
}

export function preflightProblems(input: PreflightInput): string[] {
  return [
    toolProblem(input.pathVariable),
    memoryProblem(input.meminfo),
    baseRomProblem(input.baseRomPath, input.baseRomSha1),
  ].filter((problem) => problem !== undefined)
}

export function readPreflightInput(env: NodeJS.ProcessEnv, baseRomSha1: string): PreflightInput {
  return {
    pathVariable: env.PATH ?? '',
    meminfo: readFileSync('/proc/meminfo', 'utf8'),
    baseRomPath: env.IRV_BASE_ROM ?? DEFAULT_BASE_ROM,
    baseRomSha1,
  }
}
