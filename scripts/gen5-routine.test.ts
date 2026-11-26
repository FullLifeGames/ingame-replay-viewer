// The routine's real build: it needs the ARM compiler, which the build machine has and CI has not.
// D7 keeps every compile out of CI, so this spec skips where the compiler is absent; the specs
// beside it check the C file and the tools' output as text everywhere.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ORDER_MEMBERS } from '../src/gen5/routine-order.ts'
import { buildRoutine, compileOnce, GCC } from './gen5-routine.ts'

const hasCompiler = spawnSync(GCC, ['--version']).status === 0

describe.skipIf(!hasCompiler)('buildRoutine', () => {
  it('builds code with no relocation, the same on both runs, its functions inside it', () => {
    const build = buildRoutine()
    expect(build.size).toBe(build.bytes.length)
    expect(build.size).toBeGreaterThan(0)
    expect(build.order).toEqual([...ORDER_MEMBERS])
    expect(build.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(build.compiler).toMatch(/arm-none-eabi-gcc/)
    const offsets = Object.values(build.functions)
    expect(new Set(offsets).size).toBe(3)
    for (const offset of offsets) {
      expect(offset % 2).toBe(0)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(build.size)
    }
  })
})

// Invented C files: the tools' real output reaches the refusals the text specs check.
describe.skipIf(!hasCompiler)('compileOnce', () => {
  const compile = (source: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'gen5-routine-spec-'))
    try {
      const file = join(dir, 'spin.c')
      writeFileSync(file, source)
      return compileOnce(file)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('refuses a variable of its own, which needs a relocation', () => {
    expect(() => compile('static int spins;\nint spin(void) { return ++spins; }\n')).toThrow(
      /relocation/,
    )
  })

  it("refuses a division, which calls into the compiler's library", () => {
    expect(() => compile('unsigned spin(unsigned a, unsigned b) { return a / b; }\n')).toThrow(
      /compiler's library/,
    )
  })
})
