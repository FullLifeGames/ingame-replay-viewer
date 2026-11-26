// What scripts/gen5-route.ts does while and after the page plays a route (#72, #78): it follows
// the run's report, writes each mark's state and frame to build/gen5/states/ and
// build/gen5/frames/, logs the marks and the readings at the end, watches the game's save, and
// takes the save once it stands still into build/gen5/saves/. All of these folders are gitignored
// (ADR 0002); nothing of them is served or committed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { Page } from '@playwright/test'

import type { Gen5Global, MarkRecord, RunReport } from '../src/gen5/hook.ts'
import { maskedValue, type RamRef } from '../src/gen5/ram-check.ts'
import { type ChainEnd, chainStep } from '../src/gen5/ram-chain.ts'
import { framesOf, log, waitForFrame } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import type { RouteOptions } from './gen5-route-options.ts'

/** What a run writes beside a state: where in the route it was saved. */
export interface StateMeta {
  mark: string
  frame: number
  ramSha: string | undefined
}

const REPORT_EVERY_MS = 2000

/** Frames between the two readings of the save that must agree before it is taken. */
const TAKE_GAP_FRAMES = 120
const TAKE_TRIES = 10

const hex = (value: number) => `0x${value.toString(16).toUpperCase()}`

const hook = (page: Page) => ({
  report: () => page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.runReport()),
  take: (name: string) =>
    page.evaluate((mark) => (globalThis as unknown as Gen5Global).gen5.takeMark(mark), name),
  word: (address: number) =>
    page.evaluate((at) => (globalThis as unknown as Gen5Global).gen5.readWord(at), address),
  save: () => page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.takeSave()),
  /** The save's SHA-256 and size alone, read in the page. */
  saveSum: () =>
    page.evaluate(async () => {
      const file = (await (globalThis as unknown as Gen5Global).gen5.takeSave())?.file
      return file ? `${String(file.bytes)} bytes, SHA-256 ${file.sha256}` : 'no file'
    }),
})

function writeMeta(label: string, record: MarkRecord): void {
  const meta: StateMeta = { mark: record.name, frame: record.frame, ramSha: record.ramSha }
  writeFileSync(
    join(GEN5_PATHS.states, `${label}-${record.name}.json`),
    `${JSON.stringify(meta)}\n`,
  )
}

function markLine(record: MarkRecord): string {
  const wall = (record.wallMs / 1000).toFixed(1)
  return `mark ${record.name}: frame ${String(record.frame)} (page ${String(record.pageFrame)}), ${wall} s into the run, state ${String(record.stateBytes)} bytes, ${record.values}, main RAM sha256 ${record.ramSha ?? 'pending'}`
}

/** Writes each new mark's state and frame; returns how many marks are written now. */
async function saveMarks(page: Page, report: RunReport, written: number, label: string) {
  for (const record of report.marks.slice(written)) {
    const taken = await hook(page).take(record.name)
    const base = `${label}-${record.name}`
    const state = taken === undefined || taken.state === '' ? '' : `${base}.state and `
    if (taken) {
      if (state !== '')
        writeFileSync(join(GEN5_PATHS.states, `${base}.state`), Buffer.from(taken.state, 'base64'))
      writeFileSync(join(GEN5_PATHS.frames, `${base}.png`), Buffer.from(taken.shot, 'base64'))
      writeMeta(label, record)
    }
    log(`${markLine(record)}; ${taken ? `saved ${state}${base}.png` : 'NOT TAKEN'}`)
  }
  return report.marks.length
}

/** The run's report each REPORT_EVERY_MS until it ends or the deadline passes. With
 * `--take-save`, logs the save each time it changes, at the frame of the report before it. */
