// The spike page's settings from its address (#72): which core build runs, and whether the main
// loop waits for the display. EmulatorJS 4.2.3 starts with vsync on: RetroArch's Emscripten main
// loop then runs one core frame per requestAnimationFrame (platform_emulatorjs.c, "set_vsync" and
// "platform_emscripten_set_main_loop_interval"). With vsync off it runs on setImmediate instead,
// and a core slower than the display no longer waits for the next one. `?vsync=1` brings the
// wait back; `?threads=1` starts the thread core.

export interface PageSettings {
  /** The thread build of the core, which needs SharedArrayBuffer. */
  threads: boolean
  /** Each core frame waits for the display's next frame. */
  vsync: boolean
}

export type PageSwitch = keyof PageSettings

const ON = '1'

export function pageSettings(query: string): PageSettings {
  const params = new URLSearchParams(query)
  return { threads: params.get('threads') === ON, vsync: params.get('vsync') === ON }
}

/** What the page puts in EJS_defaultOptions; EmulatorJS applies it once the game runs. */
export function emulatorOptions(settings: PageSettings): Record<string, string> {
  return settings.vsync ? {} : { vsync: 'disabled' }
}

/** The address query with one switch turned the other way, the rest kept. */
export function switchedQuery(query: string, name: PageSwitch): string {
  const params = new URLSearchParams(query)
  if (params.get(name) === ON) params.delete(name)
  else params.set(name, ON)
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}
