import { describe, expect, it } from 'vitest'

import { printedCommand, printedPages } from './printed.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented box: every character 8 pixels wide but the space, which is 2; a line of 248
// pixels, three lines a page.
const narrow = { ...NUMBERS, textBox: { ...NUMBERS.textBox, windowWidth: 40 } }

// Scene: the last lines of replay 1 print in Black 2's text box (#118).
describe('printedPages', () => {
  it('prints the forfeit of replay 1 as one page of one line', () => {
    expect(printedPages('isolatedstar forfeited.', 40, NUMBERS)).toEqual({
      pages: ['isolatedstar forfeited.'],
      fallbacks: [],
    })
  })

  // Scene: a clause's note of the simulator, longer than the window.
  it('breaks a text past the width at the last space that fits', () => {
    const note = 'Sleep Clause Mod activated. Bob cannot put a second foe to sleep.'
    expect(printedPages(note, 40, NUMBERS).pages).toEqual([
      'Sleep Clause Mod activated. Bob\ncannot put a second foe to sleep.',
    ])
  })

  it('breaks a word wider than a line inside it', () => {
    expect(printedPages('Thunderstorm', 40, narrow).pages).toEqual(['Thund\nersto\nrm'])
  })

  // Lane plan D4: a text past a page's lines goes out as one block per page.
  it('gives a page for each of the window’s lines in turn', () => {
    expect(printedPages('Rain Sun Hail Sand', 40, narrow).pages).toEqual([
      'Rain\nSun\nHail',
      'Sand',
    ])
  })

  // Lane plan D10: a character the font lacks shows as "?", as in a name.
  it('puts "?" for a character the font lacks and lists it at the line', () => {
    expect(printedPages('Pokémon Center forfeited.', 7, NUMBERS)).toEqual({
      pages: ['Pok?mon Center forfeited.'],
      fallbacks: [
        {
          line: 7,
          kind: 'character',
          detail: 'the printed line "Pokémon Center forfeited." shows "?" for "é"',
        },
      ],
    })
  })

  it('fails by name on a character with no advance', () => {
    const advances = Object.fromEntries(
      Object.entries(NUMBERS.textBox.advances).filter(([char]) => char !== 'Z'),
    )
    const box = { ...NUMBERS, textBox: { ...NUMBERS.textBox, advances } }
    expect(() => printedPages('Zekrom forfeited.', 7, box)).toThrow(
      'font 0 has no advance for "Z" (line 7)',
    )
  })
})

// Scene: a printed block sends the carrier, and the page writes the text over it (lane plan D3).
describe('printedCommand', () => {
  it('sends the carrier line of the standard bank', () => {
    expect(printedCommand(NUMBERS)).toEqual({
      command: 'SC_MSG_STD',
      message: NUMBERS.text.standard.Bank0019_Text_ButNothingHappened,
      args: [],
    })
  })

  it('fails by name on a carrier the standard bank lacks', () => {
    const text = { ...NUMBERS.text, standard: {} }
    expect(() => printedCommand({ ...NUMBERS, text })).toThrow(
      'bw2.json has no Bank0019_Text_ButNothingHappened',
    )
  })
})
