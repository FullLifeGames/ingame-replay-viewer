// The send-out battles word their send-out lines through the phrase module, the one place that
// words "Go!" and "<trainer> sent out" (#92). The mock's lines stand out from the game's, so a line
// written by hand beside the module fails here.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import type { Mon } from '../src/gen3/text/names.ts'
import { sendOutStreams } from './wasm-sendouts.ts'
import type { SendOutAnimations } from './wasm-sendouts.ts'

vi.mock('../src/gen3/text/phrases-field.ts', () => ({
  sentOut: (mon: Mon, trainer: string) => `SENT:${mon.side}:${mon.name}:${trainer}`,
}))

// Two front animations far, one back set near.
const ANIMS: SendOutAnimations = {
  functions: ['ANIM_H_SLIDE', 'ANIM_V_SLIDE'],
  backSets: new Map([['BACK_ANIM_H_SLIDE', ['ANIM_H_SLIDE', 'ANIM_H_SLIDE', 'ANIM_H_SLIDE']]]),
  front: new Map([
    ['SPECIES_A', 'ANIM_H_SLIDE'],
    ['SPECIES_B', 'ANIM_V_SLIDE'],
  ]),
  back: new Map([['SPECIES_A', 'BACK_ANIM_H_SLIDE']]),
}

const SPECIES = { SPECIES_A: [1, 'Alpha'], SPECIES_B: [2, 'Beta'] } as const

describe('the send-out lines of the send-out battles', () => {
  it('come from the phrase module, with the far trainer for both sides', () => {
    const [battle, ...rest] = sendOutStreams(ANIMS, SPECIES, { near: 1, far: 2 })
    expect(rest).toEqual([])
    const prints = battle?.stream.instructions.flatMap((instruction) =>
      instruction.op === 'print' ? [instruction.text] : [],
    )
    expect(prints).toEqual([
      'Far would like to battle!',
      'SENT:far:Alpha:Far',
      'SENT:near:Alpha:Far',
      'SENT:far:Beta:Far',
    ])
  })
})

// src/gen3/ imports without file extensions, which plain Node cannot load, and rom:shots and
// wasm:run run in plain Node with the send-outs' name. So that name lives apart from the battles.
// Node starts and loads Vite: 1.4 s alone at load 7; the limit leaves room for a loaded check.
const PLAIN_NODE_LIMIT = 15_000

describe('the scripts that plain Node runs', () => {
  it(
    'load rom:shots and wasm:run, which name the send-out streams',
    { timeout: PLAIN_NODE_LIMIT },
    () => {
      const scripts = ['rom-shot.ts', 'wasm-run.ts'].map((name) =>
        fileURLToPath(new URL(name, import.meta.url)),
      )
      const code = scripts.map((path) => `await import(${JSON.stringify(path)})`).join('; ')
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        encoding: 'utf8',
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    },
  )
})
