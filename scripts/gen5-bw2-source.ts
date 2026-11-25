// pokebw2 (https://github.com/fuddlesworth/pokebw2, GPL-3.0) at its pin, the one list of its files
// that our code reads, a reader that refuses every other file, and the checkout (#77). The checkout
// is partial and sparse: depth 1, no blob fetched before the checkout, and exactly the listed files
// in the tree. Nothing of pokebw2 is committed.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const POKEBW2 = {
  repository: 'https://github.com/fuddlesworth/pokebw2.git',
  commit: '345b790e6000869b481b79838bb5727309f832fb',
}

/** Every file of pokebw2 that the generator (gen5-bw2.ts) and the moment script read, and no
 * other; a spec holds it equal to their reads. */
export const POKEBW2_FILES: readonly string[] = [
  'config/b2_us/arm9/overlays/ov167/symbols.txt',
  'src/battle/btl_adapter.c',
  'src/battle/btl_server_cmd.c',
  'src/battle/btl_server.c',
  'src/battle/btl_main.c',
  'include/battle/btl_adapter.h',
  'include/battle/btl_server_cmd.h',
  'include/battle/btl_server.h',
  'include/battle/btl_main.h',
  'include/battle/btl_pokeparam.h',
  'res/field/events/aspertia_city.json',
  'res/field/scripts/aspertia_city.s',
  'res/field/events/route_20.json',
  'generated/trainers.txt',
  'src/field/script/trainer_script.c',
  'res/text/system/0016.txt',
  'res/text/system/0019.txt',
  // The direct entry's (#97): symbols, link files, the boot, the structs and the constants.
  'config/b2_us/arm9/symbols.txt',
  'config/b2_us/arm9/overlays/ov162/symbols.txt',
  'config/b2_us/arm9/overlays/ov167/delinks.txt',
  'config/b2_us/arm9/overlays/ov012/delinks.txt',
  'config/b2_us/arm9/overlays/ov027/delinks.txt',
  'src/system/main.c',
  'src/gfl/procsys.c',
  'include/gfl/heap.h',
  'include/gfl/overlay.h',
  'include/gfl/sound.h',
  'src/gfl/strbuf.c',
  'include/system/btl_setup.h',
  'include/system/regulation.h',
  'include/system/pms_data.h',
  'include/system/field_event.h',
  'lib/nitro/include/nitro/math.h',
  'include/pml/poke_party.h',
  'include/pml/mail.h',
  'include/save/player_info.h',
  'include/save/config.h',
  'include/battle/battle_proc.h',
  'generated/trainer_classes.txt',
  'src/system/printsys.c',
  'src/system/btl_setup.c',
]

/** Reads one file of pokebw2 by its path inside the checkout. */
export type Pokebw2Read = (path: string) => string

/** A reader of the checkout in `dir` that throws for a path outside `files` before it reads. */
export function listedReader(
  dir: string,
  files: readonly string[] = POKEBW2_FILES,
  readText: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): Pokebw2Read {
  const listed = new Set(files)
  return (path) => {
    if (!listed.has(path)) throw new Error(`${path} is not in POKEBW2_FILES`)
    return readText(join(dir, path))
  }
}

/** No checkout yet, one with a sparse tree, or one with the whole tree (the spike's). */
type CheckoutState = 'none' | 'sparse' | 'full'

/** The git argument lists that bring the checkout in `dir` from `state` to the pin's listed files.
 * A full checkout stays as it is. */
export function checkoutSteps(state: CheckoutState, dir: string): string[][] {
  const git = (...args: string[]) => ['-C', dir, ...args]
  const sparse = git('sparse-checkout', 'set', '--no-cone', ...POKEBW2_FILES.map((p) => `/${p}`))
  if (state === 'full') return []
  if (state === 'sparse') return [sparse]
  return [
    git('init', '-q'),
    git('remote', 'add', 'origin', POKEBW2.repository),
    sparse,
    git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', POKEBW2.commit),
    git('checkout', '-q', '--detach', 'FETCH_HEAD'),
  ]
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' })

function checkoutState(dir: string): CheckoutState {
  if (!existsSync(join(dir, '.git'))) return 'none'
  try {
    return git('-C', dir, 'config', '--get', 'core.sparseCheckout').trim() === 'true'
      ? 'sparse'
      : 'full'
  } catch {
    return 'full' // git config exits 1 when the key is unset
  }
}

/** Fetches the pin into `dir` on the first run and keeps a sparse tree to the list; throws when
 * the checkout stands at another commit. */
export function checkout(dir: string): string {
  const state = checkoutState(dir)
  if (state === 'none') mkdirSync(dir, { recursive: true })
  const started = performance.now()
  for (const step of checkoutSteps(state, dir)) git(...step)
  if (state === 'none') {
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    process.stdout.write(`gen5-bw2: fetched pokebw2 at ${POKEBW2.commit} in ${seconds} s\n`)
  }
  const head = git('-C', dir, 'rev-parse', 'HEAD').trim()
  if (head !== POKEBW2.commit) {
    throw new Error(`pokebw2 stands at ${head}, not the pinned ${POKEBW2.commit}`)
  }
  return dir
}
