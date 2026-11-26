// npm run rom:check [-- <filter>] (#7): the expansion's own make check, with our tests from
// rom/gen3/test in the tree. The tree is prepared as for rom:build; make builds the TESTING objects
// in build/emerald-test of the tree and runs the test ELF in mgba-rom-test. A heavy check on
// the build machine: run it alone and in the background (AGENTS.md).
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { runCli } from './rom-cli.ts'
import { loadBuildConfig, ROM_DIR } from './rom-config.ts'
import { runMake } from './rom-make.ts'
import { buildPaths } from './rom-paths.ts'
import { hostProblems, readPreflightInput } from './rom-preflight.ts'
import { ensureCheckout, prepareTree } from './rom-upstream.ts'

export interface CheckArgs {
  tests: string
}

export interface TestSummary {
  lines: string[]
  total: number | undefined
}

// Our test names start with "Replay: " (rom/gen3/include/test/replay_test.h).
const DEFAULT_TESTS = 'Replay'

// The Makefile writes TESTS into a shell line (`patchelf ... "$(TESTS:%*=%)\0"`), so the filter
// keeps to characters no shell reads. A leading * asks the runner for an infix match.
const FILTER = /^\*?[\w./-]+$/

const LOG_NAME = 'check.log'

export function parseCheckArgs(argv: string[]): CheckArgs {
  const { positionals } = parseArgs({
    args: argv,
    options: {},
    strict: true,
    allowPositionals: true,
  })
  if (positionals.length > 1) throw new Error('rom:check takes one test filter')
  const tests = positionals[0] ?? DEFAULT_TESTS
  if (!FILTER.test(tests)) {
    throw new Error(
      `"${tests}" is no test filter: use letters, digits and _ . / - and one leading *`,
    )
  }
  return { tests }
}

export function checkMakeArgs(tests: string): string[] {
  return ['check', `TESTS=${tests}`]
}

const ANSI = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g')
const SUMMARY = /^(- [^:]+):\s+(\d+)/

// mgba-rom-test-hydra ends with lines such as "- Tests PASSED: 6" and "- Tests TOTAL: 8".
export function readTestSummary(log: string): TestSummary {
  const lines: string[] = []
  let total: number | undefined
  for (const line of log.replace(ANSI, '').split('\n')) {
    const match = SUMMARY.exec(line)
    if (match === null) continue
    const [, label, count] = match as unknown as [string, string, string]
    lines.push(`${label}: ${count}`)
    if (label.endsWith(' TOTAL')) total = Number(count)
  }
  return { lines, total }
}

const say = (line: string) => process.stdout.write(`rom:check: ${line}\n`)

function runCheck(args: CheckArgs): void {
  const config = loadBuildConfig()
  const problems = hostProblems(readPreflightInput(process.env, config.baseRom.sha1))
  if (problems.length > 0) throw new Error(problems.join('\n'))
  const paths = buildPaths()
  mkdirSync(paths.outDir, { recursive: true })
  ensureCheckout(paths.tree, config.upstream)
  const options = { tree: paths.tree, romDir: ROM_DIR, pin: config.upstream, roots: paths.roots }
  prepareTree({ ...options, stampPath: paths.stampPath })
  const logPath = join(paths.outDir, LOG_NAME)
  const start = performance.now()
  runMake({
    tree: paths.tree,
    jobs: config.make.jobs,
    logPath,
    env: process.env,
    args: checkMakeArgs(args.tests),
  })
  const summary = readTestSummary(readFileSync(logPath, 'utf8'))
  if (summary.total === undefined || summary.total === 0) {
    throw new Error(`no test matched "${args.tests}"; see ${logPath}`)
  }
  for (const line of summary.lines) say(line)
  say(`done in ${String(Math.round((performance.now() - start) / 1000))} s; log in ${logPath}`)
}

function main(): void {
  runCli('rom:check', () => {
    runCheck(parseCheckArgs(process.argv.slice(2)))
  })
}

if (import.meta.main) main()
