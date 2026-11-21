import { describe, expect, it } from 'vitest'

import { checkMakeArgs, parseCheckArgs, readTestSummary } from './rom-check.ts'

describe('the rom:check arguments', () => {
  it('runs the replay tests by default', () => {
    expect(parseCheckArgs([])).toEqual({ tests: 'Replay' })
  })

  it('takes a name prefix, an infix with a leading star, or a test file', () => {
    expect(parseCheckArgs(['Intimidate'])).toEqual({ tests: 'Intimidate' })
    expect(parseCheckArgs(['*Intimidate'])).toEqual({ tests: '*Intimidate' })
    expect(parseCheckArgs(['test/battle/ability/intimidate.c'])).toEqual({
      tests: 'test/battle/ability/intimidate.c',
    })
  })

  it.each([
    ['a space', 'Replay: END'],
    ['a semicolon', 'Replay;rm'],
    ['a command substitution', '$(id)'],
    ['a backtick', '`id`'],
    ['a quote', 'Re"play'],
    ['a star inside', 'Re*play'],
    ['nothing', ''],
  ])('refuses a filter with %s, which reaches a shell line in the Makefile', (_, filter) => {
    expect(() => parseCheckArgs([filter])).toThrow(
      `"${filter}" is no test filter: use letters, digits and _ . / - and one leading *`,
    )
  })

  it('takes one filter only', () => {
    expect(() => parseCheckArgs(['Replay', 'Intimidate'])).toThrow()
  })
})

describe('the make line', () => {
  it('asks for the check goal with the filter as a make variable', () => {
    expect(checkMakeArgs('Replay')).toEqual(['check', 'TESTS=Replay'])
  })
})

describe('the test summary', () => {
  const log = [
    'cd build/emerald-test && arm-none-eabi-ld ...',
    '',
    "- Tests \u001b[31mFAILED\u001b[0m:          2    Add TESTS='X' to run tests with the defined prefix.",
    '- Tests \u001b[32mPASSED\u001b[0m:          6',
    '- Tests \u001b[34mTOTAL\u001b[0m:           8',
    '',
  ].join('\n')

  it('reads the summary lines of mgba-rom-test-hydra without their colours', () => {
    expect(readTestSummary(log)).toEqual({
      lines: ['- Tests FAILED: 2', '- Tests PASSED: 6', '- Tests TOTAL: 8'],
      total: 8,
    })
  })

  it('has no total when the runner printed none', () => {
    expect(readTestSummary('make: *** [Makefile:350] Error 1\n')).toEqual({
      lines: [],
      total: undefined,
    })
  })
})
