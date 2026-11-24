// The send-out streams (#66): one send-out for each animation of a Pokémon's sprite that the
// pinned expansion's species tables hold, so both engines play every one. A far send-out plays the
// species' front animation (`.frontAnimId`, DoMonFrontSpriteAnimation in src/pokemon.c); a near
// one plays a function of the species' back set (`.backAnimId`), and the mon's nature picks which
// of the set's three (LaunchAnimationTaskForBackSprite in src/pokemon_animation.c). The stream sets
// no nature, so a back set counts as reached and the function inside it is the game's pick.
//
// A team holds six mons, and a battle sends out no species its team lacks, so the streams are
// several battles: each sends out six far species, one after the other by WITHDRAW and SWITCH_IN,
// and up to six near ones the same way; a battle past the near species sends out the first one.
// Each send-out follows its line, as in the game, and the intro's line comes first, so both ball
// displays are up before the first one. No stream format changes. For each animation the species
// with the lowest number plays it.
import type { Instruction, Party, Stream, StreamMon } from '../src/gen3/stream/instructions.ts'
import type { Side } from '../src/script/types.ts'
import { parseEntryFields } from './gen3-parse.ts'
import { speciesFiles } from './gen3-tables.ts'

type ReadTree = (path: string) => string

/** species.json of src/gen3/tables/: number and display name by SPECIES_* constant. */
type SpeciesTable = Readonly<Record<string, readonly (number | string | null)[]>>

function numberOf(species: SpeciesTable, constant: string): number {
  const number = species[constant]?.[0]
  return typeof number === 'number' ? number : 0
}

/** The name of the streams for rom:shots and wasm:run; each battle adds its number. */
export const SEND_OUTS = 'send-outs'

const ANIMATION_C = 'src/pokemon_animation.c'
const CONFIG = 'include/config/pokemon.h'
const PARTY_SIZE = 6
// GetSpeciesBackAnimSet gives BACK_ANIM_NONE's species the first set, so it adds no animation.
const NO_BACK_SET = 'BACK_ANIM_NONE'

export interface SendOutAnimations {
  /** The ANIM_* constant of each function in sMonAnimFunctions, in the table's order. */
  readonly functions: readonly string[]
  /** The three functions of each back set (sBackAnimationIds), by its BACK_ANIM_* constant. */
  readonly backSets: ReadonlyMap<string, readonly string[]>
  /** Each species' front animation, by SPECIES_* constant. */
  readonly front: ReadonlyMap<string, string>
  /** Each species' back set, by SPECIES_* constant. */
  readonly back: ReadonlyMap<string, string>
}

export interface SendOutStream {
  readonly name: string
  readonly stream: Stream
}

function tableBody(text: string, name: string): string {
  const body = new RegExp(String.raw`\b${name}\[\][^=]*=\s*\{([^}]*)\}`).exec(text)?.[1]
  if (body === undefined) throw new Error(`${ANIMATION_C} has no table ${name}`)
  return body.replace(/\/\/[^\n]*/g, '')
}

function readBackSets(text: string): Map<string, readonly string[]> {
  const row =
    /\[\(\s*(BACK_ANIM_\w+)\s*-\s*1\s*\)\s*\*\s*3\s*\]\s*=\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)/g
  const sets = new Map<string, readonly string[]>()
  for (const [, set, ...functions] of tableBody(text, 'sBackAnimationIds').matchAll(row)) {
    sets.set(set ?? '', functions)
  }
  return sets
}

// A field's value is a constant, or `P_FLAG ? A : B` with a flag the pinned config sets.
function resolver(config: string) {
  return (species: string, field: string, value: string, prefix: string): string => {
    const branch = /^(\w+)\s*\?\s*(\w+)\s*:\s*(\w+)$/.exec(value)
    let constant = value
    if (branch !== null) {
      const [, flag = '', yes, no] = branch
      const set = new RegExp(String.raw`#define\s+${flag}\s+(TRUE|FALSE)\b`).exec(config)
      if (set === null) throw new Error(`${flag} is no TRUE or FALSE in ${CONFIG}`)
      constant = (set[1] === 'TRUE' ? yes : no) ?? ''
    }
    if (!new RegExp(String.raw`^${prefix}_\w+$`).test(constant)) {
      throw new Error(`${species}: ${field} "${value}" is no ${prefix}_* constant`)
    }
    return constant
  }
}

/** The functions, the back sets and each species' animations, read from the pinned tree. */
export function readSendOutAnimations(read: ReadTree): SendOutAnimations {
  const text = read(ANIMATION_C)
  const functions = [...tableBody(text, 'sMonAnimFunctions').matchAll(/\[(ANIM_\w+)\]\s*=/g)].map(
    (match) => match[1] ?? '',
  )
  const resolve = resolver(read(CONFIG))
  const fields = (field: string, prefix: string) => {
    const values = new Map<string, string>()
    const pattern = new RegExp(String.raw`\.${field}\s*=\s*([^,]+?)\s*,`)
    for (const path of speciesFiles(read)) {
      for (const [species, value] of parseEntryFields(read(path), 'SPECIES', pattern)) {
        values.set(species, resolve(species, field, value, prefix))
      }
    }
    return values
  }
  const front = fields('frontAnimId', 'ANIM')
  return { functions, backSets: readBackSets(text), front, back: fields('backAnimId', 'BACK_ANIM') }
}

// The animations of the species a battle can send out: a number in the table, not SPECIES_NONE.
function heldAnimations(animOf: ReadonlyMap<string, string>, species: SpeciesTable) {
  return [...animOf].flatMap(([constant, anim]) => {
    const number = numberOf(species, constant)
    return number === 0 || anim === NO_BACK_SET ? [] : [{ number, constant, anim }]
  })
}

