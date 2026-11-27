import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import { chargeTurnOf } from '../tables/charge'
import type { Mon } from './names'
import { chargeLine } from './phrases-charge'
import { sceneOf } from './testing'

const CHARGING = Dex.moves.all().filter((move) => move.gen <= 5 && move.flags.charge === 1)

describe('the charge lines (P1)', () => {
  const { event, mon } = sceneOf('prepare', '|-prepare|p2a: Tyranitar|Solar Beam')
  const user = mon(event.user)
  const target = mon({ side: 'near', index: 0 })
  const lineOf = (move: string, of: Mon | undefined = target) =>
    chargeLine(user, move, chargeTurnOf(move)?.stringId, of)

  it("say the line of the move's charge turn", () => {
    const sunlight = chargeTurnOf('Solar Beam')?.stringId
    expect(chargeLine(user, 'Solar Beam', sunlight, undefined)).toEqual({
      text: 'The opposing Tyranitar absorbed light!',
    })
  })

  it('give every charging move of Gen 1 to 5 its game line', () => {
    const own = CHARGING.filter(({ name }) => lineOf(name).fallback)
    expect(own.map(({ name }) => name)).toEqual([])
  })

  it('say the charge lines of Gen 4 and 5 in the game words (#105)', () => {
    expect(lineOf('Shadow Force')).toEqual({ text: 'The opposing Tyranitar vanished instantly!' })
    const freezing = { text: 'The opposing Tyranitar became cloaked in a freezing light!' }
    expect(lineOf('Freeze Shock')).toEqual(freezing)
    expect(lineOf('Ice Burn')).toEqual(freezing)
  })

  it("name Sky Drop's target as the game does, and list a Sky Drop with none (D10)", () => {
    expect(lineOf('Sky Drop')).toEqual({
      text: 'The opposing Tyranitar took Dugtrio into the sky!',
    })
    const aimless = chargeLine(user, 'Sky Drop', chargeTurnOf('Sky Drop')?.stringId, undefined)
    // The move's name keeps the no-break space the game's charset gives it.
    expect({ ...aimless, text: aimless.text.replaceAll('\u00a0', ' ') }).toEqual({
      text: 'The opposing Tyranitar is charging Sky Drop!',
      fallback: {
        kind: 'phrase',
        detail: 'no game message for the charge turn of Sky Drop with no target',
      },
    })
  })

  it('word a charge turn the game has no line for, and list it', () => {
    expect(chargeLine(user, 'Geomancy', undefined, undefined)).toEqual({
      text: 'The opposing Tyranitar is charging Geomancy!',
      fallback: { kind: 'phrase', detail: 'no game message for the charge turn of Geomancy' },
    })
  })
})
