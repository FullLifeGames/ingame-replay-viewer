import { describe, expect, it } from 'vitest'

import { TEXT_INPUT } from './gen5-bw2-text.fixtures'
import { textLabels, textNumbers } from './gen5-bw2-text'

// Invented: a bank of three lines, its pad line last, as each of pokebw2's text banks ends.
const BANK = [
  'Bank0042_Text_First = One line.',
  'Bank0042_Text_Second = Another\\nline!',
  'Bank0042_Text_Third = ',
  '\\pad{17}',
  '',
].join('\n')

// Scene: the game finds a line by its index in the bank, so a label's number is its line.
describe('textLabels', () => {
  it('gives each label the index of its line', () => {
    expect(textLabels(BANK, 'standard')).toEqual({
      Bank0042_Text_First: 0,
      Bank0042_Text_Second: 1,
      Bank0042_Text_Third: 2,
    })
  })

  it('skips the pad line at the end alone', () => {
    const padFirst = ['\\pad{17}', 'Bank0042_Text_First = One line.'].join('\n')
    expect(() => textLabels(padFirst, 'set')).toThrow('set: cannot read the first line')
  })

  it('refuses a line of another shape by the bank and the label before it', () => {
    const odd = ['Bank0042_Text_First = One line.', 'a line without a label', '\\pad{3}'].join('\n')
    expect(() => textLabels(odd, 'set')).toThrow(
      'set: cannot read the line after Bank0042_Text_First',
    )
  })

  it('refuses a repeated label', () => {
    const twice = ['Bank0042_Text_First = One.', 'Bank0042_Text_First = Two.'].join('\n')
    expect(() => textLabels(twice, 'standard')).toThrow(
      'standard: the label Bank0042_Text_First stands twice',
    )
  })
})

// Scene: the generated file keeps the standard bank's and the set bank's labels apart.
describe('textNumbers', () => {
  it('reads the standard and the set bank by their roles', () => {
    const text = textNumbers(TEXT_INPUT)
    expect(text.standard.Bank0019_Text_ButFailed).toBe(4)
    expect(text.set.Bank0018_Text_RestoredLittleHpUsing).toBe(2)
    expect(Object.keys(text.standard)).toHaveLength(7)
    expect(Object.keys(text.set)).toHaveLength(5)
  })
})
