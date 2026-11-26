// A Pokémon's data as Black 2 stores it (#97), from pokebw2 at its pin, all by name: the party's
// and the four blocks' layouts, the table that places the blocks by the PID, the selector that
// picks the table's row, the step of the cipher's key, the bound below which a PID is shiny, the
// constants a Pokémon carries, and the whole lists of species, moves, items, abilities and
// natures. Each reader accepts the one shape it knows and throws naming the table or the function
// on any other. Part of build/gen5/bw2.json; nothing of pokebw2 is committed, and the errors name
// roles and show no number.
import type {
  BlockSelector,
  CipherStep,
  PkmNumbers,
  StructLayout,
} from '../src/gen5/bw2-numbers.ts'
import {
  bodyOf,
  closingBrace,
  defineValue,
  enumAround,
  literal,
  stripComments,
} from './gen5-bw2-c.ts'
import { checkedLayout } from './gen5-bw2-struct.ts'
import { listConstants } from './gen5-bw2-trainer.ts'

/** The files of the format beside the party's headers, which ENTRY_SOURCES reads already. */
export const PKM_SOURCES = {
  pokeToolC: 'src/system/poke_tool.c',
  pokemonH: 'include/constants/pokemon.h',
  languageH: 'include/constants/language.h',
  versionH: 'include/constants/version.h',
  speciesList: 'generated/species.txt',
  movesList: 'generated/moves.txt',
  itemsList: 'generated/items.txt',
  abilitiesList: 'generated/abilities.txt',
  naturesList: 'generated/natures.txt',
}

/** The texts of PKM_SOURCES by role, and the party's headers of ENTRY_SOURCES. */
export type PkmInput = Record<keyof typeof PKM_SOURCES | 'partyH' | 'mailH' | 'pmsH', string>

const BLOCK_TABLE = 'blockShufLUT'
const BLOCK_PICKER = 'PML_PkmGetParamBlockCore'
const CIPHER_STEP = 'PML_CryptoNextKey'
const SHINY_TEST = 'PML_UtilPIDIsRare'

/** Each block's struct and the enum entry that names its column of the block table. */
const BLOCKS: Readonly<Record<string, string>> = {
  PkmBlockA: 'PKM_DATA_BLOCK_A',
  PkmBlockB: 'PKM_DATA_BLOCK_B',
  PkmBlockC: 'PKM_DATA_BLOCK_C',
  PkmBlockD: 'PKM_DATA_BLOCK_D',
}

/** The structs of the format and the members the encoder writes or reads, which each must have. */
const LAYOUTS: Readonly<Record<string, readonly string[]>> = {
  PartyPkm: [
    'base.pid',
    'base.checksum',
    'base.contentBuffer',
    'statusCond',
    'level',
    'nowHP',
    'maxHP',
    'atk',
    'def',
    'spe',
    'spa',
    'spd',
  ],
  PokeParty: ['capacity', 'count', 'pkms', 'slotExists'],
  PkmBufferChunk: [],
  PkmBlockA: ['species', 'item', 'id', 'exp', 'friendship', 'ability', 'language'],
  PkmBlockB: [
    'moves',
    'pp',
    'ppUps',
    'hpIV',
    'atkIV',
    'defIV',
    'speIV',
    'spaIV',
    'spdIV',
    'isNicknamed',
    'gender',
    'form',
    'nature',
  ],
  PkmBlockC: ['nickname', 'originGame'],
  PkmBlockD: ['otName', 'ball', 'metLevel', 'otGender'],
}

/** The constants a Pokémon carries, each with the role of the file that defines it. */
const CONSTANTS: readonly (readonly [keyof PkmInput, string])[] = [
  ['partyH', 'PARTY_SIZE'],
  ['pokemonH', 'GENDER_MALE'],
  ['pokemonH', 'GENDER_FEMALE'],
  ['pokemonH', 'GENDER_UNKNOWN'],
  ['languageH', 'LANGUAGE_ENGLISH'],
  ['versionH', 'VERSION_BLACK2'],
]

const IDENT = '[A-Za-z_]\\w*'