export async function follow(page: Page, options: RouteOptions): Promise<RunReport> {
  let written = 0
  let sum = options.takeSave === undefined ? undefined : await hook(page).saveSum()
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, REPORT_EVERY_MS))
    const report = await hook(page).report()
    written = await saveMarks(page, report, written, options.label)
    if (sum !== undefined) {
      const now = await hook(page).saveSum()
      if (now !== sum) log(`save changed by frame ${String(report.frame)}: ${now}`)
      sum = now
    }
    const ended = report.status === 'done' || report.status === 'failed'
    if (ended || Date.now() > options.deadlineMs) {
      if (!ended)
        log(`deadline: stopped at frame ${String(report.frame)}, step ${String(report.step)}`)
      return report
    }
  }
}

/** The address `ref` names, its pointers read through the page one word at a time by
 * ram-chain.ts's rule. */
async function refEnd(page: Page, ref: RamRef): Promise<ChainEnd> {
  const pointers: number[] = []
  for (;;) {
    const step = chainStep(ref.name, ref, ref.width, pointers)
    if (!('read' in step)) return step
    pointers.push(await hook(page).word(step.read))
  }
}

/** A watched value read once from outside, through aligned words, for the end's readings; the
 * chain and the mask follow ram-check.ts's rule. */
async function readRaw(page: Page, ref: RamRef): Promise<string> {
  const end = await refEnd(page, ref)
  if ('fault' in end) return 'none'
  const at = end.address
  const word = await hook(page).word(at - (at % 4))
  const shifted = Math.floor(word / 2 ** ((at % 4) * 8))
  const value = ref.width === 4 ? word : shifted % 2 ** (ref.width * 8)
  return hex(maskedValue(ref, value))
}

async function readOnce(page: Page, ref: RamRef): Promise<string> {
  try {
    return await readRaw(page, ref)
  } catch (error) {
    return `unread (${String(error).split('\n')[0] ?? ''})`
  }
}

export async function logEnd(page: Page, options: RouteOptions, watch: RamRef[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, REPORT_EVERY_MS))
  const report = await hook(page).report()
  log(
    `run ${report.status} at frame ${String(report.frame)}, step ${String(report.step)}; frames the hook did not see: ${String(report.jumps)}`,
  )
  if (report.failed !== undefined) log(`failed: ${report.failed}`)
  if (report.loadCheck !== undefined) log(`load check: ${report.loadCheck}`)
  for (const record of report.marks) log(markLine(record))
  for (const line of report.watch) log(`watch ${line}`)
  const readings = await Promise.all(
    watch.map(async (ref) => `${ref.name}=${await readOnce(page, ref)}`),
  )
  log(`readings at the end: ${readings.join(' ')}`)
  for (const record of report.marks) writeMeta(options.label, record)
}

/** Reads the game's save TAKE_GAP_FRAMES apart until two readings agree, then writes it to
 * build/gen5/saves/<name>.sav; false when it never stood still or the core wrote none. */
export async function takeStableSave(page: Page, name: string): Promise<boolean> {
  let before = (await hook(page).save())?.file?.sha256
  for (let i = 0; i < TAKE_TRIES; i += 1) {
    await waitForFrame(page, (await framesOf(page)) + TAKE_GAP_FRAMES)
    const save = await hook(page).save()
    const file = save?.file
    log(
      `take-save at page frame ${String(await framesOf(page))}: ${file ? file.sha256 : 'no file'}`,
    )
    if (save !== undefined && file !== undefined && file.sha256 === before) {
      mkdirSync(GEN5_PATHS.madeSaves, { recursive: true })
      const path = join(GEN5_PATHS.madeSaves, `${name}.sav`)
      writeFileSync(path, Buffer.from(file.base64, 'base64'))
      log(
        `took the save from ${save.path}: ${relative(GEN5_PATHS.repo, path)}, ${String(file.bytes)} bytes, SHA-256 ${file.sha256}`,
      )
      return true
    }
    before = file?.sha256
  }
  log(`take-save: the save did not stand still over ${String(TAKE_TRIES)} readings`)
  return false
}
