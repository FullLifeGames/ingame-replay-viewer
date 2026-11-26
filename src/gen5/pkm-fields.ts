// A written Pokémon (#97) as a PartyPkm's plain bytes, and back: each field into its member by the
// generated layout, the blocks in logical order (pkm-cipher.ts seals them). The PID follows a rule:
// its low byte gives the gender (zero is female and all ones male under every mixed ratio,
// PML_UtilDerivePkmSex), a salt in the byte above it lets slots differ, and its upper half makes
// the XOR of the halves of PID and OT id zero for a shiny Pokémon and all ones for a plain one
// (PML_UtilPIDIsRare). Pure: every number comes in from build/gen5/bw2.json.
import type { PkmNumbers } from './bw2-numbers.ts'
import { checkPkmSize, pkmConstant, pkmField, pkmLayout } from './pkm-cipher.ts'
import {
  memberAt,
  type PkmFormat,
  type PkmMove,
  readMoves,
  readName,
  readNumber,
  widthOf,
  writeMoves,
  writeName,
  writeNumber,
} from './pkm-members.ts'

export type PkmGender = 'male' | 'female' | 'none'

interface PkmIvs {
  hp: number
  atk: number
  def: number
  spe: number
  spa: number
  spd: number
}

interface PkmStats {
  atk: number
  def: number
  spe: number
  spa: number
  spd: number
}

/** A Pokémon as the backend writes it. Species, moves, items, abilities and natures by the
 * game's numbers; the fields left out take their defaults. */
export interface WrittenPkm {
  species: number
  form: number
  level: number
  exp: number
  gender: PkmGender
  shiny: boolean
  nature: number
  ability: number
  item: number
  friendship: number
  /** Up to the block's slots; the slots left over stay empty. */
  moves: PkmMove[]
  /** Default: every bit of each IV set. */
  ivs?: PkmIvs
  /** The name shown, and whether it is a nickname rather than the species' name. */
  name: string
  nicknamed: boolean
  /** The original trainer; `gender` is the bit as PlayerInfo keeps it. */
  ot: { name: string; id: number; gender: number }
  /** Default: ITEM_POKE_BALL. */
  ball?: number
  /** Default: the level. */
  metLevel?: number
  /** Default: LANGUAGE_ENGLISH. */
  language?: number
  /** Default: VERSION_BLACK2. */
  origin?: number
  /** The status condition as its raw word; default 0. */
  status?: number
  hp: number
  maxHp: number
  stats: PkmStats
  /** Default: pidFor's PID from the gender, the shininess, the OT id and the salt. */
  personality?: number
  /** A byte that lets two slots of one party differ in their PIDs; default 0. */
  salt?: number
}

/** A Pokémon read back from plain bytes: every field, the PID among them. */
export type ReadPkm = Required<Omit<WrittenPkm, 'salt'>>

/** Plain bytes and the log line of each name cut to its room. */
export interface PlainPkm {
  bytes: Uint8Array
  cuts: string[]
}

const GENDER_CONSTANTS = { male: 'GENDER_MALE', female: 'GENDER_FEMALE', none: 'GENDER_UNKNOWN' }
const GENDER_BYTES = { male: 0xff, female: 0x00, none: 0x00 }
const IV_MEMBERS = {
  hp: 'hpIV',
  atk: 'atkIV',
  def: 'defIV',
  spe: 'speIV',
  spa: 'spaIV',
  spd: 'spdIV',
}
const STAT_KEYS = ['atk', 'def', 'spe', 'spa', 'spd'] as const

const halvesXor = (a: number, b: number) => (a >>> 16) ^ (a & 0xffff) ^ (b >>> 16) ^ (b & 0xffff)

/** Whether the game shows a Pokémon of this PID and OT id as shiny. */
export const isShiny = (pid: number, otId: number, shinyBelow: number) =>
  halvesXor(pid, otId) < shinyBelow

/** The PID by the rule above; throws on a salt above a byte, or when the bound allows no PID of
 * the shininess asked for. */
export function pidFor(
  want: { gender: PkmGender; shiny: boolean; otId: number; salt: number },
  shinyBelow: number,
): number {
  const { gender, shiny, otId, salt } = want
  if (!Number.isInteger(salt) || salt < 0 || salt > 0xff) throw new RangeError('a salt is a byte')
  const low = salt * 0x100 + GENDER_BYTES[gender]
  const high = halvesXor(low, otId) ^ (shiny ? 0 : 0xffff)
  const pid = high * 0x10000 + low
  if (isShiny(pid, otId, shinyBelow) !== shiny) {
    throw new RangeError(`the shiny bound allows no ${shiny ? 'shiny' : 'plain'} PID`)
  }
  return pid
}

/** The input's PID, or pidFor's; throws when it contradicts the input's shininess. */
function personalityOf(input: WrittenPkm, salt: number, shinyBelow: number): number {
  const { gender, shiny, ot } = input
  const personality = input.personality ?? pidFor({ gender, shiny, otId: ot.id, salt }, shinyBelow)
  if (isShiny(personality, ot.id, shinyBelow) !== shiny) {
    throw new RangeError(`the PID given contradicts the shiny flag ${String(shiny)}`)
  }
  return personality
}

/** The input with every default filled in. */
function filled(input: WrittenPkm, pkm: PkmNumbers): ReadPkm {
  const { salt = 0, ...rest } = input
  const fullIv = (key: keyof PkmIvs) =>
    2 ** widthOf(pkmField(pkm, 'PkmBlockB', IV_MEMBERS[key])) - 1
  const ball = pkm.items.ITEM_POKE_BALL
  if (ball === undefined) throw new Error('the Pokémon format has no item ITEM_POKE_BALL')
  return {
    ...rest,
    ivs: input.ivs ?? ivsOf(fullIv),
    ball: input.ball ?? ball,
    metLevel: input.metLevel ?? input.level,
    language: input.language ?? pkmConstant(pkm, 'LANGUAGE_ENGLISH'),
    origin: input.origin ?? pkmConstant(pkm, 'VERSION_BLACK2'),
    status: input.status ?? 0,
    personality: personalityOf(input, salt, pkm.shinyBelow),
  }
}

