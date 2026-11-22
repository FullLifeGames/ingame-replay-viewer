import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { applyBps } from '../src/patch/bps-apply.ts'
import { LINK_OUTPUTS } from './wasm-link.ts'
import { makeModulePatch, WASM_OUTPUT_NAMES, writeModulePatch } from './wasm-outputs.ts'

const sha1 = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('hex')

// A dump and a module that shares stretches of it at other offsets, as the module's data shares
// graphics and sound with the dump.
function fixture() {
  const base = new Uint8Array(64 * 1024).map((_, i) => (i * 7919) >> 3)
  const module = new Uint8Array(96 * 1024)
  module.set(Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0))
  module.set(base.subarray(4096, 20480), 1000)
  module.set(base.subarray(30000, 60000), 40000)
  return { base, module }
}

const scratch = mkdtempSync(join(tmpdir(), 'irv-wasm-outputs-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('the module patch', () => {
  it('is named irv-emerald-wasm.bps', () => {
    expect(WASM_OUTPUT_NAMES.patch).toBe('irv-emerald-wasm.bps')
  })

  it("gives the module's SHA1 when applied to the dump", () => {
    const { base, module } = fixture()
    const made = makeModulePatch(base, module)
    expect(sha1(applyBps(made.patch, base))).toBe(sha1(module))
    expect(made.sha1).toEqual({ module: sha1(module), patch: sha1(made.patch), base: sha1(base) })
    expect(made.patch.length).toBeLessThan(module.length / 2)
  })

  it('is written beside the module from the dump that has the SHA1 it is told', () => {
    const { base, module } = fixture()
    const dump = join(scratch, 'dump.gba')
    writeFileSync(dump, base)
    writeFileSync(join(scratch, LINK_OUTPUTS.wasm), module)
    const line = writeModulePatch(scratch, { path: dump, sha1: sha1(base) })
    const patch = new Uint8Array(readFileSync(join(scratch, WASM_OUTPUT_NAMES.patch)))
    expect(sha1(applyBps(patch, base))).toBe(sha1(module))
    expect(line).toBe(
      `${WASM_OUTPUT_NAMES.patch} ${String(patch.length)} B for ${LINK_OUTPUTS.wasm} ${String(module.length)} B`,
    )
  })

  it('is not made from a dump with another SHA1 or no dump at all', () => {
    const dump = join(scratch, 'other.gba')
    writeFileSync(dump, Uint8Array.of(1, 2, 3))
    expect(() => writeModulePatch(scratch, { path: dump, sha1: 'a'.repeat(40) })).toThrow(
      `the base ROM ${dump} has SHA1 ${sha1(Uint8Array.of(1, 2, 3))}, rom/gen3/build.json expects ${'a'.repeat(40)}`,
    )
    const none = join(scratch, 'none.gba')
    expect(() => writeModulePatch(scratch, { path: none, sha1: 'a'.repeat(40) })).toThrow(
      `no base ROM at ${none}; set IRV_BASE_ROM to your US Emerald dump`,
    )
  })
})
