// One Gen 5 spike run (#72): serves the spike page, opens it in Playwright's headless Chromium,
// hands it the dump from GEN5_DUMP through the file input (nothing copies it), and logs the frame
// count per second, Chromium's memory and every request the page made. A request that leaves the
// machine, or one with a body, fails the run (scripts/gen5-requests.ts). Frames land in
// build/gen5/frames/ (gitignored, ADR 0002).
// Usage: GEN5_DUMP=<path> node scripts/gen5-shot.ts [--scene boot|speed|pacing|replay]
// [--seconds 90] [--start-at-frame <n>] [--threads] [--built] [--label s1] [--page-shot <name>]
// [--save <file>] [--replay <id>] [--against <marks file>] [--minutes 90].
// The scenes "speed" and "pacing" run scripts/gen5-speed.ts. The scene "replay" picks the test
// replay --replay <id> in the page, which plays it by itself, and compares its marks with the
// --against run's within --minutes (scripts/gen5-shot-replay.ts, #111). --built serves the built page
// (scripts/gen5-built.ts) instead of Vite's dev server, and a websocket or a Vite client request
// fails the run. --page-shot saves the page at a phone's 360 px width before the pick. --save
// <file> loads that save when the game starts (a save of the build machine, never served).
import { mkdirSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { parseArgs } from 'node:util'

import { chromium, type Page } from '@playwright/test'

import type { Gen5Global } from '../src/gen5/hook.ts'
import { paceBetween, paceLine, type PaceSample, paceWindows } from '../src/gen5/pace.ts'
import {
  framesOf,
  log,
  logSave,
  pressStart,
  sampleLine,
  saveFrame,
  waitForStart,
} from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { loadAverage, sampleMemory } from './gen5-proc.ts'
import { BUILT_PORT, buildGen5Page, startBuiltServer } from './gen5-built.ts'
import { logStorage, type RequestLog, watchRequests } from './gen5-requests.ts'
import {
  chooseReplay,
  pageQuery,
  type ReplayShot,
  replayScene,
  replayShotOf,
} from './gen5-shot-replay.ts'
import { pacingScene, speedScene } from './gen5-speed.ts'
import { startGen5Server } from './gen5-serve.ts'

/** A *.localhost name is a secure context and resolves to loopback, but it is not the name
 * "localhost" or "127.0.0.1", on which EmulatorJS asks its CDN for a newer version. */
export const PAGE_HOST = 'gen5.localhost'
const FRAME_EVERY_S = 15
/** The S2 scene presses Start here unless --start-at-frame says otherwise. */
const SPEED_START_FRAME = 1900

// Headless Chromium has no GPU; EmulatorJS draws with WebGL through SwiftShader.
// The page's host name maps to the server's loopback address only.
export const CHROMIUM_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  `--host-resolver-rules=MAP ${PAGE_HOST} 127.0.0.1`,
]

interface Sample extends PaceSample {
  pssMb: number
}

interface ShotOptions {
  scene: string
  seconds: number
  /** Press Start once the core passes this frame, to skip the opening to the title screen. */
  startAtFrame: number | undefined
  threads: boolean
  /** Serve the built page instead of Vite's dev server. */
  built: boolean
  /** The start of the boot scene's frame names. */
  label: string
  /** The name of a 360 px wide page screenshot before the pick, if any. */
  pageShot: string | undefined
  /** A save file of the build machine that the page loads when the game starts (#78). */
  save: string | undefined
  /** The test replay the page plays by itself in the scene "replay" (#111). */
  replay: ReplayShot | undefined
}

/** A phone's width in CSS pixels, for the page screenshot before the pick. */
export const PHONE_VIEWPORT = { width: 360, height: 800 }
export const RUN_VIEWPORT = { width: 640, height: 960 }

export interface Served {
  port: number
  close: () => Promise<void>
}

/** Frames per second over 10-second windows and over the whole run. */
function logPace(samples: readonly Sample[]): void {
  for (const pace of paceWindows(samples, 10_000)) {
    log(`fps from ${String(Math.round(pace.startMs / 1000))} s: ${pace.fps.toFixed(1)}`)
  }
  const first = samples[0]
  const last = samples.at(-1)
  if (first && last && last.ms > first.ms) log(`overall: ${paceLine(paceBetween(first, last))}`)
}

async function measure(page: Page, options: ShotOptions): Promise<Sample[]> {
  const { seconds, scene, startAtFrame } = options
  const samples: Sample[] = []
  const begin = Date.now()
  let pressed = startAtFrame === undefined
  for (let second = 0; second <= seconds; second += 1) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, begin + second * 1000 - Date.now())),
    )
    const frame = await framesOf(page)
    samples.push({ ms: Date.now() - begin, frame, pssMb: sampleMemory().pssMb })
    if (!pressed && frame >= (startAtFrame ?? 0)) {
      await pressStart(page, frame)
      pressed = true
    }
    if (second % FRAME_EVERY_S === 0) {
      log(`t ${String(second)}s frame ${String(frame)}; ${sampleLine()}`)
      await saveFrame(page, `${options.label}-${scene}-${String(second).padStart(3, '0')}`)
    }
  }
  return samples
}

async function logCalibration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as unknown as Gen5Global).gen5.calibration() !== undefined,
  )
  const figures = await page.evaluate(() =>
    (globalThis as unknown as Gen5Global).gen5.calibration(),
  )
  log(
    `calibration: hardwareConcurrency ${String(figures?.cores)}, ${String(figures?.loopTurns)} loop turns in ${String(figures?.loopMs)} ms; load ${loadAverage()}`,
  )
}

