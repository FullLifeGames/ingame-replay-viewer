import { describe, expect, it } from 'vitest'

import { BpsError } from '../patch/bps-format'
import { SlotMismatchError } from '../patch/slot'
import { EmulatorError } from './emulator'
import { messageOf } from './message'
import {
  createReplayChoice,
  failed,
  LARGEST_FILE,
  PICK_DUMP,
  type ReplayPlace,
  SessionError,
} from './replay-choice'
import { BuildMismatchError, patchBaseRom, RomError } from './rom'
import { BASE, DESCRIPTION, PATCH } from './session-testing'
import { visitorLine } from './visitor'
import { buildFailure, RunFailure } from './wasm/failures'

const REPORT = 'Report it with the link below.'
const RELOAD = 'Reload the page. If it fails again, report it with the link below.'
const EXAMPLE: ReplayPlace = { source: 'example', replay: 'smogtours-gen3ou-994052' }

/** The refusal of a pick or a build that fails. */
const refusalOf = (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => {
      throw new Error('the work did not fail')
    },
    (error: unknown) => error,
  )

/** replay-slot.json of another build: the patched ROM's SHA1 is not the one it names. */
const OTHER_BUILD = { ...DESCRIPTION, romSha1: '0'.repeat(40) }

const offline = () => createReplayChoice(() => Promise.reject(new Error('offline')))

describe('visitorLine for the game and the build', () => {
  const MISMATCH = `The site's game files do not match each other. ${RELOAD}`

  it.each<[string, () => unknown]>([
    ['BuildMismatchError', () => refusalOf(patchBaseRom(BASE, PATCH, OTHER_BUILD))],
    ['SlotMismatchError', () => new SlotMismatchError('the slot header names another build')],
    ['BpsError', () => new BpsError('BPS: the target checksum differs from the one in the patch')],
    ['CompileError', () => new WebAssembly.CompileError('bad magic')],
    ['worker mismatch', () => new RunFailure({ kind: 'mismatch', line: 'slot header' })],
    ['worker instantiate', () => new RunFailure({ kind: 'instantiate', line: 'link error' })],
  ])('gives a %s the build mismatch line', async (name, make) => {
    const error = await make()
    if (name === 'BuildMismatchError') expect(error).toBeInstanceOf(BuildMismatchError)
    expect(visitorLine(error)).toEqual({ line: MISMATCH, detail: messageOf(error), report: true })
  })

  it.each(['stopped', 'returned'] as const)('gives a run that %s the game stop line', (kind) => {
    const run = new RunFailure({ kind, line: 'The game stopped: unreachable' })
    expect(visitorLine(run, EXAMPLE)).toEqual({
      line: `The game stopped during this replay. ${REPORT}`,
      detail: 'The game stopped: unreachable',
      report: true,
      replay: EXAMPLE.replay,
    })
  })

  it('gives a file over the bound its size and the bound', async () => {
    const big = { name: 'big.log', size: LARGEST_FILE + 1, text: () => Promise.resolve('') }
    const refusal = await refusalOf(offline().loadFile(big))
    expect(visitorLine(refusal)).toMatchObject({
      line: 'big.log holds 5.1 MB, and the viewer reads replay files up to 5 MB. Pick the replay file you saved from Showdown.',
      report: false,
    })
  })
})

describe('visitorLine keeps the lines that speak to visitors', () => {
  it.each([
    ['the link input', () => refusalOf(offline().loadReplay('xz abc'))],
    [
      'the dump',
      () =>
        Promise.resolve(
          failed(
            'Could not patch your dump',
            new RomError('This file is not the US Emerald dump the patch fits.'),
          ),
        ),
    ],
    ['Start', () => Promise.resolve(new SessionError(PICK_DUMP))],
    [
      'the emulator',
      () => Promise.resolve(new EmulatorError('The emulator did not accept the ROM.')),
    ],
    ['the build memory', () => Promise.resolve(buildFailure(new RangeError('Out of memory')))],
    [
      'the run memory',
      () =>
        Promise.resolve(
          new RunFailure({
            kind: 'memory',
            line: 'This browser did not give the game the memory.',
          }),
        ),
    ],
  ])('of %s as they are', async (_, make) => {
    const error = await make()
    expect(visitorLine(error)).toMatchObject({
      line: messageOf(error),
      detail: messageOf(error),
      report: false,
    })
  })

  it.each([new Error('x'), 'a thrown text', undefined])(
    'has a line for a value with no rule: %s',
    (value) => {
      expect(visitorLine(value)).toEqual({
        line: `The page hit a problem it has no line for. ${REPORT}`,
        detail: messageOf(value),
        report: true,
      })
    },
  )
})
