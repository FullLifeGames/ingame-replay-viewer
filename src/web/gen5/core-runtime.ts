// How the spike page hooks into the core (#72): Emscripten's main loop calls `Module.preMainLoop`
// before each iteration, and EmulatorJS builds the Module itself, so the page wraps the core's
// factory `EJS_Runtime` as the core's script defines it and adds the call (frame-hook.ts plays the
// frames). `Date.now` follows the emulated frame, so the core's real-time clock reads the page's
// fixed clock (src/gen5/clock.ts).
import { CLOCK_START, clockMs } from '../../gen5/clock.ts'

/** Wraps the core's factory as its script assigns it, so the Module gets `preMainLoop`. */
export function wrapRuntime(preMainLoop: () => boolean): void {
  type Factory = (options: Record<string, unknown>) => Promise<unknown>
  let wrapped: Factory | undefined
  Object.defineProperty(window, 'EJS_Runtime', {
    configurable: true,
    get: () => wrapped,
    set: (factory: Factory) => {
      wrapped = (options) => factory(Object.assign(options, { preMainLoop }))
    },
  })
}

/** `Date.now` from the emulated frame: the core's real-time clock reads it (src/gen5/clock.ts). */
export function fixClock(frame: () => number): void {
  const { year, monthIndex, day, hour } = CLOCK_START
  const startMs = new Date(year, monthIndex, day, hour).getTime()
  Date.now = () => clockMs(startMs, frame())
}
