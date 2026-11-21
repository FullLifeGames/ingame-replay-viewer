import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { git, withoutGitVariables } from './rom-git.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-git-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('the environment of a child', () => {
  it('drops every GIT_ variable and keeps the rest', () => {
    const env = { GIT_DIR: '/elsewhere/.git', GIT_INDEX_FILE: 'i', PATH: '/bin', HOME: '/h' }
    expect(withoutGitVariables(env)).toEqual({ PATH: '/bin', HOME: '/h' })
    expect(env.GIT_DIR).toBe('/elsewhere/.git')
  })
})

describe('git', () => {
  const saved = process.env.GIT_DIR
  afterEach(() => {
    if (saved === undefined) delete process.env.GIT_DIR
    else process.env.GIT_DIR = saved
  })

  it('works on the folder it is given even when a hook set GIT_DIR', () => {
    process.env.GIT_DIR = join(scratch, 'nowhere', '.git')
    git(scratch, ['init', '-q'])
    expect(git(scratch, ['rev-parse', '--show-toplevel']).trim()).toMatch(/irv-git-/)
  })

  it('names the command and the folder when git fails', () => {
    expect(() => git(scratch, ['no-such-command'])).toThrow(/git no-such-command in .*irv-git-/)
  })
})