/** The text inside the braces of the function `name`'s definition, comments gone, trimmed. */
function functionBody(source: string, name: string): string {
  try {
    return bodyOf(stripComments(source), `${name}(`).trim()
  } catch {
    throw new Error(`no body of ${name} in the source`)
  }
}

/** A table's declared dimension: a literal or a define of the source. */
const dimension = (code: string, text: string) => literal(text) ?? defineValue(code, text.trim())

function tableRows(body: string, table: string): (number | undefined)[][] {
  if (body.replace(/\{[^{}]*\}/g, '').replace(/[\s,]/g, '') !== '') {
    throw new Error(`${table}: the table holds something other than rows`)
  }
  return [...body.matchAll(/\{([^{}]*)\}/g)].map((row) =>
    (row[1] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '')
      .map(literal),
  )
}

/** The rows of `static const <type> table[rows][columns] = { { ... }, ... };`. */
export function blockTable(source: string, table: string): number[][] {
  const code = stripComments(source)
  const head = new RegExp(`\\b${table}\\s*\\[([^\\]]+)\\]\\s*\\[([^\\]]+)\\]\\s*=\\s*\\{`).exec(
    code,
  )
  if (head === null) throw new Error(`no table ${table}[rows][columns] = { ... } in the source`)
  const open = head.index + head[0].length - 1
  const rows = tableRows(code.slice(open + 1, closingBrace(code, open) - 1), table)
  const [height, width] = [dimension(code, head[1] ?? ''), dimension(code, head[2] ?? '')]
  if (rows.length !== height || rows.some((row) => row.length !== width)) {
    throw new Error(`${table}: a row is missing or holds another count of values than declared`)
  }
  if (rows.some((row) => row.includes(undefined))) {
    throw new Error(`${table}: a value is no plain number`)
  }
  return rows as number[][]
}

/** The mask and the shift in `table[(<pid> & <mask>) >> <shift>][<block>]`, the one use of the
 * table in the body of the function `picker`. */
export function blockSelector(source: string, picker: string, table: string): BlockSelector {
  const body = functionBody(source, picker)
  const pick = new RegExp(
    `\\b${table}\\s*\\[\\s*\\(\\s*${IDENT}\\s*&\\s*(\\w+)\\s*\\)\\s*>>\\s*(\\w+)\\s*\\]\\s*\\[\\s*${IDENT}\\s*\\]`,
  ).exec(body)
  const [mask, shift] = [literal(pick?.[1] ?? ''), literal(pick?.[2] ?? '')]
  const uses = body.match(new RegExp(`\\b${table}\\b`, 'g'))?.length ?? 0
  if (mask === undefined || shift === undefined || uses !== 1) {
    throw new Error(`${picker} picks no row of ${table} by a mask and a shift of the PID alone`)
  }
  return { mask, shift }
}

/** The numbers of a body that is exactly `*key = *key * <multiplier> + <increment>; return *key
 * >> <shift>;`, whatever the key's name. */
export function cipherStep(source: string, step: string): CipherStep {
  const shape = new RegExp(
    `^\\*\\s*(${IDENT})\\s*=\\s*\\*\\s*\\1\\s*\\*\\s*(\\w+)\\s*\\+\\s*(\\w+)\\s*;\\s*return\\s+\\*\\s*\\1\\s*>>\\s*(\\w+)\\s*;$`,
  ).exec(functionBody(source, step))
  const [multiplier, increment, shift] = [2, 3, 4].map((at) => literal(shape?.[at] ?? ''))
  if (multiplier === undefined || increment === undefined || shift === undefined) {
    throw new Error(`${step} is no step of a key by a product and a sum, returned shifted`)
  }
  return { multiplier, increment, shift }
}

/** True when `xor` is four terms joined by `^`, two naming the first argument and two the
 * second, each one alone: the XOR of both arguments' halves. */
function xorOfHalves(xor: string, args: readonly string[]): boolean {
  const named = xor
    .split('^')
    .map((term) => args.filter((arg) => new RegExp(`\\b${arg}\\b`).test(term)))
  const each = (arg: string) => named.filter((names) => names.length === 1 && names[0] === arg)
  return named.length === 4 && args.every((arg) => each(arg).length === 2)
}

