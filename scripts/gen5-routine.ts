// Builds the direct entry's routine (#97, rom/gen5/routine.c) with the ARM compiler into
// build/gen5/routine.json, which the page writes into the game's memory (ADR 0007). Nothing it
// writes is committed (ADR 0002). CI has no ARM compiler and builds nothing (D7).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { ORDER_MEMBERS, type RoutineBuild } from '../src/gen5/routine-order.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import {
  checkOrderMembers,
  cStructMembers,
  procOffsets,
  refuseDiffering,
  refuseRelocations,
  refuseUndefined,
} from './gen5-routine-text.ts'

/** The ARM compiler, which the build machine has and CI has not (D7). */
export const GCC = 'arm-none-eabi-gcc'

/** The compiler's flags; the README and the ledger give the reason for each. */
export const ROUTINE_FLAGS = [
  // The DS's main CPU (ARMv5TE), in Thumb as the game's own procs
  '-mcpu=arm946e-s',
  '-mthumb',
  '-Os',
  '-std=c11',
  // No library, no header, no builtin: every call goes through the order block
  '-ffreestanding',
  '-nostdinc',
  // Code that runs wherever the page puts it
  '-fPIC',
  // No unwind tables, whose entries name the compiler's library
  '-fno-asynchronous-unwind-tables',
  '-fno-unwind-tables',
  '-fno-ident',
  '-Wall',
  '-Wextra',
  '-Werror',
]

const tool = (name: string, args: string[]) => execFileSync(name, args, { encoding: 'utf8' })

interface Run {
  bytes: Uint8Array
  nm: string
}

/** One compile into a fresh folder: the object's checks, then its one code section's bytes. */
export function compileOnce(source: string): Run {
  const dir = mkdtempSync(join(tmpdir(), 'gen5-routine-'))
  try {
    const object = join(dir, 'routine.o')
    const binary = join(dir, 'routine.bin')
    tool(GCC, [...ROUTINE_FLAGS, '-c', source, '-o', object])
    refuseUndefined(tool('arm-none-eabi-nm', ['-u', object]))
    refuseRelocations(tool('arm-none-eabi-readelf', ['-r', object]))
    tool('arm-none-eabi-objcopy', ['-O', 'binary', '-j', '.text', object, binary])
    return { bytes: new Uint8Array(readFileSync(binary)), nm: tool('arm-none-eabi-nm', [object]) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Builds the routine twice and returns the build once both runs agree and every check passes. */
export function buildRoutine(source = GEN5_PATHS.routineSource): RoutineBuild {
  checkOrderMembers(cStructMembers(readFileSync(source, 'utf8'), 'OrderBlock'), ORDER_MEMBERS)
  const first = compileOnce(source)
  const second = compileOnce(source)
  refuseDiffering(first.bytes, second.bytes)
  const functions = procOffsets(first.nm)
  for (const [role, offset] of Object.entries(functions)) {
    if (offset >= first.bytes.length) throw new Error(`the proc's ${role} lies outside the code`)
  }
  return {
    bytes: [...first.bytes],
    size: first.bytes.length,
    functions,
    order: [...ORDER_MEMBERS],
    compiler: tool(GCC, ['--version']).split('\n')[0] ?? '',
    flags: [...ROUTINE_FLAGS],
    sha256: createHash('sha256').update(first.bytes).digest('hex'),
  }
}

function main(): void {
  const build = buildRoutine()
  mkdirSync(dirname(GEN5_PATHS.routineJson), { recursive: true })
  writeFileSync(GEN5_PATHS.routineJson, `${JSON.stringify(build, null, 2)}\n`)
  const lines = [
    `${String(build.size)} bytes, sha256 ${build.sha256}`,
    `order block of ${String(build.order.length)} words`,
    'wrote build/gen5/routine.json',
  ]
  process.stdout.write(lines.map((line) => `gen5-routine: ${line}\n`).join(''))
}

if (import.meta.main) main()