const ivsOf = (of: (key: keyof PkmIvs) => number): PkmIvs => ({
  hp: of('hp'),
  atk: of('atk'),
  def: of('def'),
  spe: of('spe'),
  spa: of('spa'),
  spd: of('spd'),
})

type MemberValue = [struct: string, member: string, value: number]

/** Each number of a filled Pokémon beside its member. */
function memberValues(p: ReadPkm, pkm: PkmNumbers): MemberValue[] {
  const gender = pkmConstant(pkm, GENDER_CONSTANTS[p.gender])
  const ivs = Object.entries(IV_MEMBERS).map(([key, member]): MemberValue => [
    'PkmBlockB',
    member,
    p.ivs[key as keyof PkmIvs],
  ])
  const stats = STAT_KEYS.map((key): MemberValue => ['PartyPkm', key, p.stats[key]])
  return [
    ['PartyPkm', 'base.pid', p.personality],
    ['PkmBlockA', 'species', p.species],
    ['PkmBlockA', 'item', p.item],
    ['PkmBlockA', 'id', p.ot.id],
    ['PkmBlockA', 'exp', p.exp],
    ['PkmBlockA', 'friendship', p.friendship],
    ['PkmBlockA', 'ability', p.ability],
    ['PkmBlockA', 'language', p.language],
    ...ivs,
    ['PkmBlockB', 'isNicknamed', p.nicknamed ? 1 : 0],
    ['PkmBlockB', 'gender', gender],
    ['PkmBlockB', 'form', p.form],
    ['PkmBlockB', 'nature', p.nature],
    ['PkmBlockC', 'originGame', p.origin],
    ['PkmBlockD', 'ball', p.ball],
    ['PkmBlockD', 'metLevel', p.metLevel],
    ['PkmBlockD', 'otGender', p.ot.gender],
    ['PartyPkm', 'statusCond', p.status],
    ['PartyPkm', 'level', p.level],
    ['PartyPkm', 'nowHP', p.hp],
    ['PartyPkm', 'maxHP', p.maxHp],
    ...stats,
  ]
}

/** The plain bytes of `input`, written onto a copy of `onto` (default: zeros). Bytes outside the
 * members written stay as `onto` holds them: the flag bits, the checksum, the mail, the paddings,
 * the members the input does not name and a name's units after its terminator. */
export function plainPkm(input: WrittenPkm, format: PkmFormat, onto?: Uint8Array): PlainPkm {
  const { pkm } = format
  const bytes = Uint8Array.from(onto ?? new Uint8Array(pkmLayout(pkm, 'PartyPkm').size))
  checkPkmSize(bytes, pkm)
  const full = filled(input, pkm)
  for (const [struct, member, value] of memberValues(full, pkm)) {
    writeNumber(bytes, memberAt(pkm, struct, member), value, `${struct}.${member}`)
  }
  writeMoves(bytes, pkm, full.moves)
  const cuts = [
    writeName(bytes, format, ['PkmBlockC', 'nickname'], full.name),
    writeName(bytes, format, ['PkmBlockD', 'otName'], full.ot.name),
  ].filter((cut) => cut !== undefined)
  return { bytes, cuts }
}

function genderOf(value: number, pkm: PkmNumbers): PkmGender {
  const genders = Object.keys(GENDER_CONSTANTS) as PkmGender[]
  const gender = genders.find((key) => pkm.constants[GENDER_CONSTANTS[key]] === value)
  if (gender === undefined) throw new RangeError('PkmBlockB.gender holds no GENDER_ constant')
  return gender
}

/** The Pokémon `plain` holds, every field read from its member. */
export function readPkm(plain: Uint8Array, format: PkmFormat): ReadPkm {
  const { pkm } = format
  checkPkmSize(plain, pkm)
  const get = (struct: string) => (member: string) =>
    readNumber(plain, memberAt(pkm, struct, member), `${struct}.${member}`)
  const a = get('PkmBlockA')
  const b = get('PkmBlockB')
  const d = get('PkmBlockD')
  const party = get('PartyPkm')
  const personality = party('base.pid')
  return {
    species: a('species'),
    form: b('form'),
    level: party('level'),
    exp: a('exp'),
    gender: genderOf(b('gender'), pkm),
    shiny: isShiny(personality, a('id'), pkm.shinyBelow),
    nature: b('nature'),
    ability: a('ability'),
    item: a('item'),
    friendship: a('friendship'),
    moves: readMoves(plain, pkm),
    ivs: ivsOf((key) => b(IV_MEMBERS[key])),
    name: readName(plain, format, ['PkmBlockC', 'nickname']),
    nicknamed: b('isNicknamed') === 1,
    ot: {
      name: readName(plain, format, ['PkmBlockD', 'otName']),
      id: a('id'),
      gender: d('otGender'),
    },
    ball: d('ball'),
    metLevel: d('metLevel'),
    language: a('language'),
    origin: get('PkmBlockC')('originGame'),
    status: party('statusCond'),
    hp: party('nowHP'),
    maxHp: party('maxHP'),
    stats: {
      atk: party('atk'),
      def: party('def'),
      spe: party('spe'),
      spa: party('spa'),
      spd: party('spd'),
    },
    personality,
  }
}
