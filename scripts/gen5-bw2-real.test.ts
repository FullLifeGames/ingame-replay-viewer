// The Gen 5 code on pokebw2's real numbers (#77): build/gen5/bw2.json, which scripts/gen5-bw2.ts
// generates from the pinned checkout. CI fetches the pin and generates the file before the check,
// so there a missing file fails the guard; on a machine without it the relations skip. CI's log is
// public, so every assertion compares names or booleans: a failure names the role and shows no
// number of pokebw2.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { adapterNumbers, adapterWrites } from '../src/gen5/adapter.ts'
import { battleRefs } from '../src/gen5/battle-check.ts'
import { singleBattlePos } from '../src/gen5/battle-mons.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { continueRoute } from '../src/gen5/continue-route.ts'
import { inMainRam, MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import { momentCommands } from '../src/gen5/moment.ts'
import { newGameRoute } from '../src/gen5/route.ts'
import { packCommands } from '../src/gen5/server-cmd.ts'
import { trainerRoute } from '../src/gen5/trainer-route.ts'
import { checkAdapterLayout, SYMBOL_NAMES } from './gen5-bw2.ts'
import { BOOT_LINKS, ENTRY_FUNCTIONS } from './gen5-bw2-entry.ts'
import { checkApart } from './gen5-bw2-span.ts'
import { placeMatches, reaches, ROUTE_MAP, scriptLabel } from './gen5-bw2-field.ts'
import {
  listConstants,
  SAVE_TRAINER,
  trainerMatches,
  trainerScriptOffset,
} from './gen5-bw2-trainer.ts'
import { MOMENT_COMMANDS, namesOutsideMainRam, zeroArguments } from './gen5-bw2-report.ts'
import { listedReader, POKEBW2 } from './gen5-bw2-source.ts'
import {
  moveLineLabel,
  type SceneName,
  sceneBlocks,
  sceneMove,
  type Side,
  TEXT_BANKS,
  textId,
} from './gen5-moment-scene.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// Scene: CI must never pass with the spec on real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

/** True when `run` returns; its error, which may show a number, stays out of the log. */
function passes(run: () => unknown): boolean {
  try {
    run()
    return true
  } catch {
    return false
  }
}

let cached: Bw2Numbers | undefined
const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

/** Invented readings of the two Pokémon: full HP, which the scenes' moves bring down. */
const MONS = {
  near: { address: MAIN_RAM_START, monId: 0, species: 1, hp: 100, maxHp: 100, level: 50 },
  far: { address: MAIN_RAM_START, monId: 1, species: 4, hp: 100, maxHp: 100, level: 50 },
}

/** An invented standard line's ID: the largest moment carries one after the bar. */
const STD_MESSAGE = 1

const SCENES: SceneName[] = ['known', 'unknown']
const SIDES: Side[] = ['near', 'far']

describe.skipIf(!existsSync(FILE))('the Gen 5 code on the generated numbers', () => {
  it('come from the pinned commit', () => {
    expect(real().pokebw2.commit).toBe(POKEBW2.commit)
  })

  it('name every symbol the spike reads, each in main RAM', () => {
    const { symbols } = real()
    expect(SYMBOL_NAMES.filter((name) => symbols[name] === undefined)).toEqual([])
    expect(namesOutsideMainRam(symbols)).toEqual([])
  })

  it("pass the adapter's layout check", () => {
    const checked = passes(() => {
      checkAdapterLayout(real().adapter)
    })
    expect(checked, 'the adapter layout').toBe(true)
  })

  it('give the adapter and the end condition every name they look up', () => {
    expect(
      passes(() => adapterNumbers(real())),
      'adapterNumbers',
    ).toBe(true)
    expect(
      passes(() => battleRefs(real())),
      'battleRefs',
    ).toBe(true)
  })

  it('pack every moment command with zero arguments', () => {
    const numbers = real()
    const fails = MOMENT_COMMANDS.filter(
      (command) => !passes(() => packCommands(numbers, [zeroArguments(numbers, command)])),
    )
    expect(fails).toEqual([])
  })

  it('give each client of the single battle exactly one position, each its own', () => {
    const { single } = real().battle
    const clients = Array.from({ length: single.clientCount }, (_, client) => client)
    const once = clients.filter(
      (client) => single.posClientIds.filter((id) => id === client).length === 1,
    )
    expect(once.length === clients.length, 'each client at exactly one position').toBe(true)
    const positions = clients.map((client) => singleBattlePos(single, client))
    expect(new Set(positions).size === clients.length, 'the positions differ').toBe(true)
  })

  it("hand each scene's moments to the adapter, which takes each block", () => {
    const numbers = real()
    const adapter = adapterNumbers(numbers)
    const fails = SCENES.flatMap((scene) =>
      sceneBlocks(scene, MONS, numbers.battle.single, STD_MESSAGE)
        .filter(({ moment }) => {
          const block = () => packCommands(numbers, momentCommands(moment))
          return !passes(() => adapterWrites(adapter, MAIN_RAM_START, block()))
        })
        .map(({ name }) => `${scene} ${name}`),
    )
    expect(fails).toEqual([])
  })

  it("find the lines the log names by label in pokebw2's text banks", () => {
    const read = listedReader(GEN5_PATHS.pokebw2)
    const has = (bank: string, label: string) => passes(() => textId(bank, label))
    const moves = read(TEXT_BANKS.move)
    const labels = SCENES.flatMap((scene) =>
      SIDES.flatMap((mover) => SIDES.map((side) => moveLineLabel(sceneMove(scene, mover), side))),
    )
    expect(labels.filter((label) => !has(moves, label))).toEqual([])
    const standard = 'Bank0019_Text_ItsSuperEffective'
    expect(has(read(TEXT_BANKS.standard), standard), standard).toBe(true)
  })

  it("find each of the route's places in exactly one event of the map", () => {
    const read = listedReader(GEN5_PATHS.pokebw2)
    const matches = placeMatches(read(ROUTE_MAP.events), read(ROUTE_MAP.script))
    const notOne = Object.entries(matches).filter(([, events]) => events.length !== 1)
    expect(notOne.map(([place]) => place)).toEqual([])
  })

  it("start a trainer battle from the battle trigger's script", () => {
    const read = listedReader(GEN5_PATHS.pokebw2)
    const script = read(ROUTE_MAP.script)
    const { triggers } = JSON.parse(read(ROUTE_MAP.events)) as {
      triggers: { script: number; grid: { x: number; z: number; width: number } }[]
    }
    const { x, z, width } = real().route.battleTrigger
    const there = triggers.filter(
      ({ grid }) => grid.x === x && grid.z === z && grid.width === width,
    )
    const battles = there.filter((event) =>
      reaches(script, scriptLabel(event), 'CallTrainerBattle'),
    )
    expect(there.length === 1 && battles.length === 1, 'one trigger there, starting a battle').toBe(
      true,
    )
  })

  it('put the three triggers in one strip of columns', () => {
    const { hughTrigger, battleTrigger, outlookTrigger } = real().route
    const strip = (place: typeof hughTrigger) =>
      place.x === hughTrigger.x && place.width === hughTrigger.width
    expect(strip(battleTrigger) && strip(outlookTrigger), 'one strip').toBe(true)
  })

  it('build the route from boot to the battle', () => {
    const numbers = real()
    const built = passes(() => newGameRoute(numbers.route, battleRefs(numbers).checks))
    expect(built, 'newGameRoute').toBe(true)
  })

  it("find the save's trainer in exactly one trainer NPC of his route, looking along his column", () => {
    const read = listedReader(GEN5_PATHS.pokebw2)
    const id = listConstants(read(SAVE_TRAINER.trainers))[SAVE_TRAINER.trainer]
    expect(id !== undefined, `${SAVE_TRAINER.trainer} in the list`).toBe(true)
    const script = (id ?? 0) + trainerScriptOffset(read(SAVE_TRAINER.script))
    const hits = trainerMatches(read(SAVE_TRAINER.events), script)
    expect(hits.length === 1, 'one trainer NPC with his script').toBe(true)
    const [him] = hits
    const { saveTrainer } = real()
    const same = him?.grid.x === saveTrainer.x && him.grid.z === saveTrainer.z
    expect(same, 'the generated tile is his').toBe(true)
    expect(['DIR_UP', 'DIR_DOWN'].includes(him?.direction ?? ''), 'he looks up or down').toBe(true)
  })

  it('build the continue route and the trainer route from the save', () => {
    const numbers = real()
    const { checks } = battleRefs(numbers)
    const built = passes(() => continueRoute(numbers.saveTrainer, checks))
    expect(built, 'continueRoute').toBe(true)
    const trainer = passes(() => trainerRoute(numbers.route, numbers.saveTrainer))
    expect(trainer, 'trainerRoute').toBe(true)
  })

  // The direct entry (#97): relations alone, as everywhere in this spec.
  it('give every entry function, each Thumb with its bit set, and every entry symbol in main RAM', () => {
    const { functions, data } = real().entry
    expect(ENTRY_FUNCTIONS.filter((name) => functions[name] === undefined)).toEqual([])
    const odd = Object.entries(functions).filter(
      ([, fn]) => !fn.thumb || fn.call % 2 !== 1 || !inMainRam(fn.call - 1),
    )
    expect(odd.map(([name]) => name)).toEqual([])
    expect(namesOutsideMainRam(data)).toEqual([])
  })

  it('put the battle overlay in main RAM apart from the boot overlays, its proc table inside', () => {
    const { battleOverlay, bootOverlays, data } = real().entry
    const { start, end } = battleOverlay
    expect(inMainRam(start, end - start), 'the span in main RAM').toBe(true)
    const apart = passes(() => {
      checkApart('the battle overlay', battleOverlay, bootOverlays)
    })
    expect(apart, 'apart from the boot overlays').toBe(true)
    expect(Object.keys(bootOverlays)).toEqual(Object.keys(BOOT_LINKS))
    const table = data.BATTLE_PROC_FUNCTIONS?.address ?? 0
    expect(table >= start && table < end, 'the battle proc table in the span').toBe(true)
  })

  it("lay out the setup's members inside it and the proc manager's next words in a row", () => {
    const { BtlSetup: setup, GameProcManager: manager } = real().entry.layouts
    const members = ['battleStyle', 'fieldSituation.bgm', 'party', 'playerInfo', 'trainers']
    const size = setup?.size ?? 0
    const outside = [...members, 'gameData', 'config'].filter((name) => {
      const field = setup?.fields[name]
      return field === undefined || field.offset + field.size > size
    })
    expect(outside).toEqual([])
    const word = (name: string) => manager?.fields[name]?.size === 4
    const at = (name: string) => manager?.fields[name]?.offset ?? -1
    const next = ['queued', 'nextOverlayId', 'nextFunctions', 'nextParam']
    expect(
      next.filter((name) => !word(name)),
      'each a word',
    ).toEqual([])
    const row =
      at('nextFunctions') === at('nextOverlayId') + 4 && at('nextParam') === at('nextFunctions') + 4
    expect(row, 'the next words in a row').toBe(true)
  })

  it('name each constant of the entry, the overlay of none below zero and the others not', () => {
    const { constants } = real().entry
    const names = [
      'HEAPID_USER',
      'OVERLAY_BATTLE_MAIN',
      'OVERLAY_NONE',
      'SND_CHANNEL_MASK_ALL',
      'TRAINER_CLASS_YOUNGSTER',
      'CONFIG_TEXT_SPEED_FAST',
      'CHAR_EOM',
      'BTL_STYLE_SINGLE',
      'BTL_STYLE_DOUBLE',
      'SEQ_BGM_VS_TRAINER',
    ]
    expect(Object.keys(constants).sort()).toEqual([...names].sort())
    const signs = names.filter((name) => (constants[name] ?? 0) < 0 !== (name === 'OVERLAY_NONE'))
    expect(signs).toEqual([])
  })

  it("fit the terminator in a character, a name in the trainer's buffer, and whole Pokémon in the party", () => {
    const { constants, layouts, bufferSizes } = real().entry
    const size = (struct: string, member: string) => layouts[struct]?.fields[member]?.size ?? 0
    const terminator = constants.CHAR_EOM ?? -1
    const fits = terminator >= 0 && terminator < 2 ** (8 * size('StrBuf', 'chars'))
    expect(fits, 'the terminator fits').toBe(true)
    expect((bufferSizes.TrainerBattleSetup_Create ?? 0) > 1, 'room for a name').toBe(true)
    const pkm = layouts.PartyPkm?.size ?? 0
    expect(pkm > 0 && size('PokeParty', 'pkms') % pkm === 0, 'whole Pokémon').toBe(true)
  })

  it("fit each block in its chunk and give the block table a row for each selector's value", () => {
    const { layouts, blockOffsets, selector } = real().pkm
    const chunk = layouts.PkmBufferChunk?.size ?? 0
    const blocks = ['PkmBlockA', 'PkmBlockB', 'PkmBlockC', 'PkmBlockD']
    const long = blocks.filter((name) => !((layouts[name]?.size ?? Infinity) <= chunk))
    expect(long, 'blocks past the chunk').toEqual([])
    const rows = (selector.mask >>> selector.shift) + 1
    expect(chunk > 0 && blockOffsets.length >= rows, 'a row for each value').toBe(true)
  })
})
