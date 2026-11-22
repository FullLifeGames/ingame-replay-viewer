// The game module as its hosts see it: the exports and imports of build/wasm/irv-emerald.js, the
// stream written into its slot, and the frame hook of the page's worker. DOM-free; the Node
// harness (scripts/wasm-run.ts) shares the module's shape.
import {
  checkSlotHeader,
  type SlotDescription,
  SlotMismatchError,
  type SlotHeaderLayout,
  writeReplaySlot,
} from '../../patch/slot.ts'
import { FRAME_BYTES, widenFrame } from './frame.ts'
import { readProgress, type ProgressLayout } from './progress.ts'
import { type SharedBuffers, waitForTick, writeStatus } from './protocol.ts'

/** What a host uses of the module that build/wasm/irv-emerald.js instantiates. */
export interface GameModule {
  HEAPU8: Uint8Array
  HEAPU16: Uint16Array
  _AgbMain(): void
  _IrvWasm_Slot(): number
  _IrvWasm_Progress(): number
}

/**
 * The imports the module calls: the frame (irv_wasm_frame.c), the frame's sound
 * (irv_wasm_sound.c) and its two print lines.
 */
export interface ModuleHooks {
  /**
   * Gets the address of the frame's 240x160 BGR555 words. It may return, block, or throw an
   * object; never a number, which Emscripten's setjmp support reads as a longjmp.
   */
  irvFrame(pixels: number): void
  /**
   * Gets the address of `count` floats, the frame's sound as left and right pairs mixed at
   * `rate`. It returns before the game goes on, so a host copies what it keeps.
   */
  irvAudio(samples: number, count: number, rate: number): void
  print(line: string): void
  printErr(line: string): void
}

/**
 * Writes `stream` into the module's slot through the rule for a ROM (src/patch/slot.ts). The
 * module's slot has the layout of the ROM's, which `romSlot` (replay-slot.json) describes, so the
 * description is moved to the slot's own address. A `romSlot` that the slot's own header
 * contradicts comes from another build and is refused before anything is written, with the
 * build that makes both again.
 */
export function writeStream(
  game: GameModule,
  romSlot: SlotDescription,
  stream: Uint8Array,
  layout: SlotHeaderLayout,
): void {
  const at = game._IrvWasm_Slot()
  try {
    checkSlotHeader(game.HEAPU8.subarray(at), romSlot, layout)
  } catch (error) {
    if (!(error instanceof SlotMismatchError)) throw error
    throw new SlotMismatchError(`${error.message}. Run npm run wasm:build again.`)
  }
  const slot: SlotDescription = {
    ...romSlot,
    offset: 0,
    lengthOffset: romSlot.lengthOffset - romSlot.offset,
    streamOffset: romSlot.streamOffset - romSlot.offset,
    romSize: romSlot.size,
  }
  const written = writeReplaySlot(game.HEAPU8.subarray(at, at + slot.size), slot, stream)
  game.HEAPU8.set(written, at)
}

/**
 * The worker's irvFrame: the frame widened into the shared frame buffer, the frame count and the
 * progress into the control words, then the wait until the page allows the frame.
 */
export function frameHandler(
  game: () => GameModule,
  buffers: SharedBuffers,
  layout: ProgressLayout,
): (pixels: number) => void {
  const control = new Int32Array(buffers.control)
  const rgba = new Uint8Array(buffers.frame, 0, FRAME_BYTES)
  let frame = 0
  return (pixels) => {
    const module = game()
    frame++
    widenFrame(module.HEAPU16, pixels >> 1, rgba, 4)
    writeStatus(control, frame, readProgress(module.HEAPU8, module._IrvWasm_Progress(), layout))
    waitForTick(control, frame)
  }
}