// The species with the lowest number for each animation, in the order of those numbers.
function firstSpecies(animOf: ReadonlyMap<string, string>, species: SpeciesTable): string[] {
  const first = new Map<string, { number: number; constant: string }>()
  for (const held of heldAnimations(animOf, species)) {
    const known = first.get(held.anim)
    if (known === undefined || held.number < known.number) first.set(held.anim, held)
  }
  return [...first.values()].sort((a, b) => a.number - b.number).map((held) => held.constant)
}

function streamMon(constant: string, species: SpeciesTable): StreamMon {
  const name = species[constant]?.[1]
  if (typeof name !== 'string') throw new Error(`${constant} has no display name in species.json`)
  const number = numberOf(species, constant)
  return { species: number, maxHp: 100, level: 100, gender: 'none', shiny: false, nickname: name }
}

const TRAINER_NAMES: Readonly<Record<Side, string>> = { near: 'Near', far: 'Far' }

function sentOutLine(side: Side, mon: StreamMon): string {
  return side === 'near' ? `Go! ${mon.nickname}!` : `Far sent out ${mon.nickname}!`
}

function sideSendOuts(side: Side, party: readonly StreamMon[]): Instruction[][] {
  return party.map((mon, slot) => {
    const entering = { side, slot, hp: mon.maxHp, status: 'none' } as const
    const line: Instruction = { op: 'print', text: sentOutLine(side, mon) }
    if (slot === 0) return [line, { op: 'sendOut', ...entering }]
    return [{ op: 'withdraw', side }, line, { op: 'switchIn', ...entering }]
  })
}

function battle(teams: Readonly<Record<Side, StreamMon[]>>, pics: Record<Side, number>): Stream {
  const far = sideSendOuts('far', teams.far)
  const near = sideSendOuts('near', teams.near)
  const turns = Array.from({ length: PARTY_SIZE }, (_, slot) => [
    ...(far[slot] ?? []),
    ...(near[slot] ?? []),
  ])
  const party = (side: Side): Party =>
    Array.from({ length: PARTY_SIZE }, (_, slot) => teams[side][slot] ?? null)
  const trainer = (side: Side) => ({
    name: TRAINER_NAMES[side],
    trainerPic: pics[side],
    teamSize: teams[side].length,
    revealed: teams[side].length,
  })
  return {
    trainers: { near: trainer('near'), far: trainer('far') },
    parties: { near: party('near'), far: party('far') },
    instructions: [
      { op: 'intro' },
      { op: 'print', text: `${TRAINER_NAMES.far} would like to battle!` },
      ...turns.flat(),
      { op: 'end', outcome: 'unknown' },
    ],
  }
}

/** The battles that send out one species for each front animation far and each back set near. */
export function sendOutStreams(
  anims: SendOutAnimations,
  species: SpeciesTable,
  pics: Record<Side, number>,
): SendOutStream[] {
  const far = firstSpecies(anims.front, species).map((constant) => streamMon(constant, species))
  const near = firstSpecies(anims.back, species).map((constant) => streamMon(constant, species))
  const count = Math.max(Math.ceil(far.length / PARTY_SIZE), Math.ceil(near.length / PARTY_SIZE))
  return Array.from({ length: count }, (_, i) => {
    const team = (mons: StreamMon[]) => mons.slice(i * PARTY_SIZE, (i + 1) * PARTY_SIZE)
    const nearTeam = team(near)
    const teams = { far: team(far), near: nearTeam.length > 0 ? nearTeam : near.slice(0, 1) }
    return { name: `${SEND_OUTS}-${String(i + 1)}`, stream: battle(teams, pics) }
  })
}

export interface SendOutCoverage {
  /** The front animations and back sets a species holds and no send-out of the streams plays. */
  readonly missed: string[]
  /** The functions no species holds as its front animation and no held back set lists. */
  readonly heldByNone: string[]
  /** The send-outs of the streams, far and near. */
  readonly sendOuts: number
}

/** What the streams' send-outs reach, read back from their instructions. */
export function sendOutCoverage(
  streams: readonly SendOutStream[],
  anims: SendOutAnimations,
  species: SpeciesTable,
): SendOutCoverage {
  // By number: an alias (SPECIES_WORMADAM) shares the number of the entry it names.
  const byNumber = (animOf: ReadonlyMap<string, string>) =>
    new Map(heldAnimations(animOf, species).map((held) => [held.number, held.anim]))
  const animOf = { far: byNumber(anims.front), near: byNumber(anims.back) }
  const reached = new Set<string>()
  let sendOuts = 0
  for (const { stream } of streams) {
    for (const instruction of stream.instructions) {
      if (instruction.op !== 'sendOut' && instruction.op !== 'switchIn') continue
      const number = stream.parties[instruction.side][instruction.slot]?.species ?? 0
      reached.add(animOf[instruction.side].get(number) ?? '')
      sendOuts += 1
    }
  }
  const front = new Set(heldAnimations(anims.front, species).map((held) => held.anim))
  const sets = new Set(heldAnimations(anims.back, species).map((held) => held.anim))
  const inSets = new Set([...sets].flatMap((set) => anims.backSets.get(set) ?? []))
  return {
    missed: [...front, ...sets].filter((anim) => !reached.has(anim)),
    heldByNone: anims.functions.filter((anim) => !front.has(anim) && !inSets.has(anim)),
    sendOuts,
  }
}
