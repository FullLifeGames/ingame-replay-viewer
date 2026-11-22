import { describe, expect, it } from 'vitest'

import { FRAME_BYTES } from './frame'
import {
  backBuffer,
  claimFrame,
  frameBuffer,
  publishFrame,
  readFrame,
  releaseFrame,
  waitUntilUnread,
} from './frame-swap'
import { CONTROL, createShared, NOT_READING } from './protocol'

// One thread plays both sides: the worker's steps and the page's steps in a chosen order.
function swap() {
  const shared = createShared(16)
  const control = new Int32Array(shared.control)
  // The worker's whole frame `n`: every byte n, written into the buffer it may write.
  const writeFrame = (n: number) => {
    const back = backBuffer(control)
    expect(waitUntilUnread(control, back, 0)).toBe(true)
    frameBuffer(shared.frames, back).fill(n)
    publishFrame(control, back)
    return back
  }
  const pageReads = () => {
    const into = new Uint8ClampedArray(FRAME_BYTES)
    readFrame(control, shared.frames, into)
    return new Set(into)
  }
  return { shared, control, writeFrame, pageReads }
}

describe('the two frame buffers', () => {
  it('start with buffer 0 in front and no buffer read', () => {
    const { shared, control } = swap()
    expect(shared.frames.byteLength).toBe(2 * FRAME_BYTES)
    expect(control[CONTROL.front]).toBe(0)
    expect(control[CONTROL.reading]).toBe(NOT_READING)
    expect(backBuffer(control)).toBe(1)
  })

  it('give the worker the buffer the page is not reading', () => {
    const { control, writeFrame } = swap()
    expect(writeFrame(1)).toBe(1)
    expect(claimFrame(control)).toBe(1)
    // Frame 2 goes into buffer 0 while the page holds buffer 1.
    expect(writeFrame(2)).toBe(0)
    expect(control[CONTROL.reading]).toBe(1)
  })

  it('make the worker wait for a buffer the page claimed before the worker published', () => {
    const { shared, control, writeFrame } = swap()
    writeFrame(1)
    const claimed = claimFrame(control)
    writeFrame(2)
    // The worker's next frame wants the buffer the page still copies.
    const next = backBuffer(control)
    expect(next).toBe(claimed)
    expect(waitUntilUnread(control, next, 5)).toBe(false)
    expect(new Set(frameBuffer(shared.frames, claimed))).toEqual(new Set([1]))
    releaseFrame(control)
    expect(control[CONTROL.reading]).toBe(NOT_READING)
    expect(waitUntilUnread(control, next, 0)).toBe(true)
  })

  it('hand the page the newest whole frame', () => {
    const { pageReads, writeFrame } = swap()
    expect(pageReads()).toEqual(new Set([0]))
    writeFrame(1)
    expect(pageReads()).toEqual(new Set([1]))
    writeFrame(2)
    writeFrame(3)
    expect(pageReads()).toEqual(new Set([3]))
    writeFrame(4)
    expect(pageReads()).toEqual(new Set([4]))
  })

  it('let the buffer go after each read', () => {
    const { control, pageReads, writeFrame } = swap()
    writeFrame(1)
    pageReads()
    expect(control[CONTROL.reading]).toBe(NOT_READING)
  })

  it('refuse a target that is not one RGBA frame', () => {
    const { shared, control } = swap()
    expect(() => {
      readFrame(control, shared.frames, new Uint8ClampedArray(4))
    }).toThrow(`a frame takes ${String(FRAME_BYTES)} bytes, not 4`)
    expect(control[CONTROL.reading]).toBe(NOT_READING)
  })
})
