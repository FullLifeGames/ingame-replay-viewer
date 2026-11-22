// What the WebAssembly build hands to the spike page (#35, plan D5 (c)): a BPS patch from the
// user's dump to the module, so the page rebuilds build/wasm/irv-emerald.wasm from the dump as it
// rebuilds the ROM (scripts/rom-outputs.ts). The patch counts only once it gives the module back.
// The module and the patch hold Nintendo's data and stay in build/wasm (ADR 0002).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBps } from '../src/patch/bps-create.ts'
import { checkRoundTrip } from './rom-outputs.ts'
import { baseRomProblem } from './rom-preflight.ts'
import { LINK_OUTPUTS } from './wasm-link.ts'

// The file in build/wasm/ that the dev server serves beside the glue.
export const WASM_OUTPUT_NAMES = { patch: 'irv-emerald-wasm.bps' } as const

export interface ModulePatch {
  patch: Uint8Array
  sha1: { module: string; patch: string; base: string }
}

const sha1 = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('hex')

export function makeModulePatch(base: Uint8Array, module: Uint8Array): ModulePatch {
  const patch = createBps(base, module)
  checkRoundTrip(patch, base, module)
  return { patch, sha1: { module: sha1(module), patch: sha1(patch), base: sha1(base) } }
}

/** The dump by the build's rule (IRV_BASE_ROM or ~/roms/) and the SHA1 build.json names. */
export interface BaseRom {
  path: string
  sha1: string
}

/** Writes the patch from the dump to `dir`'s module beside it; returns the line with both sizes. */
export function writeModulePatch(dir: string, base: BaseRom): string {
  const problem = baseRomProblem(base.path, base.sha1)
  if (problem !== undefined) throw new Error(problem)
  const module = readFileSync(join(dir, LINK_OUTPUTS.wasm))
  const { patch } = makeModulePatch(readFileSync(base.path), module)
  writeFileSync(join(dir, WASM_OUTPUT_NAMES.patch), patch)
  return `${WASM_OUTPUT_NAMES.patch} ${String(patch.length)} B for ${LINK_OUTPUTS.wasm} ${String(module.length)} B`
}
