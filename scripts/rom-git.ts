// git for the ROM build, and the one rule for a child's environment that keeps git on its own repo.
import { spawnSync } from 'node:child_process'

// Git variables from a calling hook (GIT_DIR, GIT_INDEX_FILE) would point git, or a script that
// runs it such as upstream's check_history.sh, at another repository.
export function withoutGitVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')))
}

export function git(dir: string, args: string[]): string {
  const result = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: withoutGitVariables(process.env),
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} in ${dir} failed: ${result.stderr.trim()}`)
  }
  return result.stdout
}
