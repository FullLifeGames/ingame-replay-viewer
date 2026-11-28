// Part 2 of the direct battle start (#97, D9 to D13): the routine waits at the park with the
// battle's setup built (direct-takeover.ts). The page writes both sides through the setup's
// pointers, then the go, last; the routine hands over to the battle proc, and from the battle's
// start the page presses A through the opening to the action menu (battle-entry.ts). Both parties
// come in sealed (direct-party.ts), the battle's style by name, and the music word takes the
// regular trainer's track (plan E-6, decisions 4, 5 and 8). Pure: the numbers come in from
// build/gen5/bw2.json.
import { battleEntry, type EntryLimits, type EntryPace } from './battle-entry.ts'
import { bitsWrite } from './bits-write.ts'
import type { EntryNumbers } from './bw2-numbers.ts'
import { partyChecks, partyCounts, type PartySides, partyWrites } from './direct-party.ts'
import { checkNow, stageRef, type Takeover } from './direct-takeover.ts'
import { entryConstant, entryField } from './entry-field.ts'
import { type StringBuffer, stringWrites } from './game-string.ts'
import { mark, type MacroStep } from './macro.ts'
import type { RamCheck, RamRef } from './ram-check.ts'
import { littleEndian, type MemoryWrite } from './ram-write.ts'
import { blockAddress, type RoutineLayout } from './routine-layout.ts'
import { ROUTINE_STAGES } from './routine-order.ts'
import { behindSetup, type SetupChain, type SetupSide, slot, width, WORD } from './setup-chain.ts'

/** The names the page writes for the two sides. */
export interface ParkNames {
  player: string
  opponent: string
}

/** What the park writes: the names, each side's sealed Pokémon and the battle's style. */
export interface ParkSides {
  names: ParkNames
  parties: PartySides
  style: 'single' | 'double'
}

/** The plan's steps, the log lines of any name it cut, and the values it logs. */
export interface Park {
  steps: MacroStep[]
  notes: string[]
  watch: RamRef[]
}

/** The music a regular trainer class battles to (docs/gen5-save.md). */
const TRAINER_TRACK = 'SEQ_BGM_VS_TRAINER'

/** Frames from the go to gone: the routine's main runs in the next update. E-5's runs measured 11. */
const GONE_LIMIT = 30

/** Frames from gone to the battle's adapter (the battle overlay's load and the battle proc's
 * init), and from there through the opening to the action menu. E-5's runs of a single measured
 * 27 and 652; a double's opening sends out two a side. */
const LIMITS: EntryLimits = { start: 120, battle: 1000 }

/** A on a quick beat through the opening, with a frame every 30 frames on the way to the adapter
 * and through the opening, whose intro shows the written names. */
const PACE: EntryPace = { markEvery: 30, every: 4, throughOpening: true, openingMarkEvery: 30 }

/** A member of the opponent's name, the StrBuf behind the opponent's element of trainers. */
function opponentStrBuf(entry: EntryNumbers, layout: RoutineLayout, member: string): SetupChain {
  const trainer = slot(entry, 'trainers', 'opponent')
  const name = entryField(entry, 'BtlSetupTrainer', 'name').offset
  return behindSetup(layout, [trainer, name, entryField(entry, 'StrBuf', member).offset])
}

/** The opponent's name in the StrBuf of the opponent's element of trainers, which the battle's
 * intro prints. */
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

/** The player's name in the PlayerInfo of the player's element of playerInfo, a plain array of characters. */
function playerName(entry: EntryNumbers, layout: RoutineLayout): StringBuffer {
  const name = entryField(entry, 'PlayerInfo', 'name')
  const charWidth = entryField(entry, 'StrBuf', 'chars').size
  const hops = [slot(entry, 'playerInfo', 'player'), name.offset]
  return {
    field: 'player.name',
    chars: behindSetup(layout, hops),
    room: name.size / charWidth,
    charWidth,
  }
}

/** The battle's style by name, and the regular trainer's track: members of the setup itself, each
 * with the value the park writes. */
