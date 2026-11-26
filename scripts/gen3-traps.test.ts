// P2 for the partial traps (pinned tree): each row of the pinned `gWrappedStringIds`
// (`src/battle_message.c`) names a trapping move in its `// MOVE_*` comment and the message the game
// prints when that move traps a Pokémon. `phrases-effects.ts` keys the trap start lines by move id,
// so this spec ties those ids to the table: a Gen 3 move starts with the template of its row's
// message, and a later move keeps our phrase and its fallback. The file is read in place, and the
// spec skips without the pinned tree, as `gen3-phrases.test.ts` does.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import type { Mon } from '../src/gen3/text/names.ts'
import { EFFECT_TEMPLATES, effectStarted } from '../src/gen3/text/phrases-effects.ts'
import type { AnyTemplate } from '../src/gen3/text/template.ts'
import { readerTree } from './rom-paths.ts'

const TABLE = /gWrappedStringIds\[\w*\]\s*=\s*\{([^}]*)\}/
const ROW = /=\s*(STRINGID_\w+),\s*\/\/\s*MOVE_(\w+)/g

/** The rows of `gWrappedStringIds` as [move name, message id], the move named by @pkmn/dex. */
function wrappedRows(file: string): [string, string][] {
  const table = TABLE.exec(file)?.[1] ?? ''
  return [...table.matchAll(ROW)].map(([, message = '', move = '']) => [
    Dex.moves.get(move).name,
    message,
  ])
}

const TRAPPED: Mon = { side: 'far', name: 'Tyranitar' }
const TRAPPER: Mon = { side: 'near', name: 'Dugtrio' }

const templateOf = (id: string): AnyTemplate | undefined =>
  Object.values(EFFECT_TEMPLATES).find((template) => template.id === id)

/** The template's line for the trapped Pokémon, with the trapper where the message names it. */
const render = (template: AnyTemplate) =>
  (template.render as (...mons: readonly Mon[]) => string)(TRAPPED, TRAPPER)

describe('the rows of gWrappedStringIds', () => {
  it('read the message and the move of each row', () => {
    const file = [
      'const u16 gWrappedStringIds[NUM_TRAPPING_MOVES] =',
      '{',
      '    [B_MSG_WRAPPED_BIND]        = STRINGID_PKMNSQUEEZEDBYBIND,     // MOVE_BIND',
      '    [B_MSG_WRAPPED_FIRE_SPIN]   = STRINGID_PKMNTRAPPEDINVORTEX,    // MOVE_FIRE_SPIN',
      '};',
      'const u16 gMistUsedStringIds[] =',
      '{',
      '    [B_MSG_MIST]                = STRINGID_PKMNSHROUDEDINMIST,     // MOVE_MIST',
      '};',
    ].join('\n')
    expect(wrappedRows(file)).toEqual([
      ['Bind', 'STRINGID_PKMNSQUEEZEDBYBIND'],
      ['Fire Spin', 'STRINGID_PKMNTRAPPEDINVORTEX'],
    ])
  })
})

const file = join(readerTree(), 'src', 'battle_message.c')

describe.skipIf(!existsSync(file))('the trap start lines against gWrappedStringIds (P2)', () => {
  const rows = existsSync(file) ? wrappedRows(readFileSync(file, 'utf8')) : []
  const inGen3 = (move: string) => Dex.moves.get(move).gen <= 3

  it('reads a row for every trapping move of Gen 3', () => {
    const traps = Dex.moves
      .all()
      .filter((move) => move.volatileStatus === 'partiallytrapped' && move.gen <= 3)
    const names = rows.map(([move]) => move).filter(inGen3)
    expect(names.toSorted()).toEqual(traps.map((move) => move.name).toSorted())
  })

  it.each(rows.filter(([move]) => inGen3(move)))('%s starts with %s', (move, message) => {
    const template = templateOf(message)
    expect(template, `a template tagged ${message}`).toBeDefined()
    const line = template && render(template)
    expect(effectStarted(TRAPPED, { name: move, kind: 'move' }, TRAPPER)).toEqual({ text: line })
  })

  it.each(rows.filter(([move]) => !inGen3(move)))('%s after Gen 3 keeps a fallback', (move) => {
    expect(effectStarted(TRAPPED, { name: move, kind: 'move' }, TRAPPER).fallback).toBeDefined()
  })
})
