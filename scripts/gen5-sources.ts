// The corresponding source of each component the Gen 5 page sends (#79, D4, D5). For each source
// the manifest names (scripts/gen5-manifest.ts), git fetches the pinned commit at depth 1 into a
// bare repository under .cache/gen5/sources/git/, checking every object against its name; the
// script checks that the fetch brought the pinned commit, streams `git archive`'s tar of it through
// a SHA-256 and gzip into a part file, and gives the part its archive name only when the tar's
// hash is the pin. --print prints each tar's hash and places nothing. Nothing here is committed.
// Usage: node scripts/gen5-sources.ts [--print]
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

import { archiveName, type Source, SOURCES } from './gen5-manifest.ts'
import { pinFaults } from './gen5-manifest-check.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** The git argument lists that fetch `source`'s commit alone into the bare repository `dir`;
 * `fresh` makes the repository first. */
export function fetchSteps(dir: string, source: Source, fresh: boolean): string[][] {
  const fetch = [
    '-C',
    dir,
    'fetch',
    '-q',
    '--depth',
    '1',
    `${source.repository}.git`,
    source.commit,
  ]
  return fresh ? [['init', '-q', '--bare', dir], fetch] : [fetch]
}

/** Throws, naming the source, unless the fetched commit `head` is the pinned one. */
export function verifyFetchHead(head: string, source: Source): void {
  if (head !== source.commit) {
    throw new Error(`${source.name}: fetched ${head}, not the pinned ${source.commit}`)
  }
}

/** Throws, naming the source, unless `digest` is the pinned SHA-256 of the tar. */
export function verifyTarHash(digest: string, source: Source): void {
  if (digest !== source.tar) {
    const pinned = source.tar
    throw new Error(`${source.name}: the tar's SHA-256 ${digest} differs from the pinned ${pinned}`)
  }
}

/** The settings that could change the tar's bytes, held fixed: no line ending conversion, no
 * attributes file of the machine's, git's default mode mask. */
const FIXED = [
  'core.autocrlf=false',
  'core.eol=lf',
  'core.attributesFile=/dev/null',
  'tar.umask=0002',
]

function archiveArgs(dir: string, source: Source): string[] {
  const prefix = `--prefix=${source.name}-${source.commit}/`
  const settings = FIXED.flatMap((setting) => ['-c', setting])
  return ['-C', dir, ...settings, 'archive', '--format=tar', prefix, source.commit]
}

interface Tar {
  digest: string
  bytes: number
}

/** Streams the tar of `source` from `dir` through its SHA-256 into `out`, gzipped, or nowhere. */
async function streamTar(dir: string, source: Source, out?: Writable): Promise<Tar> {
  const git = spawn('git', archiveArgs(dir, source), { stdio: ['ignore', 'pipe', 'inherit'] })
  const exited = new Promise<number | null>((resolve, reject) => {
    git.once('error', reject)
    git.once('close', resolve)
  })
  const hash = createHash('sha256')
  let bytes = 0
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk)
      bytes += chunk.length
      done(null, chunk)
    },
  })
  const nowhere = new Writable({
    write: (_chunk, _encoding, done) => {
      done()
    },
  })
  const piped =
    out === undefined
      ? pipeline(git.stdout, tap, nowhere)
      : pipeline(git.stdout, tap, createGzip({ level: 9 }), out)
  const [code] = await Promise.all([exited, piped])
  if (code !== 0) throw new Error(`${source.name}: git archive exited ${String(code)}`)
  return { digest: hash.digest('hex'), bytes }
}

/** Writes the gzipped tar of `source` from the bare repository `dir` into `folder` under its
 * archive name once the tar's hash is the pin, and removes the part file otherwise; resolves to
 * the archive's size. */
export async function placeArchive(dir: string, source: Source, folder: string): Promise<number> {
  const file = join(folder, archiveName(source))
  const part = `${file}.part`
  const out = createWriteStream(part)
  try {
    verifyTarHash((await streamTar(dir, source, out)).digest, source)
  } catch (error) {
    rmSync(part, { force: true })
    throw error
  }
  renameSync(part, file)
  return out.bytesWritten
}

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })

const seconds = (since: number) => ((performance.now() - since) / 1000).toFixed(1)

const say = (line: string) => process.stdout.write(`gen5-sources: ${line}\n`)

/** Fetches `source`'s commit into its bare repository and checks it; returns the repository. */
function fetchSource(source: Source): string {
  const dir = join(GEN5_PATHS.sources, 'git', `${source.name}.git`)
  const fresh = !existsSync(join(dir, 'HEAD'))
  const started = performance.now()
  for (const step of fetchSteps(dir, source, fresh)) git(...step)
  verifyFetchHead(git('-C', dir, 'rev-parse', 'FETCH_HEAD').trim(), source)
  const how = fresh ? 'into a new bare repository' : 'again'
  say(`${source.name} ${source.commit} fetched ${how} in ${seconds(started)} s`)
  return dir
}

async function main(print: boolean): Promise<void> {
  const faults = SOURCES.flatMap(pinFaults)
  if (faults.length > 0) throw new Error(`gen5-sources: ${faults.join('; ')}`)
  mkdirSync(join(GEN5_PATHS.sources, 'git'), { recursive: true })
  for (const source of SOURCES) {
    const dir = fetchSource(source)
    const started = performance.now()
    if (print) {
      const tar = await streamTar(dir, source)
      say(`${source.name} tar ${tar.digest} (${String(tar.bytes)} bytes) in ${seconds(started)} s`)
    } else {
      const size = await placeArchive(dir, source, GEN5_PATHS.sources)
      say(
        `${source.name} verified, ${archiveName(source)} ${String(size)} bytes in ${seconds(started)} s`,
      )
    }
  }
}

if (import.meta.main) await main(process.argv.includes('--print'))