function setupWords(entry: EntryNumbers, layout: RoutineLayout, style: ParkSides['style']) {
  const word = (member: string, constant: string) => {
    const field = entryField(entry, 'BtlSetup', member)
    const chain = behindSetup(layout, [field.offset])
    return { member, chain, width: width(field, member), value: entryConstant(entry, constant) }
  }
  return [
    word('battleStyle', style === 'double' ? 'BTL_STYLE_DOUBLE' : 'BTL_STYLE_SINGLE'),
    word('fieldSituation.bgm', TRAINER_TRACK),
  ]
}

/** Every write of the park, the go apart; and the log lines of the names it cut. */
function parkWrites(entry: EntryNumbers, layout: RoutineLayout, sides: ParkSides) {
  const { names } = sides
  const terminator = entryConstant(entry, 'CHAR_EOM')
  const opponent = stringWrites(names.opponent, opponentName(entry, layout), terminator)
  const player = stringWrites(names.player, playerName(entry, layout), terminator)
  const trainerClass = entryField(entry, 'BtlSetupTrainer', 'trainerClass')
  const classHops = [slot(entry, 'trainers', 'opponent'), trainerClass.offset]
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
    ...setupWords(entry, layout, sides.style).map(
      ({ member, chain, width: size, value }): MemoryWrite => ({
        kind: 'bytes',
        field: member,
        ...chain,
        bytes: littleEndian(value, size, member),
      }),
    ),
    ...partyWrites(entry, layout, sides.parties),
  ]
  const notes = [opponent.cut, player.cut].filter((note) => note !== undefined)
  return { writes, notes }
}

/** The readings of the log: the setup the routine built and both sides' party pointers in it,
 * which the park writes the parties behind (#97: the setup's own parties, not the game's). */
function setupWatch(entry: EntryNumbers, layout: RoutineLayout): RamRef[] {
  const pointer = (name: string, side: SetupSide): RamRef => ({
    name,
    ...behindSetup(layout, [slot(entry, 'party', side)]),
    width: WORD,
  })
  return [
    { name: 'setup', address: blockAddress(layout, 'setup'), width: WORD },
    pointer('player.party', 'player'),
    pointer('opponent.party', 'opponent'),
  ]
}

/** What must hold before the page writes: the setup built, the opponent's name buffer of the size
 * the plan cut the name to, both parties of a full party's room and none in the opponent's. */
function parkChecks(entry: EntryNumbers, layout: RoutineLayout): RamCheck[] {
  const size = entryField(entry, 'StrBuf', 'size')
  const name = opponentName(entry, layout)
  return [
    { name: 'setup', address: blockAddress(layout, 'setup'), width: WORD, mainRamPointer: true },
    {
      name: 'opponent.name size',
      ...opponentStrBuf(entry, layout, 'size'),
      width: width(size, 'StrBuf.size'),
      oneOf: [name.room],
    },
    ...partyChecks(entry, layout),
  ]
}

/** What the park wrote, read back in the frame after the write: the style, the music and both
 * counts. */
function writtenChecks(entry: EntryNumbers, layout: RoutineLayout, sides: ParkSides): RamCheck[] {
  const words = setupWords(entry, layout, sides.style).map(
    ({ member, chain, width: size, value }) => ({
      name: member,
      ...chain,
      width: size,
      oneOf: [value],
    }),
  )
  return [...words, ...partyCounts(entry, layout, sides.parties)]
}

/** Part 2 from the park: the checks, the park's writes and their read-back, the routine's region
 * checked again in the frame before the go, the go, the wait for gone, then the battle's entry
 * through the opening. No write follows the go: the battle loads over the routine. */
export function park(
  entry: EntryNumbers,
  routine: Pick<Takeover, 'layout' | 'region'>,
  sides: ParkSides,
  battleChecks: readonly RamCheck[],
): Park {
  const { layout } = routine
  const { writes, notes } = parkWrites(entry, layout, sides)
  const go = blockAddress(layout, 'go')
  const stage = stageRef(layout)
  const steps: MacroStep[] = [
    checkNow('park-check', parkChecks(entry, layout)),
    { kind: 'write', name: 'park', writes },
    checkNow('park-written', writtenChecks(entry, layout, sides)),
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
