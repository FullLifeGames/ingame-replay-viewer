// Plan 2 of the direct battle start (#97, D8 to D13): the routine waits at the park with the
// battle's setup built (direct-takeover.ts). The page writes both sides through the setup's
// pointers, then the go, last; the routine hands over to the battle proc, and from the battle's
// start the page presses A through the opening to the action menu (battle-entry.ts). For the first
// run the opponent's party is a copy of the player's first Pokémon (D9). The music stays the wild
// battle's that the setup holds. Pure: the numbers come in from build/gen5/bw2.json.
import { battleEntry, type EntryLimits, type EntryPace } from './battle-entry.ts'
import type { EntryNumbers, FieldLayout } from './bw2-numbers.ts'
import { checkNow, stageRef, type Takeover } from './direct-takeover.ts'
import { entryConstant, entryField, entryLayout } from './entry-field.ts'
import { type StringBuffer, stringWrites } from './game-string.ts'
import { mark, type MacroStep } from './macro.ts'
import type { RamCheck, RamRef } from './ram-check.ts'
import type { PointerChain } from './ram-chain.ts'
import { littleEndian, type MemoryWrite } from './ram-write.ts'
import { blockAddress, type RoutineLayout } from './routine-layout.ts'
import { ROUTINE_STAGES } from './routine-order.ts'

/** The names the page writes for the two sides. */
export interface ParkNames {
  player: string
  opponent: string
}

/** The plan's steps, the log lines of any name it cut, and the values it logs. */
export interface Park {
  steps: MacroStep[]
  notes: string[]
  watch: RamRef[]
}

/** The setup's clients: the player's side and the opponent's in a single battle. */
const PLAYER = 0
const OPPONENT = 1

const WORD = 4

/** Frames from the go to gone: the routine's main runs in the next update. E-5's runs measured 11. */
const GONE_LIMIT = 30

/** Frames from gone to the battle's adapter (the battle overlay's load and the battle proc's
 * init), and from there through the opening to the action menu. E-5's runs of a single measured
 * 27 and 652; a double's opening sends out two a side. */
const LIMITS: EntryLimits = { start: 120, battle: 1000 }

/** A on a quick beat through the opening, with a frame every 30 frames on the way to the adapter
 * and through the opening, whose intro shows the written names. */
const PACE: EntryPace = { markEvery: 30, every: 4, throughOpening: true, openingMarkEvery: 30 }

/** A chain from the block's setup word, its hops spelled out. */
type SetupChain = PointerChain & { hops: readonly number[] }

/** The chain from the block's setup word through `hops`. */
function behindSetup(layout: RoutineLayout, hops: readonly number[]): SetupChain {
  return { address: blockAddress(layout, 'setup'), hops }
}

/** The offset of element `client` of the setup's pointer array `member`. */
const slot = (entry: EntryNumbers, member: string, client: number) =>
  entryField(entry, 'BtlSetup', member).offset + client * WORD

const width = (field: FieldLayout, name: string): 1 | 2 | 4 => {
  if (field.size === 1 || field.size === 2 || field.size === 4) return field.size
  throw new Error(`${name} fills no byte, halfword or word`)
}

/** The writes of a bit-field's value, inside the one byte that holds its bits. */
function bitsWrite(field: string, chain: SetupChain, at: FieldLayout, value: number): MemoryWrite {
  const { bit, bits } = at
  if (bit === undefined || bits === undefined || (bit % 8) + bits > 8) {
    throw new Error(`${field} is no bit-field in one byte`)
  }
  const shift = bit % 8
  const last = chain.hops.slice(-1).map((hop) => hop + Math.floor(bit / 8))
  const hops = [...chain.hops.slice(0, -1), ...last]
  const mask = (2 ** bits - 1) * 2 ** shift
  return { kind: 'bits', field, address: chain.address, hops, mask, value: value * 2 ** shift }
}

/** A member of the opponent's name, the StrBuf behind trainers[1]. */
function opponentStrBuf(entry: EntryNumbers, layout: RoutineLayout, member: string): SetupChain {
  const trainer = slot(entry, 'trainers', OPPONENT)
  const name = entryField(entry, 'BtlSetupTrainer', 'name').offset
  return behindSetup(layout, [trainer, name, entryField(entry, 'StrBuf', member).offset])
}

/** The opponent's name in the StrBuf of trainers[1], which the battle's intro prints. */
function opponentName(entry: EntryNumbers, layout: RoutineLayout): StringBuffer {
  const strbuf = (member: string) => opponentStrBuf(entry, layout, member)
  const room = entry.bufferSizes.TrainerBattleSetup_Create
  if (room === undefined) throw new Error("the entry gives no size of the trainer's name buffer")
  const length = entryField(entry, 'StrBuf', 'length')
  return {
    field: 'opponent.name',
    chars: strbuf('chars'),
    room,
    charWidth: entryField(entry, 'StrBuf', 'chars').size,
    length: { ...strbuf('length'), width: length.size },
  }
}

/** The player's name in the PlayerInfo of the player's client, a plain array of characters. */
function playerName(entry: EntryNumbers, layout: RoutineLayout): StringBuffer {
  const name = entryField(entry, 'PlayerInfo', 'name')
  const charWidth = entryField(entry, 'StrBuf', 'chars').size
  const hops = [slot(entry, 'playerInfo', PLAYER), name.offset]
  return {
    field: 'player.name',
    chars: behindSetup(layout, hops),
    room: name.size / charWidth,
    charWidth,
  }
}

/** A member of a client's party, through the setup's party pointer. */
function partyRef(entry: EntryNumbers, layout: RoutineLayout, client: number, member: string) {
  return behindSetup(layout, [
    slot(entry, 'party', client),
    entryField(entry, 'PokeParty', member).offset,
  ])
}

