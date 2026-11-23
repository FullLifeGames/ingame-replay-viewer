import { describe, expect, it } from 'vitest'

import { EmulatorError, NOT_STARTED_LINE } from './emulator'
import { environmentProblem } from './environment'
import { messageOf } from './message'
import { createReplayChoice, PICK_DUMP, PICK_REPLAY, SessionError } from './replay-choice'
import { detailShown, environmentLine, visitorLine } from './visitor'
import { buildFailure, instantiateFailure, RunFailure } from './wasm/failures'

const LINK_LINE =
  '"Replay link or ID" takes a replay ID such as smogtours-gen3ou-994052, or a link to a replay ' +
  'on replay.pokemonshowdown.com.'

const FORBIDDEN = /npm run|localhost|devbox|tailscale|README/

/** The refusal of a Load of `input` in the link field. */
async function refusalOf(input: string): Promise<unknown> {
  const choice = createReplayChoice(() => Promise.reject(new Error('the field refuses first')))
  return choice.loadReplay(input).then(
    () => {
      throw new Error(`the Load of ${JSON.stringify(input)} did not fail`)
    },
    (error: unknown) => error,
  )
}

// The tester's four texts (#59): a link with no ID, words that are no ID, another host, nothing.
describe('visitorLine for a refusal of the link field', () => {
  it.each([
    ['a link with no ID', 'https://replay.pokemonshowdown.com/'],
    ['words that are no ID', 'my replay from yesterday'],
    ['a link to another host', 'https://example.com/gen3ou-1234'],
    ['an empty field', ''],
  ])('says what the field takes for %s, with the module words for "Details"', async (_, input) => {
    const refusal = await refusalOf(input)
    const shown = visitorLine(refusal)
    expect(shown).toEqual({
      line: LINK_LINE,
      detail: messageOf(refusal),
      report: false,
      replay: input.trim(),
    })
    expect(shown.detail).toMatch(/^Could not read the replay link: /)
    expect(detailShown(shown)).toBe(shown.detail)
    expect(shown.line).not.toMatch(FORBIDDEN)
  })
})

// One rule for both pages (#59): a "Details" that repeats its line word for word tells nothing.
describe('detailShown', () => {
  it.each([PICK_DUMP, PICK_REPLAY])('shows no "Details" under the kept line "%s"', (words) => {
    const shown = visitorLine(new SessionError(words))
    expect(shown.line).toBe(words)
    expect(detailShown(shown)).toBe('')
  })

  it('shows the detail of a line that says something else', () => {
    expect(detailShown({ line: 'The page hit a problem.', detail: 'x', report: true })).toBe('x')
  })

  it('shows no "Details" for a line with no detail of its own', () => {
    expect(detailShown({ line: 'Picked 994052. Press Start.', detail: '', report: false })).toBe('')
  })

  it('keeps a detail that differs from its line by a single character', () => {
    const shown = { line: 'Pick a replay.', detail: 'Pick a replay', report: false }
    expect(detailShown(shown)).toBe('Pick a replay')
  })
})

// The render walk of visitor-report.test.ts covers the table; a kept line shows a module's words.
describe('the kept lines', () => {
  const workers = environmentProblem(
    { isSecureContext: true, crossOriginIsolated: true, moduleWorkers: false },
    'the game',
  )
  it.each<[string, () => string]>([
    ['Start without a dump', () => visitorLine(new SessionError(PICK_DUMP)).line],
    ['Start without a replay', () => visitorLine(new SessionError(PICK_REPLAY)).line],
    ['the emulator', () => visitorLine(new EmulatorError(NOT_STARTED_LINE)).line],
    ['the build memory', () => visitorLine(buildFailure(new RangeError('Out of memory'))).line],
    [
      'the run memory',
      () => visitorLine(new RunFailure(instantiateFailure(new RangeError('Out of memory')))).line,
    ],
    [
      'the module worker',
      () =>
        workers === undefined ? '' : environmentLine(workers, { host: 'x', pathname: '/' }).line,
    ],
  ])('hold no developer word: %s', (_, lineOf) => {
    const line = lineOf()
    expect(line).not.toBe('')
    expect(line).not.toMatch(FORBIDDEN)
    expect(line).not.toMatch(/[0-9a-f]{40}/)
  })
})
