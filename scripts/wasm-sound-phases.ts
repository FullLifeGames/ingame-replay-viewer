// The sound's counts per phase of a run on the viewer (#94, docs/sound-skip.md): it plays a stream
// in headless Chromium at each speed asked for, reads the page's test hook after every draw, and
// prints per phase (before the mark, the first seconds after it, the rest) the samples written,
// read, played and skipped, the overruns, the underruns and the ring's fill. The mark is END, or a
// speed switch at a frame (--switch); after the mark it may hold the page's main thread (--stall).
// It starts no server: it needs the viewer's production build (`npm run build`, then
// `npm run preview`) at --url. Only counts leave the page; the frames and the sound stay there.
import { readFileSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { parseArgs } from 'node:util'

import type { Page } from '@playwright/test'

import { runCliAsync } from './rom-cli.ts'

/** One reading of the hook after one draw of the page; counters are the ring's, in samples. */
export interface SoundSample {
  /** Milliseconds since the run started. */
  t: number
  frame: number
  ended: boolean
  speed: string
  written: number
  read: number
  skipped: number
  overruns: number
  underruns: number
  /** The audio context's clock in seconds, when the run has sound. */
  clock: number | undefined
}

export interface PhaseRow {
  phase: 'before' | 'at' | 'after'
  ms: number
  frames: number
  written: number
  read: number
  /** Read less skipped: what the worklet played. */
  played: number
  skipped: number
  overruns: number
  underruns: number
  fillMax: number
  fillEnd: number
  /** The most frames the game advanced between two draws, and the longest time between them. */
  stepMax: number
  gapMax: number
  /** Seconds of the audio clock per second of wall time. */
  clockRatio: number | undefined
}

const fill = (s: SoundSample) => s.written - s.read

function row(phase: PhaseRow['phase'], part: readonly SoundSample[]): PhaseRow {
  const a = part[0] as SoundSample
  const b = part[part.length - 1] as SoundSample
  let [stepMax, gapMax] = [0, 0]
  for (let i = 1; i < part.length; i++) {
    const [p, q] = [part[i - 1] as SoundSample, part[i] as SoundSample]
    stepMax = Math.max(stepMax, q.frame - p.frame)
    gapMax = Math.max(gapMax, q.t - p.t)
  }
  const ms = b.t - a.t
  const delta = (key: 'written' | 'read' | 'skipped' | 'overruns' | 'underruns') => b[key] - a[key]
  const clocked = a.clock !== undefined && b.clock !== undefined && ms > 0
  return {
    phase,
    ms,
    frames: b.frame - a.frame,
    written: delta('written'),
    read: delta('read'),
    played: delta('read') - delta('skipped'),
    skipped: delta('skipped'),
    overruns: delta('overruns'),
    underruns: delta('underruns'),
    fillMax: Math.max(...part.map(fill)),
    fillEnd: fill(b),
    stepMax,
    gapMax,
    clockRatio: clocked ? (((b.clock ?? 0) - (a.clock ?? 0)) * 1000) / ms : undefined,
  }
}

/**
 * Splits a run's readings at `mark`, the first reading at or after END or the switch: before it,
 * the `windowMs` after it, and the rest. Each phase runs from its first reading to its last, and
 * the next one starts on that last reading, so the counts add up to the run's.
 */
export function splitPhases(
  samples: readonly SoundSample[],
  mark: number,
  windowMs: number,
): PhaseRow[] {
  const at = samples[mark]
  if (at === undefined || mark === 0) {
    throw new Error(`the mark ${String(mark)} lies outside the ${String(samples.length)} readings`)
  }
  let end = mark
  while (end + 1 < samples.length && (samples[end + 1] as SoundSample).t <= at.t + windowMs) end++
  const rows = [row('before', samples.slice(0, mark + 1)), row('at', samples.slice(mark, end + 1))]
  if (end + 1 < samples.length) rows.push(row('after', samples.slice(end)))
  return rows
}

const COLUMNS: (keyof PhaseRow)[] = [
  'phase',
  'ms',
  'frames',
  'written',
  'read',
  'played',
  'skipped',
  'overruns',
  'underruns',
  'fillMax',
  'fillEnd',
  'stepMax',
  'gapMax',
  'clockRatio',
]

const cell = (value: PhaseRow[keyof PhaseRow]) =>
  typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : (value ?? '-')

/** The phases as a table: a header line, then one line per phase. */
export function phaseLines(rows: readonly PhaseRow[]): string[] {
  const lines: string[][] = [COLUMNS, ...rows.map((r) => COLUMNS.map((key) => cell(r[key])))]
  const widths = COLUMNS.map((_, i) => Math.max(...lines.map((line) => String(line[i]).length)))
  return lines.map((line) => line.map((v, i) => v.padStart(widths[i] ?? 0)).join(' '))
}

/** A case of the run: the speed at the start, and the switch that marks it, if any. */
interface Case {
  speed: string
  switchTo: string | undefined
  switchAt: number | undefined
  stallMs: number
  afterMs: number
}

interface Probed {
  samples: SoundSample[]
  mark: number
  error: string | undefined
}

// The page's side, as text, since the scripts' tsconfig knows no DOM. It keeps the audio contexts
// the page opens, and after each draw of a run newer than the one at its arming it reads the hook.
// At the switch's frame it clicks the speed's radio, as a visitor does. After the draw that marks
// the run (END or the switch) it holds the main thread for the stall, so the page's next draw
// comes that much later, as on a loaded machine.
const PROBE_SCRIPT = `(() => {
  const contexts = []
  const Base = globalThis.AudioContext
  if (Base !== undefined) {
    globalThis.AudioContext = class extends Base {
      constructor(...args) { super(...args); contexts.push(this) }
    }
  }
  const probe = { done: false }
  probe.arm = (one) => {
    const viewer = globalThis.irvWasmViewer
    const started = viewer.status()?.runs.started ?? 0
    const rows = []
    let mark = -1
    let error
    probe.done = false
    probe.result = () => ({ samples: rows, mark, error })
    const tick = () => {
      const s = viewer.status()
      if (s === undefined || s.runs.started <= started) return requestAnimationFrame(tick)
      const a = s.audio
      const context = contexts[contexts.length - 1]
      rows.push({ t: s.wallMs, frame: s.frame, ended: s.finishedMs !== undefined, speed: s.speed,
        written: a.written, read: a.read, skipped: a.skipped, overruns: a.overruns,
        underruns: a.underruns, clock: context === undefined ? undefined : context.currentTime })
      if (s.failure !== undefined) { error = s.failure; probe.done = true; return }
      const hold = () => {
        const until = performance.now() + one.stallMs
        while (performance.now() < until) {}
      }
      if (mark < 0 && one.switchTo === undefined && s.finishedMs !== undefined) {
        mark = rows.length - 1
        hold()
      }
      if (mark < 0 && one.switchTo !== undefined && s.frame >= one.switchAt) {
        mark = rows.length - 1
        document.querySelector('#speed input[value="' + one.switchTo + '"]').click()
        hold()
      }
      if (mark >= 0 && s.wallMs - rows[mark].t >= one.afterMs) { probe.done = true; return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  globalThis.irvSoundProbe = probe
})()`

const SPEED_INPUT = (speed: string) => `#speed input[value="${speed}"]`

async function startStream(page: Page, replay: string, handMade: number[] | undefined) {
  if (handMade !== undefined) {
    await page.evaluate(
      ([id, bytes]) =>
        (
          globalThis as unknown as { irvWasmViewer: { play(i: string, b: number[]): unknown } }
        ).irvWasmViewer.play(id, bytes),
      [replay, handMade] as const,
    )
    return
  }
  await page.selectOption('#test-replay', replay)
  await page.click('#start')
}

async function probeCase(page: Page, replay: string, one: Case, handMade?: number[]) {
  await page.check(SPEED_INPUT(one.speed))
  await page.evaluate(`globalThis.irvSoundProbe.arm(${JSON.stringify(one)})`)
  await startStream(page, replay, handMade)
  await page.waitForFunction('globalThis.irvSoundProbe.done', undefined, {
    polling: 1000,
    timeout: 3_600_000,
  })
  return page.evaluate<Probed>('globalThis.irvSoundProbe.result()')
}

const load = () =>
  `load ${loadavg()
    .map((v) => v.toFixed(2))
    .join(' ')}`

async function handMadeBytes(): Promise<number[]> {
  const { PROGRESS_HEADER_PATH, readProgressLayout } = await import('./rom-shot-run.ts')
  const { planStreams } = await import('./rom-shot.ts')
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const [plan] = await planStreams(['hand-made'], layout)
  if (plan?.stream === undefined) throw new Error('the shot tool plans no hand-made stream')
  return [...plan.stream]
}

async function dumpPath(): Promise<string> {
  const { loadBuildConfig } = await import('./rom-config.ts')
  const { readPreflightInput } = await import('./rom-preflight.ts')
  return readPreflightInput(process.env, loadBuildConfig().baseRom.sha1).baseRomPath
}

interface Options {
  url: string
  replay: string
  cases: Case[]
  windowMs: number
  samples: string | undefined
}

function report(one: Case, probed: Probed, windowMs: number): void {
  const out = (line: string) => process.stdout.write(`${line}\n`)
  const marked = one.switchTo === undefined ? 'END' : `${one.switchTo} at ${String(one.switchAt)}`
  out(`${one.speed}, mark ${marked}, stall ${String(one.stallMs)} ms, ${load()}`)
  if (probed.error !== undefined) out(`the game failed: ${probed.error}`)
  if (probed.mark < 1) {
    out(`no mark after ${String(probed.samples.length)} readings`)
    return
  }
  for (const line of phaseLines(splitPhases(probed.samples, probed.mark, windowMs))) out(line)
}

async function play(options: Options): Promise<void> {
  const { chromium } = await import('@playwright/test')
  const handMade = options.replay === 'hand-made' ? await handMadeBytes() : undefined
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  const kept: Record<string, Probed> = {}
  try {
    const page = await browser.newPage()
    await page.addInitScript(PROBE_SCRIPT)
    await page.goto(options.url)
    await page.setInputFiles('#dump', await dumpPath())
    for (const one of options.cases) {
      const probed = await probeCase(page, options.replay, one, handMade)
      report(one, probed, options.windowMs)
      kept[`${one.speed}-${String(one.switchTo)}`] = probed
    }
  } finally {
    await browser.close()
  }
  if (options.samples !== undefined) writeFileSync(options.samples, JSON.stringify(kept))
}

function parse(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string', default: 'http://localhost:4173/' },
      replay: { type: 'string', default: 'hand-made' },
      speeds: { type: 'string', default: '1x,2x,fast' },
      switch: { type: 'string' },
      stall: { type: 'string', default: '0' },
      after: { type: 'string', default: '10' },
      window: { type: 'string', default: '2' },
      samples: { type: 'string' },
    },
  })
  const [switchTo, switchAt] = values.switch?.split('@') ?? []
  const cases = values.speeds.split(',').map((speed) => ({
    speed,
    switchTo,
    switchAt: switchAt === undefined ? undefined : Number(switchAt),
    stallMs: Number(values.stall),
    afterMs: Number(values.after) * 1000,
  }))
  return {
    url: values.url,
    replay: values.replay,
    cases,
    windowMs: Number(values.window) * 1000,
    samples: values.samples,
  }
}

if (import.meta.main) {
  await runCliAsync('wasm:sound-phases', () => play(parse(process.argv.slice(2))))
}
