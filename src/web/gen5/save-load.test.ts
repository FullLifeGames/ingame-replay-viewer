import { describe, expect, it } from 'vitest'

import {
  fetchSave,
  lockSaveButtons,
  type SaveFs,
  type SaveManager,
  takeSave,
  wrapGameManager,
} from './save-load'

const MEMFS = { name: 'memfs' }
const IDBFS = { name: 'idbfs' }

/** Emscripten's FS as far as the loader touches it, logging every call. */
class FakeFs implements SaveFs {
  readonly log: string[] = []
  readonly filesystems: Record<string, unknown> = { MEMFS, IDBFS }
  readonly files = new Map<string, Uint8Array>()
  readonly folders = new Set<string>(['/'])
  private mounted: unknown

  analyzePath(path: string): { exists: boolean } {
    return { exists: this.folders.has(path) || this.files.has(path) }
  }
  mkdir(path: string): void {
    this.log.push(`mkdir ${path}`)
    this.folders.add(path)
  }
  mount(type: unknown, _options: object, mountpoint: string): void {
    const name = Object.keys(this.filesystems).find((key) => this.filesystems[key] === type)
    this.log.push(`mount ${String(name)} ${mountpoint}`)
    this.mounted = type
  }
  writeFile(path: string, data: Uint8Array): void {
    this.log.push(`writeFile ${path} ${String(data.length)} bytes`)
    this.files.set(path, data)
  }
  lookupPath(): { node: { mount: { type: unknown } } } {
    return { node: { mount: { type: this.mounted } } }
  }
  syncfs(): void {
    this.log.push('syncfs')
  }
}

/** EmulatorJS's GameManager as far as the start uses it: it mounts IndexedDB, as 4.2.3 does. */
class FakeManager {
  readonly FS: FakeFs
  constructor(module: { FS: FakeFs }) {
    this.FS = module.FS
  }
  mountFileSystems(): Promise<void> {
    this.FS.mount(this.FS.filesystems.IDBFS, { autoPersist: true }, '/data/saves')
    this.FS.syncfs()
    return Promise.resolve()
  }
}

type ManagerClass = new (module: { FS: FakeFs }) => FakeManager

/** EmulatorJS's start: assign the class, build the manager, await the mount, call main. */
async function start(save: Uint8Array | undefined): Promise<FakeFs> {
  const target: Record<string, unknown> = {}
  wrapGameManager(target, () => save)
  target.EJS_GameManager = FakeManager
  const Manager = target.EJS_GameManager as ManagerClass
  const fs = new FakeFs()
  await new Manager({ FS: fs }).mountFileSystems()
  fs.log.push('callMain')
  return fs
}

