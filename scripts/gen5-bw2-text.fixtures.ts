// The invented text banks that the text reader's specs hand to it (#107): the labels the backend
// names, in an order of their own between filler labels, and each bank's pad line last. The text
// after each label is our own, not the game's. The reader keeps a label's line index, so
// scripts/gen5-fixtures-real.test.ts compares those indices with the generated ones.
import type { TextInput } from './gen5-bw2-text.ts'

const bank = (lines: readonly string[]) => `${lines.join('\n')}\n`

/** A standard bank of seven labels and a set bank of five, each with filler labels between the
 * backend's own. */
export const TEXT_INPUT: TextInput = {
  standardBank: bank([
    'Bank0019_Text_FillerAlpha = An invented line.',
    'Bank0019_Text_CriticalHit = An invented line for a hard hit.',
    'Bank0019_Text_FillerBeta = Another invented line.',
    'Bank0019_Text_ItsNotVeryEffective = An invented line for a weak hit.',
    'Bank0019_Text_ButFailed = An invented line for a move that\\ndid nothing.',
    'Bank0019_Text_FillerGamma = A third invented line.',
    'Bank0019_Text_ItsSuperEffective = An invented line for a strong hit.',
    '\\pad{9}',
  ]),
  setBank: bank([
    'Bank0018_Text_DoesntAffect = {0102:0} shrugs off the invented line.',
    'Bank0018_Text_FillerDelta = An invented line on {0102:0}.',
    'Bank0018_Text_RestoredLittleHpUsing = {0102:0} feels better with its {0109:1}.',
    'Bank0018_Text_AvoidedAttack = {0102:0} steps aside in an invented line.',
    'Bank0018_Text_FillerEpsilon = A last invented line.',
    '\\pad{5}',
  ]),
}
