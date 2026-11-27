// The Gen 5 spike page (#72): the visitor picks a Black 2 (USA) dump, the page checks its header
// and starts EmulatorJS's melonDS core on it from the fetched packages under /emulatorjs/. The dump
// stays in the browser as a Blob URL; EmulatorJS's databases are off, so it never lands in
// IndexedDB. The address picks the core build and vsync (src/gen5/pacing.ts); vsync is off unless
// it says `?vsync=1`. The game's clock is fixed and runs with the emulated frames, and a macro can
// play from boot or from a state (frame-hook.ts). EmulatorJS unpacks the core in the page's own
// worker, which window.EJS_paths names for its 7z unpacker (src/gen5/unpacker.ts, #79). With
// `?save=<name>` the page fetches that save from its own server and loads it before the game
// starts; the save folder lives in memory alone, never in IndexedDB (save-load.ts). `window.gen5`
// is the hook that the scripts read.
import { figuresLine } from '../../gen5/figures.ts'
import type { Calibration, Gen5Hook, SaveReport } from '../../gen5/hook.ts'
import type { MainRamFacts } from '../../gen5/main-ram.ts'
import { checkBlack2, HEADER_SIZE } from '../../gen5/nds-header.ts'
import { emulatorOptions, pageSettings } from '../../gen5/pacing.ts'
import { CONTENT_NAME, saveName, saveQueryProblem } from '../../gen5/save-file.ts'
import { emulatorPaths } from '../../gen5/unpacker.ts'
import { wireControls } from './controls.ts'
import { fromBase64, sha256, toBase64 } from './codec.ts'
import { fixClock, wrapRuntime } from './core-runtime.ts'
import { frameHook } from './frame-hook.ts'
import { ramHook, readFacts } from './ram-hook.ts'
import {
  fetchSave,
  lockSaveButtons,
  type SaveManager,
  takeSave,
  wrapGameManager,
} from './save-load.ts'
import { calibrate, calibrationLine, type Rates, watchSpeed } from './speed.ts'

const DATA_PATH = '/emulatorjs/data/'

interface GameManager extends SaveManager {
  getFrameNum(): number
  screenshot(): Promise<Uint8Array>
  getCoreOptions(): string
  simulateInput(player: number, button: number, value: number): void
  setFastForwardRatio(ratio: number): void
  toggleFastForward(active: number): void
  setVSync(enabled: number): void
  getState(): Uint8Array
  loadState(state: Uint8Array): void
  Module: { HEAPU8: Uint8Array }
}

interface Emulator {
  gameManager?: GameManager
  on(event: string, handler: () => void): void
}

declare global {
  interface Window {
    gen5: Gen5Hook
    EJS_emulator?: Emulator
    [name: `EJS_${string}`]: unknown
  }
}

const statusLine = document.querySelector<HTMLElement>('#status')
const input = document.querySelector<HTMLInputElement>('#dump')
const settings = pageSettings(location.search)
const pacing = { capped: true, vsync: settings.vsync }
let rates: Rates = { fps5: undefined, fps60: undefined }
let started = false
let calibration: Calibration | undefined
let facts: MainRamFacts | undefined
/** The save the game loads when it starts: queued by the hook, or fetched for the address. */
let save: Uint8Array | undefined

function say(text: string): void {
  if (statusLine) statusLine.textContent = text
}

function show(selector: string, text: string): void {
  const line = document.querySelector<HTMLElement>(selector)
  if (line) line.textContent = text
}

const manager = () => window.EJS_emulator?.gameManager

const ram = ramHook(
  () => manager()?.Module.HEAPU8,
  () => facts,
)
const frames = frameHook(manager, ram.ram)
wrapRuntime(frames.preMainLoop)
wrapGameManager(window, () => save)
fixClock(frames.frame)

async function saveReport(game: GameManager): Promise<SaveReport> {
  const { path, mount, bytes } = takeSave(game)
  if (bytes === undefined) return { path, mount }
  return {
    path,
    mount,
    file: { base64: toBase64(bytes), sha256: await sha256(bytes), bytes: bytes.length },
  }
}

