import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { CompileCommand } from './wasm-compile.ts'
import { runCommands, splitTimeReport } from './wasm-census-run.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-census-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const shell = (script: string) => ['bash', '-c', script]
const fake = (source: string, compile: string[]): CompileCommand => ({
  source,
  object: join(scratch, 'obj', source.replace(/\.c$/, '.o')),
  preprocess: ['printf', 'int x;'],
  preproc: ['cat'],
  compile,
})

describe('the time report of /usr/bin/time', () => {
  it('splits the peak memory off the compiler output', () => {
    const stderr = [
      'src/x.c:1:1: error: boom',
      'Command exited with non-zero status 1',
      'IRV_MAX_RSS_KB=71560',
      '',
    ].join('\n')
    expect(splitTimeReport(stderr)).toEqual({ stderr: 'src/x.c:1:1: error: boom', rssKb: 71560 })
  })

  it('reports no memory when the line is missing', () => {
    expect(splitTimeReport('warning: x\n')).toEqual({ stderr: 'warning: x', rssKb: 0 })
  })
})

describe('the census runner', () => {
  const run = (commands: CompileCommand[], timeoutMs = 20_000) =>
    runCommands(commands, { cwd: scratch, jobs: 2, timeoutMs })

  it('passes a file whose three stages succeed and makes its object folder', async () => {
    const command = fake('src/deep/ok.c', shell('cat > /dev/null'))
    const [result] = await run([command])
    expect(result?.entry).toMatchObject({
      source: 'src/deep/ok.c',
      ok: true,
      firstError: undefined,
    })
    expect(existsSync(dirname(command.object))).toBe(true)
  })

  it('fails a file when a middle stage fails, with its first error line', async () => {
    const command = {
      ...fake('src/bad.c', ['cat']),
      preproc: shell('echo "src/bad.c:2:3: error: no" >&2; exit 1'),
    }
    const [result] = await run([command])
    expect(result?.entry).toMatchObject({ ok: false, firstError: 'src/bad.c:2:3: error: no' })
    expect(result?.stderr).toContain('error: no')
  })

  it('stops a file that runs past the timeout', async () => {
    const [result] = await run([fake('src/slow.c', shell('sleep 30'))], 300)
    expect(result?.entry).toMatchObject({ ok: false, firstError: 'timed out after 0.3 s' })
  })

  it('keeps the order of the commands with several jobs', async () => {
    const names = ['src/a.c', 'src/b.c', 'src/c.c']
    const results = await run(names.map((name) => fake(name, ['cat'])))
    expect(results.map((result) => result.entry.source)).toEqual(names)
  })
})
