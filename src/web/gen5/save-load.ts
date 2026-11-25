// The save loader of the Gen 5 page (#78). EmulatorJS 4.2.3 builds its GameManager, awaits its
// `mountFileSystems` and only then calls the core's main, which loads the game and reads its save.
// GameManager.js mounts the save folder on IndexedDB there and reads the origin's copy into the
// tab. The page wraps the class as GameManager.js assigns it, as frame-hook.ts wraps the core's
// factory, and mounts an in-memory folder instead: it writes the page's save there, if it has
// one, and never touches IndexedDB. EmulatorJS's own save buttons are hidden and do nothing.
import {
  CORE_SAVE_FOLDER,
  SAVE_FOLDER,
  SAVE_PATH,
  saveProblem,
  saveUnreachable,
  saveUrl,
} from '../../gen5/save-file.ts'

/** Emscripten's FS as far as the loader and the read-out use it. */
export interface SaveFs {
  filesystems: Record<string, unknown>
  analyzePath(path: string): { exists: boolean }
  mkdir(path: string): void
  mount(type: unknown, options: object, mountpoint: string): unknown
  writeFile(path: string, data: Uint8Array): void
  lookupPath(path: string): { node: { mount: { type: unknown } } }
}

/** The part of EmulatorJS's GameManager the read-out calls. */
export interface SaveManager {
  FS: SaveFs
  getSaveFile(): Uint8Array | null
  getSaveFilePath(): string
}

type ManagerClass = new (...args: never[]) => { FS: SaveFs; mountFileSystems(): Promise<void> }

/** Makes each folder on the way to `path` that is not there yet. */
function makeFolders(fs: SaveFs, path: string): void {
  let folder = ''
  for (const part of path.split('/').filter((name) => name !== '')) {
    folder += `/${part}`
    if (!fs.analyzePath(folder).exists) fs.mkdir(folder)
  }
}

/** The save folder in memory with the core's folder in it, and `save` at the core's save path
 * when there is one. */
function mountSaves(fs: SaveFs, save: Uint8Array | undefined): void {
  const memory = fs.filesystems.MEMFS
  if (memory === undefined) throw new Error('gen5: the core lists no MEMFS for the save folder')
  makeFolders(fs, SAVE_FOLDER)
  fs.mount(memory, {}, SAVE_FOLDER)
  makeFolders(fs, CORE_SAVE_FOLDER)
  if (save !== undefined) fs.writeFile(SAVE_PATH, save)
}

/** Wraps EmulatorJS's GameManager class as GameManager.js assigns it to `target`; `save` gives the
 * bytes to load, read when the manager mounts its folders. */
export function wrapGameManager(target: object, save: () => Uint8Array | undefined): void {
  let wrapped: ManagerClass | undefined
  Object.defineProperty(target, 'EJS_GameManager', {
    configurable: true,
    get: () => wrapped,
    set: (base: ManagerClass) => {
      wrapped = class extends base {
        override mountFileSystems(): Promise<void> {
          return new Promise((resolve) => {
            mountSaves(this.FS, save())
            resolve()
          })
        }
      }
    },
  })
}

const nothing = (): undefined => undefined

/** Hides EmulatorJS's import and export buttons for saves; a handler that does nothing makes each
 * return before its own code, should one show anyway. */
export function lockSaveButtons(target: object): void {
  Object.assign(target, {
    EJS_Buttons: { saveSavFiles: false, loadSavFiles: false },
    EJS_onLoadSave: nothing,
    EJS_onSaveSave: nothing,
  })
}

/** A save as the core holds it: its path, the file system its folder is mounted on, and the bytes
 * when the core wrote the file. */
export interface TakenSave {
  path: string
  mount: string
  bytes?: Uint8Array
}

/** The save after the core wrote save RAM to its file (getSaveFile asks it to first). */
export function takeSave(manager: SaveManager): TakenSave {
  const fs = manager.FS
  const type = fs.lookupPath(SAVE_FOLDER).node.mount.type
  const mount = Object.keys(fs.filesystems).find((name) => fs.filesystems[name] === type)
  const file = manager.getSaveFile()
  const taken = { path: manager.getSaveFilePath(), mount: mount ?? 'unknown' }
  return file === null ? taken : { ...taken, bytes: file }
}

type Fetcher = (url: string) => Promise<{ status: number; arrayBuffer(): Promise<ArrayBuffer> }>

/** The named save from the page's own server by a plain GET, or the sentence why there is none. */
export async function fetchSave(
  name: string,
  fetcher: Fetcher,
): Promise<{ bytes: Uint8Array } | { problem: string }> {
  let answer: Awaited<ReturnType<Fetcher>>
  try {
    answer = await fetcher(saveUrl(name))
  } catch {
    return { problem: saveUnreachable(name) }
  }
  const bytes = new Uint8Array(await answer.arrayBuffer())
  const problem = saveProblem(name, answer.status, bytes.length)
  return problem === undefined ? { bytes } : { problem }
}
