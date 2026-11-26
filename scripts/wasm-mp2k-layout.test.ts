// The layout check of our layer's sound structs (#43, B8a): rom/gen3/wasm/src/irv_wasm_mp2k_layout.c
// holds each struct of layer/irv_mp2k_types.h against the game's include/gba/m4a_internal.h. The
// module's build compiles it with the glue; this spec compiles it alone for 32 bits, the module's
// pointer size, against the pinned tree, in seconds (the build machine: CI has no tree).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readerTree } from './rom-paths.ts'
import { WASM_DIR } from './wasm-config.ts'
import { LAYER_DIR } from './wasm-layer.ts'

const include = join(readerTree(), 'include')
const check = join(WASM_DIR, 'src', 'irv_wasm_mp2k_layout.c')

describe.skipIf(!existsSync(include))(
  "the sound structs against the game's header (pinned tree)",
  () => {
    it('hold every field at its offset and size on a 32-bit target', () => {
      const flags = [
        '-m32',
        '-ffreestanding',
        '-fsyntax-only',
        '-std=gnu17',
        '-Wall',
        '-Wextra',
        '-Werror',
      ]
      const result = spawnSync(
        process.env.CC ?? 'cc',
        [...flags, '-I', LAYER_DIR, '-I', include, check],
        { encoding: 'utf8' },
      )
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    })
  },
)
