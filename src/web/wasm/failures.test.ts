import { describe, expect, it } from 'vitest'

import { SlotError, SlotMismatchError } from '../../patch/slot'
import {
  buildFailure,
  instantiateFailure,
  instantiateFailureLine,
  MemoryRefusal,
  MODULE_MEMORY_BYTES,
  RETURNED,
  RunFailure,
  stopFailure,
  workerFailure,
  writeFailure,
} from './failures'

// The words each browser gives when it cannot reserve a module's fixed memory at instantiation.
const CHROMIUM =
  'WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance'
const FIREFOX = 'could not allocate memory'

describe('instantiateFailureLine', () => {
  it('says that the browser refused the memory, with the number, for each browser', () => {
    for (const words of [CHROMIUM, FIREFOX]) {
      const line = instantiateFailureLine(new RangeError(words))
      expect(line).toContain('This browser did not give the game the 256 MB of memory it needs')
      expect(line).toContain(words)
      expect(line).not.toContain('did not instantiate')
    }
  })

  it('reads the words when the error is no RangeError', () => {
    for (const words of [CHROMIUM, FIREFOX]) {
      expect(instantiateFailureLine(new Error(words))).toContain('256 MB of memory')
    }
  })

  it('takes any RangeError of the instantiation as a refused memory', () => {
    expect(instantiateFailureLine(new RangeError('Out of memory'))).toContain('256 MB of memory')
  })

  // Each Start makes a new worker that instantiates the module again, so the dump stays picked.
  it('names the remedy a phone has', () => {
    expect(instantiateFailureLine(new RangeError(CHROMIUM))).toContain(
      'Close other tabs or apps, then press Start again.',
    )
  })

  it('keeps the present line for any other error', () => {
    const link = new WebAssembly.LinkError('import object field "irvFrame" is not a Function')
    expect(instantiateFailureLine(link)).toBe(
      'The module did not instantiate: import object field "irvFrame" is not a Function',
    )
    expect(instantiateFailureLine('a thrown string')).toBe(
      'The module did not instantiate: a thrown string',
    )
  })

  // A link error about the memory's import is a build mismatch, not a refusal.
  it('keeps the present line for an error that names memory but no allocation', () => {
    const link = new WebAssembly.LinkError('memory import must be a WebAssembly.Memory object')
    expect(instantiateFailureLine(link)).toContain('The module did not instantiate')
  })

  it('counts the memory in bytes as the link gives it', () => {
    expect(MODULE_MEMORY_BYTES).toBe(256 * 1024 * 1024)
  })
})

// The page applies the patch to the dump and compiles the module before any worker starts.
describe('buildFailure', () => {
  const LINE =
    'This browser ran out of memory while it built the game from your dump (Array buffer ' +
    'allocation failed). Close other tabs or apps, then load the page again and pick your dump.'

  it('says that the browser ran out of memory, with its words and the remedy', () => {
    const failure = buildFailure(new RangeError('Array buffer allocation failed'))
    expect(failure).toBeInstanceOf(MemoryRefusal)
    expect((failure as Error).message).toBe(LINE)
  })

  it('reads the words when the error is no RangeError', () => {
    expect(String(buildFailure(new Error(`WebAssembly.compile(): ${CHROMIUM}`)))).toContain(
      'ran out of memory while it built the game',
    )
  })

  it('passes any other failure on as it came', () => {
    const other = new Error('the patch does not fit this dump')
    expect(buildFailure(other)).toBe(other)
    expect(buildFailure('a thrown string')).toBe('a thrown string')
  })
})

// The worker's failed report names its kind, so the page can give the visitor a line (#59).
describe("the worker's failed reports", () => {
  it('names a refused memory and any other failure of the instantiation apart', () => {
    expect(instantiateFailure(new RangeError(CHROMIUM))).toEqual({
      type: 'failed',
      kind: 'memory',
      line: instantiateFailureLine(new RangeError(CHROMIUM)),
    })
    const link = new WebAssembly.LinkError('import object field "irvFrame" is not a Function')
    expect(instantiateFailure(link)).toEqual({
      type: 'failed',
      kind: 'instantiate',
      line: instantiateFailureLine(link),
    })
  })

  it('names a slot of another build apart from any other refusal of the write', () => {
    const mismatch = new SlotMismatchError('the slot header names another build')
    expect(writeFailure(mismatch)).toEqual({
      type: 'failed',
      kind: 'mismatch',
      line: 'Could not write the replay into the module: the slot header names another build',
    })
    const tooLong = new SlotError('the stream has 40000 bytes, the replay slot holds 16')
    expect(writeFailure(tooLong)).toMatchObject({ kind: 'write' })
  })

  it("names the game's stop and the return of AgbMain", () => {
    expect(stopFailure(new Error('unreachable'))).toEqual({
      type: 'failed',
      kind: 'stopped',
      line: 'The game stopped: unreachable',
    })
    expect(RETURNED).toEqual({
      type: 'failed',
      kind: 'returned',
      line: 'AgbMain returned, which the game never does',
    })
  })

  // S5-11 (b): the worker's error event comes from a throw the worker did not catch, so the page
  // reads it as the game's stop, with the event's words as the line.
  it("reads the worker's own error as the game's stop", () => {
    expect(workerFailure('Uncaught RangeError: offset is out of bounds')).toEqual({
      type: 'failed',
      kind: 'stopped',
      line: 'The worker failed: Uncaught RangeError: offset is out of bounds',
    })
  })

  it('keeps the kind and the line in the RunFailure the page makes of a report', () => {
    const failure = new RunFailure(stopFailure('unreachable'))
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ kind: 'stopped', message: 'The game stopped: unreachable' })
  })
})