/** The scene's exit code: the replay scene's verdict, 0 for the others. */
async function playScene(page: Page, options: ShotOptions): Promise<0 | 1> {
  const core = await page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.core())
  log(`core build: ${core}`)
  if (options.replay !== undefined) return replayScene(page, options.replay, options.label)
  if (options.scene === 'speed') {
    await speedScene(page, core, options.startAtFrame ?? SPEED_START_FRAME)
    return 0
  }
  if (options.scene === 'pacing') {
    await pacingScene(page, core, options.startAtFrame ?? SPEED_START_FRAME)
    return 0
  }
  const samples = await measure(page, options)
  await saveFrame(page, `${options.label}-title`)
  logPace(samples)
  log(`peak PSS ${String(Math.max(...samples.map((s) => s.pssMb)))} MB`)
  return 0
}

export async function serve(built: boolean): Promise<Served> {
  if (built) {
    await buildGen5Page()
    const server = await startBuiltServer({ host: false, port: BUILT_PORT })
    log(`serving the built page on port ${String(BUILT_PORT)}`)
    const close = () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
        server.closeAllConnections()
      })
    return { port: (server.address() as AddressInfo).port, close }
  }
  const server = await startGen5Server()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('gen5-shot: the server has no port')
  return { port: address.port, close: () => server.close() }
}

/** The page at a phone's width before the pick, as the user sees it there. */
async function pageShot(page: Page, name: string): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT)
  const path = `${GEN5_PATHS.frames}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  log(`frame ${path} (page at ${String(PHONE_VIEWPORT.width)} px)`)
  await page.setViewportSize(RUN_VIEWPORT)
}

/** The page's clipboard, for code that runs in the page from outside (the scripts have no DOM). */
interface PageClipboard {
  navigator: { clipboard: { readText: () => Promise<string> } }
}

/** Presses "Copy figures" and logs the copied line, the page's copy of it and the button's word. */
async function copyFigures(page: Page): Promise<void> {
  await page.click('#copy')
  await page.locator('#copy', { hasNotText: /^Copy figures$/ }).waitFor()
  const copied = await page.evaluate(() =>
    (globalThis as unknown as PageClipboard).navigator.clipboard.readText(),
  )
  log(`copied figures: ${copied}`)
  log(`page figures: ${await page.locator('#figures').innerText()}`)
  log(`copy button: ${await page.locator('#copy').innerText()}`)
}

async function drive(page: Page, dump: string, options: ShotOptions): Promise<0 | 1> {
  await logCalibration(page)
  if (options.pageShot !== undefined) await pageShot(page, options.pageShot)
  if (options.replay !== undefined) await chooseReplay(page, options.replay.team.id, options.label)
  if (options.save !== undefined) {
    const base64 = readFileSync(options.save).toString('base64')
    await page.evaluate((bytes) => {
      ;(globalThis as unknown as Gen5Global).gen5.queueSave(bytes)
    }, base64)
    log(`queued a save of ${String(Buffer.from(base64, 'base64').length)} bytes`)
  }
  log(`before the dump; ${sampleLine()}`)
  await page.setInputFiles('#dump', dump)
  await waitForStart(page)
  await logSave(page, 'at the start')
  log(
    `core options: ${await page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.coreOptions())}`,
  )
  const scene = await playScene(page, options)
  await logSave(page, 'at the end')
  await copyFigures(page)
  log(
    `${sampleLine()}; status: ${await page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.status())}`,
  )
  return scene
}

async function run(dump: string, options: ShotOptions): Promise<number> {
  mkdirSync(GEN5_PATHS.frames, { recursive: true })
  const served = await serve(options.built)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  let requests: RequestLog | undefined
  let storageClean: boolean
  let scene: 0 | 1
  try {
    const context = await browser.newContext({
      viewport: RUN_VIEWPORT,
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page = await context.newPage()
    requests = watchRequests(page, origin, options.built)
    const query = pageQuery({ threads: options.threads, replay: options.replay !== undefined })
    await page.goto(`${origin}/${query}`)
    scene = await drive(page, dump, options)
    storageClean = await logStorage(page)
  } finally {
    await browser.close()
    await served.close()
    if (requests) log(requests.summary())
  }
  return requests.failed || !storageClean || scene !== 0 ? 1 : 0
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      scene: { type: 'string', default: 'boot' },
      seconds: { type: 'string', default: '90' },
      'start-at-frame': { type: 'string' },
      threads: { type: 'boolean', default: false },
      built: { type: 'boolean', default: false },
      label: { type: 'string', default: 's1' },
      'page-shot': { type: 'string' },
      save: { type: 'string' },
      replay: { type: 'string' },
      against: { type: 'string' },
      minutes: { type: 'string', default: '90' },
    },
  })
  const replay = replayShotOf(values, Date.now())
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  log(
    `gen5-shot: scene ${values.scene}, ${values.seconds} s, ${values.built ? 'built page' : 'dev server'}; ${sampleLine()}`,
  )
  const startAt = values['start-at-frame']
  process.exitCode = await run(dump, {
    scene: values.scene,
    seconds: Number(values.seconds),
    startAtFrame: startAt === undefined ? undefined : Number(startAt),
    threads: values.threads,
    built: values.built,
    label: values.label,
    pageShot: values['page-shot'],
    save: values.save,
    replay,
  })
}

if (import.meta.main) await main()
