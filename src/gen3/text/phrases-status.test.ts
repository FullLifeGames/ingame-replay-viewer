import { describe, expect, it } from 'vitest'

import { cant, itemCured, rested, statusCured, statusGiven, teamCured } from './phrases-status'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

describe('status phrases (P1)', () => {
  it.each([
    ['slp', 'The opposing Tyranitar fell asleep!'],
    ['psn', 'The opposing Tyranitar was poisoned!'],
    ['tox', 'The opposing Tyranitar was badly poisoned!'],
    ['brn', 'The opposing Tyranitar was burned!'],
    ['frz', 'The opposing Tyranitar was frozen solid!'],
    ['par', 'The opposing Tyranitar is paralyzed, so it may be unable to move!'],
  ])('words the status %s', (status, text) => {
    const { event, mon } = sceneOf('status', `|-status|p2a: Tyranitar|${status}`)
    expect(statusGiven(mon(event.who), event.status)).toBe(text)
  })

  it('says Rest put a Pokémon to sleep, and that it healed a status if it had one', () => {
    const { event, mon } = sceneOf('status', '|-status|p1a: Dugtrio|slp|[from] move: Rest')
    expect(rested(mon(event.who), false)).toBe('Dugtrio went to sleep!')
    expect(rested(mon(event.who), true)).toBe('Dugtrio slept and restored its HP!')
  })

  it.each([
    ['slp', 'Dugtrio woke up!'],
    ['frz', 'Dugtrio thawed out!'],
    ['par', 'Dugtrio was cured of paralysis!'],
    ['psn', 'Dugtrio was cured of its poisoning!'],
    ['tox', 'Dugtrio was cured of its poisoning!'],
    ['brn', "Dugtrio's burn was cured!"],
  ])('words the cure of %s', (status, text) => {
    const { event, mon } = sceneOf('cureStatus', `|-curestatus|p1a: Dugtrio|${status}|[msg]`)
    expect(statusCured(mon(event.who), event.status)).toBe(text)
  })

  it.each([
    ['par', `Dugtrio's Lum${NBSP}Berry cured its paralysis!`],
    ['tox', `Dugtrio's Lum${NBSP}Berry cured its poison!`],
    ['brn', `Dugtrio's Lum${NBSP}Berry cured its burn!`],
    ['frz', `Dugtrio's Lum${NBSP}Berry defrosted it!`],
    ['slp', `Dugtrio's Lum${NBSP}Berry woke it up!`],
  ])('words a berry that cures %s', (status, text) => {
    const { event, mon } = sceneOf('cureStatus', `|-curestatus|p1a: Dugtrio|${status}|[msg]`)
    expect(itemCured(mon(event.who), 'Lum Berry', event.status)).toBe(text)
  })

  it.each([
    ['Aromatherapy', { text: 'A soothing aroma wafted through the area!' }],
    ['Heal Bell', { text: 'A bell chimed!' }],
    [
      'Refresh',
      {
        text: "Dugtrio's team was cured!",
        fallback: { kind: 'phrase', detail: 'no game message for a team cured by Refresh' },
      },
    ],
  ])('words a team cure by %s', (move, phrase) => {
    const { event, mon } = sceneOf('cureTeam', `|-cureteam|p1a: Dugtrio|[from] move: ${move}`)
    expect(teamCured(mon(event.who), event.cause)).toEqual(phrase)
  })
})

describe('a team cure with no cause (P1)', () => {
  it('gets our wording and a fallback', () => {
    const { event, mon } = sceneOf('cureTeam', '|-cureteam|p1a: Dugtrio')
    expect(teamCured(mon(event.who), event.cause).fallback).toEqual({
      kind: 'phrase',
      detail: 'no game message for a team cured',
    })
  })
})

describe('a Pokémon that cannot move (P1)', () => {
  it.each([
    ['slp', 'Dugtrio is fast asleep.'],
    ['frz', 'Dugtrio is frozen solid!'],
    ['par', "Dugtrio couldn't move because it's paralyzed!"],
    ['flinch', "Dugtrio flinched and couldn't move!"],
    ['recharge', 'Dugtrio must recharge!'],
    ['Focus Punch|Focus Punch', "Dugtrio lost its focus and couldn't move!"],
    ['Attract', 'Dugtrio is immobilized by love!'],
    ['ability: Truant', 'Dugtrio is loafing around!'],
    ['move: Taunt|Earthquake', "Dugtrio can't use Earthquake after the taunt!"],
    ['Disable|Rock Slide', `Dugtrio's Rock${NBSP}Slide is disabled!`],
  ])('words %s', (reason, text) => {
    const { event, mon } = sceneOf('cant', `|cant|p1a: Dugtrio|${reason}`)
    expect(cant(mon(event.who), event.reason, event.move)).toEqual({ text })
  })

  it('gives a reason without a game message our wording and a fallback', () => {
    const { event, mon } = sceneOf('cant', '|cant|p2a: Tyranitar|Sky Drop')
    expect(cant(mon(event.who), event.reason, event.move)).toEqual({
      text: "The opposing Tyranitar couldn't move!",
      fallback: { kind: 'phrase', detail: 'no game message for a Pokémon held back by Sky Drop' },
    })
  })

  it('gives a move-bound reason without its move our wording too', () => {
    const { event, mon } = sceneOf('cant', '|cant|p1a: Dugtrio|move: Taunt')
    expect(cant(mon(event.who), event.reason, event.move).fallback).toMatchObject({
      kind: 'phrase',
    })
  })
})