/** The player's first Pokémon as the opponent's one, with the count and the slot's flag beside it,
 * as PokeParty_AddPkm leaves them. */
function partyWrites(entry: EntryNumbers, layout: RoutineLayout): MemoryWrite[] {
  const count = entryField(entry, 'PokeParty', 'count')
  const flags = { offset: 0, size: 1, bit: 0, bits: 1 }
  return [
    {
      kind: 'copy',
      field: 'opponent.party',
      from: partyRef(entry, layout, PLAYER, 'pkms'),
      to: partyRef(entry, layout, OPPONENT, 'pkms'),
      length: entryLayout(entry, 'PartyPkm').size,
    },
    {
      kind: 'bytes',
      field: 'opponent.party.count',
      ...partyRef(entry, layout, OPPONENT, 'count'),
      bytes: littleEndian(1, count.size, 'opponent.party.count'),
    },
    bitsWrite(
      'opponent.party.slotExists',
      partyRef(entry, layout, OPPONENT, 'slotExists'),
      flags,
      1,
    ),
  ]
}

/** Every write of the park, the go apart; and the log lines of the names it cut. */
function parkWrites(entry: EntryNumbers, layout: RoutineLayout, names: ParkNames) {
  const terminator = entryConstant(entry, 'CHAR_EOM')
  const opponent = stringWrites(names.opponent, opponentName(entry, layout), terminator)
  const player = stringWrites(names.player, playerName(entry, layout), terminator)
  const trainerClass = entryField(entry, 'BtlSetupTrainer', 'trainerClass')
  const classHops = [slot(entry, 'trainers', OPPONENT), trainerClass.offset]
  const speed = entryField(entry, 'Config', 'textSpeed')
  const config = behindSetup(layout, [entryField(entry, 'BtlSetup', 'config').offset, speed.offset])
  const writes: MemoryWrite[] = [
    ...opponent.writes,
    {
      kind: 'bytes',
      field: 'opponent.trainerClass',
      ...behindSetup(layout, classHops),
      bytes: littleEndian(
        entryConstant(entry, 'TRAINER_CLASS_YOUNGSTER'),
        trainerClass.size,
        'trainerClass',
      ),
    },
    ...player.writes,
    bitsWrite('config.textSpeed', config, speed, entryConstant(entry, 'CONFIG_TEXT_SPEED_FAST')),
    ...partyWrites(entry, layout),
  ]
  const notes = [opponent.cut, player.cut].filter((note) => note !== undefined)
  return { writes, notes }
}

/** The readings of the log: the setup the routine built and both clients' party pointers in it,
 * the copy's source and destination (#97: the copy goes into the setup's own party of client 1). */
function setupWatch(entry: EntryNumbers, layout: RoutineLayout): RamRef[] {
  const pointer = (name: string, client: number): RamRef => ({
    name,
    ...behindSetup(layout, [slot(entry, 'party', client)]),
    width: WORD,
  })
  return [
    { name: 'setup', address: blockAddress(layout, 'setup'), width: WORD },
    pointer('player.party', PLAYER),
    pointer('opponent.party', OPPONENT),
  ]
}

/** What must hold before the page writes: the setup built, the opponent's name buffer of the size
 * the plan cut the name to, a Pokémon in the player's party to copy and none in the opponent's. */
function parkChecks(entry: EntryNumbers, layout: RoutineLayout): RamCheck[] {
  const size = entryField(entry, 'StrBuf', 'size')
  const name = opponentName(entry, layout)
  const count = entryField(entry, 'PokeParty', 'count')
  const counted = (client: number, side: string) => ({
    name: `${side}.party.count`,
    ...partyRef(entry, layout, client, 'count'),
    width: width(count, 'PokeParty.count'),
  })
  return [
    { name: 'setup', address: blockAddress(layout, 'setup'), width: WORD, mainRamPointer: true },
    {
      name: 'opponent.name size',
      ...opponentStrBuf(entry, layout, 'size'),
      width: width(size, 'StrBuf.size'),
      oneOf: [name.room],
    },
    { ...counted(PLAYER, 'player'), noneOf: [0] },
    { ...counted(OPPONENT, 'opponent'), oneOf: [0] },
  ]
}

/** Plan 2 from the park: the checks, the park's writes, the routine's region checked again in the
 * frame before the go, the go, the wait for gone, then the battle's entry through the opening. No
 * write follows the go: the battle loads over the routine. */
export function park(
  entry: EntryNumbers,
  routine: Pick<Takeover, 'layout' | 'region'>,
  names: ParkNames,
  battleChecks: readonly RamCheck[],
): Park {
  const { layout } = routine
  const { writes, notes } = parkWrites(entry, layout, names)
  const go = blockAddress(layout, 'go')
  const stage = stageRef(layout)
  const steps: MacroStep[] = [
    checkNow('park-check', parkChecks(entry, layout)),
    { kind: 'write', name: 'park', writes },
    checkNow('go-region', routine.region),
    {
      kind: 'write',
      name: 'go',
      writes: [{ kind: 'bytes', field: 'go', address: go, bytes: littleEndian(1, WORD, 'go') }],
    },
    {
      kind: 'until',
      name: 'gone',
      checks: [{ ...stage, oneOf: [ROUTINE_STAGES.gone] }],
      holdFor: 1,
      limit: GONE_LIMIT,
    },
    mark('gone'),
    ...battleEntry(battleChecks, LIMITS, PACE),
  ]
  return { steps, notes, watch: [stage, ...setupWatch(entry, layout)] }
}
