import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  makeEnvironment,
  packageVersions,
  readRomUsage,
  runMake,
  toolVersions,
} from './rom-make.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-make-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function fakeTools(name: string, tools: Record<string, string>): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(scratch, `${name}-`))
  for (const [tool, body] of Object.entries(tools)) {
    writeFileSync(join(dir, tool), `#!/bin/sh\n${body}\n`)
    chmodSync(join(dir, tool), 0o755)
  }
  return { PATH: `${dir}:/usr/bin:/bin` }
}

describe('the make environment', () => {
  const env = makeEnvironment({
    PATH: '/usr/bin',
    HOME: '/home/x',
    DEVKITARM: '/opt/devkitpro/devkitARM',
    MAKEFLAGS: '-j12',
    MFLAGS: '-j12',
    MAKELEVEL: '1',
    GITHUB_REPOSITORY_OWNER: 'rh-hideout',
    GIT_DIR: '/elsewhere/.git',
    LC_ALL: 'de_DE.UTF-8',
    TZ: 'Europe/Berlin',
  })

  it('pins locale, time zone and the Python hash seed', () => {
    expect(env).toMatchObject({ LC_ALL: 'C', TZ: 'UTC', PYTHONHASHSEED: '0' })
  })

  it('keeps PATH and HOME', () => {
    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/home/x' })
  })

  it('drops the variables that change what make builds', () => {
    const dropped = ['DEVKITARM', 'MAKEFLAGS', 'MFLAGS', 'MAKELEVEL', 'GITHUB_REPOSITORY_OWNER']
    for (const name of [...dropped, 'GIT_DIR']) expect(env).not.toHaveProperty(name)
  })
})

describe('running make', () => {
  const tree = mkdtempSync(join(scratch, 'tree-'))

  it('runs make in the tree with the job cap and synced output, logged to a file', () => {
    const env = fakeTools('ok', { make: 'echo "args $*"; echo "pwd $(pwd)"; echo "tz $TZ" >&2' })
    const log = join(scratch, 'ok.log')
    runMake({ tree, jobs: 3, logPath: log, env })
    expect(readFileSync(log, 'utf8').split('\n')).toEqual(
      expect.arrayContaining(['args -j3 -O', `pwd ${tree}`, 'tz UTC']),
    )
  })

  it('names the status and the log and quotes its last lines when make fails', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `echo line${String(index)}`)
    const env = fakeTools('fail', { make: `${lines.join('\n')}\nexit 2` })
    const log = join(scratch, 'fail.log')
    const run = () => {
      runMake({ tree, jobs: 1, logPath: log, env })
    }
    expect(run).toThrow(`make failed with status 2; see ${log}`)
    expect(run).toThrow(/line29$/)
    expect(run).not.toThrow(/line9\n/)
  })
})

describe('the ROM usage line', () => {
  it('reads the ROM line of --print-memory-usage', () => {
    const log = [
      'Memory region         Used Size  Region Size  %age Used',
      '           EWRAM:      255 KB       256 KB     99.61%',
      '             ROM:    26123456 B        32 MB     77.85%',
      '           IWRAM:       31 KB        32 KB     96.88%',
    ].join('\n')
    expect(readRomUsage(log)).toBe('ROM: 26123456 B of 32 MB, 77.85%')
  })

  it('is undefined when the log has no such line', () => {
    expect(readRomUsage('make: Nothing to be done\n')).toBeUndefined()
  })
})

describe('the toolchain record', () => {
  it('keeps the first line of each tool version', () => {
    const env = fakeTools('versions', {
      'arm-none-eabi-gcc': 'echo "arm-none-eabi-gcc (15:14.2.rel1-1) 14.2.1"; echo Copyright',
      make: 'echo "GNU Make 4.4.1"',
    })
    expect(toolVersions(['arm-none-eabi-gcc', 'make', 'no-such-tool'], env)).toEqual({
      'arm-none-eabi-gcc': 'arm-none-eabi-gcc (15:14.2.rel1-1) 14.2.1',
      make: 'GNU Make 4.4.1',
      'no-such-tool': 'missing',
    })
  })

  it('records the dpkg version of each package', () => {
    const env = fakeTools('dpkg', {
      'dpkg-query': 'case "$3" in pkgconf) echo "1.8.1-4";; *) exit 1;; esac',
    })
    expect(packageVersions(['pkgconf', 'gone'], env)).toEqual({
      pkgconf: '1.8.1-4',
      gone: 'not installed',
    })
  })
})