/** The bound in a body that is exactly `return (<the XOR of both arguments' halves>) <
 * <bound>;`. */
export function shinyBound(source: string, test: string): number {
  const code = stripComments(source)
  const head = new RegExp(
    `\\b${test}\\s*\\(\\s*\\w+\\s+(\\w+)\\s*,\\s*\\w+\\s+(\\w+)\\s*\\)\\s*\\{`,
  )
  const args = (head.exec(code) ?? []).slice(1, 3)
  const shape = /^return\s+\(([^;]*)\)\s*<\s*(\w+)\s*;$/.exec(functionBody(source, test))
  const bound = literal(shape?.[2] ?? '')
  if (bound === undefined || args.length !== 2 || !xorOfHalves(shape?.[1] ?? '', args)) {
    throw new Error(`${test} compares no XOR of the halves of its two arguments with a plain bound`)
  }
  return bound
}

/** Throws unless each block fits its chunk and the content buffer holds one chunk per block. */
function checkBlocks(layouts: Readonly<Record<string, StructLayout>>): void {
  const chunk = layouts.PkmBufferChunk?.size ?? 0
  for (const name of Object.keys(BLOCKS)) {
    if ((layouts[name]?.size ?? Infinity) > chunk)
      throw new Error(`${name} runs past PkmBufferChunk`)
  }
  const buffer = layouts.PartyPkm?.fields['base.contentBuffer']?.size
  if (buffer !== chunk * Object.keys(BLOCKS).length) {
    throw new Error("PartyPkm's base.contentBuffer is not one PkmBufferChunk per block")
  }
}

/** Throws unless the table has a row for each value the selector gives, each row puts every
 * block on a chunk of its own, and the blocks' columns are the table's columns. */
function checkTable(pkm: PkmNumbers): void {
  const { blockOffsets, selector, blockColumns } = pkm
  if (selector.mask >>> selector.shift >= blockOffsets.length) {
    throw new Error(`${BLOCK_TABLE} has no row for a value ${BLOCK_PICKER} can give`)
  }
  const chunk = pkm.layouts.PkmBufferChunk?.size ?? 0
  const count = Object.keys(BLOCKS).length
  const own = (values: readonly number[], step: number) =>
    values.length === count &&
    [...values].sort((a, b) => a - b).every((value, at) => value === at * step)
  if (!blockOffsets.every((row) => own(row, chunk))) {
    throw new Error(`${BLOCK_TABLE}: a row does not put each block on a chunk of its own`)
  }
  if (!own(Object.values(blockColumns), 1)) {
    throw new Error(`the PKM_DATA_BLOCK entries do not give each block a column of ${BLOCK_TABLE}`)
  }
}

/** A Pokémon's data format, checked: each block fits its chunk, the buffer holds one chunk per
 * block, and the table places every block of every row the selector can pick. */
export function pkmNumbers(input: PkmInput): PkmNumbers {
  const headers = [input.partyH, input.mailH, input.pmsH].join('\n')
  const layouts = Object.fromEntries(
    Object.entries(LAYOUTS).map(([name, members]) => [name, checkedLayout(headers, name, members)]),
  )
  checkBlocks(layouts)
  const columns = enumAround(input.partyH, 'PKM_DATA_BLOCK_A')
  const pkm: PkmNumbers = {
    layouts,
    blockColumns: Object.fromEntries(
      Object.entries(BLOCKS).map(([name, entry]) => [name, columns[entry] ?? -1]),
    ),
    blockOffsets: blockTable(input.pokeToolC, BLOCK_TABLE),
    selector: blockSelector(input.pokeToolC, BLOCK_PICKER, BLOCK_TABLE),
    cipher: cipherStep(input.pokeToolC, CIPHER_STEP),
    shinyBelow: shinyBound(input.pokeToolC, SHINY_TEST),
    constants: Object.fromEntries(
      CONSTANTS.map(([role, name]) => [name, defineValue(input[role], name)]),
    ),
    species: listConstants(input.speciesList),
    moves: listConstants(input.movesList),
    items: listConstants(input.itemsList),
    abilities: listConstants(input.abilitiesList),
    natures: listConstants(input.naturesList),
  }
  checkTable(pkm)
  return pkm
}