describe('wrapGameManager', () => {
  it('writes the save into an in-memory save folder before the core starts', async () => {
    const fs = await start(Uint8Array.of(1, 2, 3))
    expect(fs.log).toEqual([
      'mkdir /data',
      'mkdir /data/saves',
      'mount MEMFS /data/saves',
      'mkdir /data/saves/melonDS',
      'writeFile /data/saves/melonDS/black2.sav 3 bytes',
      'callMain',
    ])
    expect(fs.files.get('/data/saves/melonDS/black2.sav')).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('mounts the folder and writes nothing without a save', async () => {
    const fs = await start(undefined)
    expect(fs.log).toEqual([
      'mkdir /data',
      'mkdir /data/saves',
      'mount MEMFS /data/saves',
      'mkdir /data/saves/melonDS',
      'callMain',
    ])
  })

  it('makes only the folders that are missing', async () => {
    const target: Record<string, unknown> = {}
    wrapGameManager(target, () => undefined)
    target.EJS_GameManager = FakeManager
    const Manager = target.EJS_GameManager as ManagerClass
    const fs = new FakeFs()
    fs.folders.add('/data')
    await new Manager({ FS: fs }).mountFileSystems()
    expect(fs.log).toEqual([
      'mkdir /data/saves',
      'mount MEMFS /data/saves',
      'mkdir /data/saves/melonDS',
    ])
  })

  it('never mounts IndexedDB or syncs it', async () => {
    for (const save of [undefined, Uint8Array.of(7)]) {
      const fs = await start(save)
      expect(fs.log.join('\n')).not.toMatch(/IDBFS|syncfs/)
    }
  })

  it('refuses to start when the core lists no in-memory file system', async () => {
    const target: Record<string, unknown> = {}
    wrapGameManager(target, () => undefined)
    target.EJS_GameManager = FakeManager
    const Manager = target.EJS_GameManager as ManagerClass
    const fs = new FakeFs()
    delete fs.filesystems.MEMFS
    await expect(new Manager({ FS: fs }).mountFileSystems()).rejects.toThrow(/MEMFS/)
    expect(fs.log.join('\n')).not.toMatch(/IDBFS|syncfs/)
  })
})

describe('lockSaveButtons', () => {
  it('hides the import and export buttons and gives both a handler that does nothing', () => {
    const target: Record<string, unknown> = {}
    lockSaveButtons(target)
    expect(target.EJS_Buttons).toEqual({ saveSavFiles: false, loadSavFiles: false })
    expect(typeof target.EJS_onLoadSave).toBe('function')
    expect(typeof target.EJS_onSaveSave).toBe('function')
    expect((target.EJS_onLoadSave as () => unknown)()).toBeUndefined()
    expect((target.EJS_onSaveSave as () => unknown)()).toBeUndefined()
  })
})

function manager(file: Uint8Array | null): SaveManager & { fs: FakeFs } {
  const fs = new FakeFs()
  fs.mount(MEMFS, {}, '/data/saves')
  return {
    fs,
    FS: fs,
    getSaveFile: () => file,
    getSaveFilePath: () => '/data/saves/melonDS/black2.sav',
  }
}

describe('takeSave', () => {
  it('reads the file at the path the core reports, with the save folder mount', () => {
    expect(takeSave(manager(Uint8Array.of(4, 5)))).toEqual({
      path: '/data/saves/melonDS/black2.sav',
      mount: 'MEMFS',
      bytes: Uint8Array.of(4, 5),
    })
  })

  it('says when the core wrote no file', () => {
    expect(takeSave(manager(null))).toEqual({
      path: '/data/saves/melonDS/black2.sav',
      mount: 'MEMFS',
    })
  })

  it('names a mount it does not know', () => {
    const game = manager(null)
    game.fs.mount({ name: 'other' }, {}, '/data/saves')
    expect(takeSave(game).mount).toBe('unknown')
  })
})

/** A server that answers one status and body, logging what the page asked for. */
function server(status: number, body: Uint8Array) {
  const asked: unknown[][] = []
  const fetcher = (...args: unknown[]) => {
    asked.push(args)
    return Promise.resolve({ status, arrayBuffer: () => Promise.resolve(body.slice().buffer) })
  }
  return { asked, fetcher }
}

describe('fetchSave', () => {
  it('asks for the named save with a plain GET and takes its bytes', async () => {
    const { asked, fetcher } = server(200, Uint8Array.of(9, 8))
    expect(await fetchSave('route-20', fetcher)).toEqual({ bytes: Uint8Array.of(9, 8) })
    expect(asked).toEqual([['/saves/route-20.sav']])
  })

  it('says the save is missing on a 404', async () => {
    const { fetcher } = server(404, new Uint8Array(0))
    expect(await fetchSave('route-20', fetcher)).toEqual({
      problem:
        'The save file route-20.sav is missing on the server, so the page does not start the game.',
    })
  })

  it('says the save is empty on an empty answer', async () => {
    const { fetcher } = server(200, new Uint8Array(0))
    expect(await fetchSave('route-20', fetcher)).toEqual({
      problem:
        'The save file route-20.sav on the server is empty, so the page does not start the game.',
    })
  })

  it('says the server could not be reached when the fetch fails', async () => {
    const fetcher = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await fetchSave('town', fetcher)).toEqual({
      problem:
        'The page could not reach the server for the save file town.sav, so it does not start the game.',
    })
  })
})