window.gen5 = {
  status: () => statusLine?.textContent ?? '',
  started: () => started,
  frames: () => manager()?.getFrameNum() ?? 0,
  coreOptions: () => manager()?.getCoreOptions() ?? '',
  screenshot: async () => {
    const game = manager()
    return game ? toBase64(await game.screenshot()) : ''
  },
  press: (button, ms) => {
    manager()?.simulateInput(0, button, 1)
    setTimeout(() => manager()?.simulateInput(0, button, 0), ms)
  },
  core: () => (settings.threads ? 'thread' : 'plain'),
  calibration: () => calibration,
  uncapped: (on) => {
    manager()?.setFastForwardRatio(0)
    manager()?.toggleFastForward(on ? 1 : 0)
    pacing.capped = !on
    const box = document.querySelector<HTMLInputElement>('#uncapped')
    if (box) box.checked = on
  },
  fastForward: (ratio) => {
    if (ratio !== undefined) manager()?.setFastForwardRatio(ratio)
    manager()?.toggleFastForward(ratio === undefined ? 0 : 1)
  },
  vsync: (on) => {
    manager()?.setVSync(on ? 1 : 0)
    pacing.vsync = on
  },
  figures: () =>
    figuresLine({
      core: window.gen5.core(),
      ...pacing,
      calibration,
      ...rates,
      frames: window.gen5.frames(),
      userAgent: navigator.userAgent,
    }),
  queueSave: (base64) => {
    save = fromBase64(base64)
  },
  takeSave: async () => {
    const game = manager()
    return game ? saveReport(game) : undefined
  },
  replay: () => undefined,
  ...ram.hook,
  ...frames.calls,
}

function startEmulator(file: File): void {
  window.EJS_player = '#game'
  window.EJS_core = 'melonds'
  window.EJS_pathtodata = DATA_PATH
  window.EJS_paths = emulatorPaths()
  window.EJS_gameUrl = URL.createObjectURL(file)
  window.EJS_gameName = CONTENT_NAME
  window.EJS_startOnLoaded = true
  window.EJS_disableDatabases = true
  lockSaveButtons(window)
  window.EJS_threads = settings.threads
  window.EJS_defaultOptions = emulatorOptions(settings)
  window.EJS_onGameStart = () => {
    started = true
    say(`Black 2 is running on the ${window.gen5.core()} core.`)
    const box = document.querySelector<HTMLInputElement>('#uncapped')
    if (box) box.disabled = false
    watchSpeed(window.gen5.frames, (latest, line) => {
      rates = latest
      show('#speed', line)
    })
  }
  const loader = document.createElement('script')
  loader.src = `${DATA_PATH}loader.js`
  document.body.append(loader)
}

/** Fetches the save the address names, if any; false, with the sentence said, when there is none
 * to load, so the emulator does not start. */
async function fetchAddressSave(): Promise<boolean> {
  const bad = saveQueryProblem(location.search)
  if (bad !== undefined) {
    say(bad)
    return false
  }
  const name = saveName(location.search)
  if (name === undefined) return true
  const fetched = await fetchSave(name, (url) => fetch(url))
  if ('problem' in fetched) {
    say(fetched.problem)
    return false
  }
  save = fetched.bytes
  return true
}

async function onPick(picker: HTMLInputElement): Promise<void> {
  const file = picker.files?.[0]
  if (!file) return
  const headerBytes = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer())
  const check = checkBlack2(headerBytes)
  if (!check.ok) {
    say(check.reason)
    return
  }
  if (!(await fetchAddressSave())) return
  facts = await readFacts(file, check.header, headerBytes)
  picker.disabled = true
  say(`Found ${check.header.title} (${check.header.gameCode}). Starting the emulator.`)
  startEmulator(file)
}

input?.addEventListener('change', () => void onPick(input))
wireControls(settings, window.gen5)

// The loop holds the page's thread for two seconds, so it runs once, before a dump is picked.
setTimeout(() => {
  calibration = calibrate()
  show('#device', calibrationLine(calibration))
}, 0)
