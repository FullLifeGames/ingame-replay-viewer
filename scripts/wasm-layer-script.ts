// The harness's `script` command (rom/gen3/wasm/layer/host/irv_layer_host_script.c): a list of
// operations on a GBA address space of its own, run against our platform layer. Each operation is
// its code and its operands as little-endian words. The reads, the frames and the IRQ logs append
// their bytes to the destination in order; the result counts the IRQ handler's calls in its upper
// half and ORs their flags in its lower.
import { runLayer } from './wasm-layer.ts'

export type Op = number[]

/** The bytes as little-endian words, the last one padded with zeros. */
function packed(bytes: ArrayLike<number>): number[] {
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4)
  padded.set(Array.from(bytes))
  return Array.from(new Uint32Array(padded.buffer))
}

export const halves = (values: readonly number[]) =>
  Array.from(new Uint8Array(Uint16Array.from(values).buffer))
export const wordBytes = (values: readonly number[]) =>
  Array.from(new Uint8Array(Uint32Array.from(values).buffer))
export const asHalves = (bytes: Uint8Array) => Array.from(new Uint16Array(bytes.slice().buffer))
export const asWords = (bytes: Uint8Array) => Array.from(new Uint32Array(bytes.slice().buffer))
export const asFloats = (bytes: Uint8Array) => Array.from(new Float32Array(bytes.slice().buffer))

export const load = (address: number, bytes: ArrayLike<number>): Op => [
  1,
  address,
  bytes.length,
  ...packed(bytes),
]
export const dmaSet = (channel: number, src: number, dest: number, control: number): Op => [
  2,
  channel,
  src,
  dest,
  control,
]
/** RunDMAs(timing). */
export const run = (timing: number): Op => [3, timing]
export const write16 = (address: number, value: number): Op => [4, address, value]
/** IrvLayer_RaiseIrq(flag). */
export const raise = (flag: number): Op => [5, flag]
export const read = (address: number, length: number): Op => [6, address, length]
/** From here on, each call of the IRQ handler for `flag` writes `value` to `address` first. */
export const onIrq = (flag: number, address: number, value: number): Op => [7, flag, address, value]

/** One frame of the frame driver; appends its 240x160 BGR555 pixels. */
export const frame: Op = [8]
export const FRAME_WIDTH = 240
export const FRAME_HEIGHT = 160
export const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 2

/**
 * One frame as `frame` does, then the harness's trace of it: per pixel the top two layers'
 * colours (16 bits each), the effect (0 none, 1 alpha, 2 brighter, 3 darker), EVA, EVB and EVY.
 */
export const traceFrame: Op = [10]
const TRACE_ENTRY = 8
export const TRACE_BYTES = FRAME_WIDTH * FRAME_HEIGHT * TRACE_ENTRY

/** IrvPsg_Reset(rate): the PSG anew, its output at `rate` pairs per second. */
export const psgReset = (rate: number): Op => [11, rate]
/** IrvPsg_Frame: reads the sound registers once and appends `count` pairs of 32-bit floats. */
export const psgFrame = (count: number): Op => [12, count]
export const PSG_PAIR_BYTES = 8

/** Appends the first `max` calls of the IRQ handler as a flag and VCOUNT each, zeros after them. */
export const irqLog = (max: number): Op => [9, max]
export const IRQ_LOG_ENTRY = 4

export interface ScriptResult {
  calls: number
  flags: number
  dest: Uint8Array
  /** The lines the layer printed. */
  log: string
}

/** Runs a script; `reads` is the byte count its reads, frames and logs append together. */
export function runScript(host: string, ops: readonly Op[], reads: number): ScriptResult {
  const { result, dest, log } = runLayer(host, 'script', {
    src: wordBytes(ops.flat()),
    dest: new Uint8Array(reads),
  })
  return { calls: result >>> 16, flags: result & 0xffff, dest, log }
}

export interface PixelTrace {
  top: number
  below: number
  effect: number
  eva: number
  evb: number
  evy: number
}

/** Pixel `i` of a trace that `traceFrame` appended. */
export function traceAt(trace: Uint8Array, i: number): PixelTrace {
  const view = new DataView(trace.buffer, trace.byteOffset + i * TRACE_ENTRY, TRACE_ENTRY)
  return {
    top: view.getUint16(0, true),
    below: view.getUint16(2, true),
    effect: view.getUint8(4),
    eva: view.getUint8(5),
    evb: view.getUint8(6),
    evy: view.getUint8(7),
  }
}
