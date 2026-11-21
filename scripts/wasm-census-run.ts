// Runs the compile commands of the census a few at a time. Each file runs as one
// `bash -o pipefail -c` pipeline under /usr/bin/time, which reports the peak memory of its largest
// process, the number the Machine stop check reads (plan §4). A file past its timeout loses its
// whole process group, so no clang outlives it.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { firstError } from './wasm-census.ts'
import type { CensusEntry } from './wasm-census.ts'
import { pipelineScript } from './wasm-compile.ts'
import type { CompileCommand } from './wasm-compile.ts'

export interface RunOptions {
  cwd: string
  jobs: number
  timeoutMs: number
  onResult?: (result: CensusResult, done: number) => void
}

export interface CensusResult {
  entry: CensusEntry
  stderr: string
}

const TIME = '/usr/bin/time'
const RSS_LINE = /^IRV_MAX_RSS_KB=(\d+)$/
const TIME_STATUS = /^Command (?:exited with non-zero status|terminated by signal) /
// Enough for the first errors of any file; a file with thousands of warnings keeps its head.
const STDERR_CAP = 256 * 1024

export function splitTimeReport(stderr: string): { stderr: string; rssKb: number } {
  const lines = stderr.split('\n')
  const rss = lines.map((line) => RSS_LINE.exec(line)).find((match) => match !== null)
  const rest = lines.filter((line) => !RSS_LINE.test(line) && !TIME_STATUS.test(line))
  return { stderr: rest.join('\n').trim(), rssKb: rss ? Number(rss[1]) : 0 }
}

function argv(command: CompileCommand): string[] {
  const shell = ['bash', '-o', 'pipefail', '-c', pipelineScript(command)]
  return existsSync(TIME) ? [TIME, '-f', 'IRV_MAX_RSS_KB=%M', ...shell] : shell
}

function runOne(command: CompileCommand, options: RunOptions): Promise<CensusResult> {
  mkdirSync(dirname(command.object), { recursive: true })
  const [file, ...args] = argv(command) as [string, ...string[]]
  const start = performance.now()
  const child = spawn(file, args, {
    cwd: options.cwd,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let raw = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    if (raw.length < STDERR_CAP) raw += chunk
  })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
  }, options.timeoutMs)
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      const seconds = (performance.now() - start) / 1000
      const { stderr, rssKb } = splitTimeReport(raw)
      const ok = code === 0 && !timedOut
      const error = timedOut
        ? `timed out after ${String(options.timeoutMs / 1000)} s`
        : firstError(stderr, code)
      const entry = {
        source: command.source,
        ok,
        firstError: ok ? undefined : error,
        rssKb,
        seconds,
      }
      resolve({ entry, stderr })
    })
  })
}

export async function runCommands(
  commands: readonly CompileCommand[],
  options: RunOptions,
): Promise<CensusResult[]> {
  const results: CensusResult[] = new Array<CensusResult>(commands.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < commands.length) {
      const at = next++
      const result = await runOne(commands[at] as CompileCommand, options)
      results[at] = result
      done += 1
      options.onResult?.(result, done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.jobs, commands.length) }, worker))
  return results
}
