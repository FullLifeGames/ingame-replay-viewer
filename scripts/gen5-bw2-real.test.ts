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
import { MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import { momentCommands } from '../src/gen5/moment.ts'
import { packCommands } from '../src/gen5/server-cmd.ts'
import { checkAdapterLayout, SYMBOL_NAMES } from './gen5-bw2.ts'
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
})
