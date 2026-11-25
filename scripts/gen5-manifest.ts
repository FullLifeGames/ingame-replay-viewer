// The manifest of the Gen 5 page's served files (#79): each EmulatorJS file the page may fetch
// from the site scripts/gen5-fetch.ts unpacks, with its components, and each component's version,
// licence and corresponding source. Both servers answer only the paths it lists as served
// (scripts/gen5-files.ts), and a run's request log fails on a path it does not list
// (scripts/gen5-requests.ts). The page's own files are described as rules in OWN_FILES. Each
// component's notice files stand in scripts/gen5-notices.ts, its source's pin in
// scripts/gen5-pins.ts.
import { UNPACKER_PATH } from '../src/gen5/unpacker.ts'
import { type Notice, NOTICES } from './gen5-notices.ts'
import {
  BUILD_SOURCE,
  EMULATORJS_SOURCE,
  MELONDS_SOURCE,
  NIPPLEJS_SOURCE,
  RETROARCH_SOURCE,
  SOCKET_IO_SOURCE,
} from './gen5-pins.ts'

/** A licence by its SPDX id as the component's notice states it. */
export type Licence = 'GPL-3.0-or-later' | 'GPL-3.0-only' | 'MIT'

/** A licence stated in words, for a rule of the page's own files that no id fits. */
export interface LicenceInWords {
  words: string
}

/** A git repository at one full commit, pinned by the SHA-256 of the tar that `git archive`
 * writes of it (scripts/gen5-pins.ts). The name is the archive's and the bare repository's. */
export interface Source {
  name: string
  repository: string
  commit: string
  tar: string
  /** How we know the served files came from that commit, as the licences page prints it. */
  basis: string
}

export type ComponentId = 'emulatorjs' | 'melonds' | 'retroarch' | 'build' | 'nipplejs' | 'socketio'

export interface Component {
  name: string
  version: string
  licence: Licence
  /** The pinned npm package (scripts/gen5-fetch.ts) that brings the component's files. */
  from: string
  source: Source
  /** The files in `source` that hold its notices and those of the parts compiled into it. */
  notices: readonly Notice[]
}

/** `logged`: a run asked for it; `other core`: a core build for another browser; `locale`: the
 * strings for another browser language. */
export type Why = 'logged' | 'other core' | 'locale'

export interface SiteFile {
  /** The path inside the site, as the page asks for it under /emulatorjs/. */
  path: string
  components: readonly ComponentId[]
  /** `absent`: the page asks for it, the site lacks it, and the servers answer 404. */
  presence: 'served' | 'absent'
  why: Why
}

/** The page's own files, by rule: their licence is the repository's. */
export interface OwnFiles {
  /** The rule's name, which its row on the licences page carries. */
  id: 'page' | 'unpacker' | 'saves'
  files: string
  licence: Licence | LicenceInWords
  source: string
}

const EMULATORJS_PACKAGE = '@emulatorjs/emulatorjs@4.2.3'
const CORE_PACKAGE = '@emulatorjs/core-melonds@4.2.3'

/** Each GPL component's notice says "either version 3 of the License, or (at your option) any
 * later version" (scripts/gen5-notices.ts names the files). */
const GPL = 'GPL-3.0-or-later'

export const COMPONENTS: Readonly<Record<ComponentId, Component>> = {
  emulatorjs: {
    name: 'EmulatorJS',
    version: '4.2.3',
    licence: GPL,
    from: EMULATORJS_PACKAGE,
    source: EMULATORJS_SOURCE,
    notices: NOTICES.emulatorjs,
  },
  melonds: {
    name: "EmulatorJS's melonDS",
    version: '0.9.3 (18a057d)',
    licence: GPL,
    from: CORE_PACKAGE,
    source: MELONDS_SOURCE,
    notices: NOTICES.melonds,
  },
  retroarch: {
    name: "EmulatorJS's RetroArch",
    version: '1.21.0 (6dd4353)',
    licence: GPL,
    from: CORE_PACKAGE,
    source: RETROARCH_SOURCE,
    notices: NOTICES.retroarch,
  },
  // build.sh writes the report and packs core.json, license.txt and build.json into each core.
  build: {
    name: "EmulatorJS's build scripts",
    version: '2.0.2',
    licence: GPL,
    from: CORE_PACKAGE,
    source: BUILD_SOURCE,
    notices: NOTICES.build,
  },
  // EmulatorJS's update.js copies node_modules/nipplejs/dist/nipplejs.js. LICENSE at the tag
  // v0.10.2 is MIT.
  nipplejs: {
    name: 'nipplejs',
    version: '0.10.2',
    licence: 'MIT',
    from: EMULATORJS_PACKAGE,
    source: NIPPLEJS_SOURCE,
    notices: NOTICES.nipplejs,
  },
  // update.js copies socket.io/client-dist/socket.io.min.js; its header names MIT.
  socketio: {
    name: 'Socket.IO client',
    version: '4.8.1',
    licence: 'MIT',
    from: EMULATORJS_PACKAGE,
    source: SOCKET_IO_SOURCE,
    notices: NOTICES.socketio,
  },
}

const CORE: readonly ComponentId[] = ['melonds', 'retroarch', 'build']

const served = (path: string, components: readonly ComponentId[], why: Why): SiteFile => ({
  path,
  components,
  presence: 'served',
  why,
})

/** The EmulatorJS files the runs of stage 2 (#78) asked for, the plain core among them, but
 * its 7z unpacker, which the page replaces with its own worker (OWN_FILES). */
const LOGGED: readonly SiteFile[] = [
  ...[
    'data/loader.js',
    'data/emulator.css',
    'data/src/emulator.js',
    'data/src/GameManager.js',
    'data/src/compression.js',
    'data/src/gamepad.js',
    'data/src/shaders.js',
    'data/src/storage.js',
    'data/localization/en-US.json',
  ].map((path) => served(path, ['emulatorjs'], 'logged')),
  served('data/src/nipplejs.js', ['nipplejs'], 'logged'),
  served('data/src/socket.io.min.js', ['socketio'], 'logged'),
  served('data/cores/reports/melonds.json', ['build'], 'logged'),
  served('data/cores/melonds-wasm.data', CORE, 'logged'),
  // loader.js asks for the minified files first and falls back to the plain ones on a 404.
  ...['data/emulator.min.css', 'data/emulator.min.js'].map((path): SiteFile => ({
    path,
    components: ['emulatorjs'],
    presence: 'absent',
    why: 'logged',
  })),
]

/** The thread core (?threads=1) and the two builds for a browser without WebGL2: a refused core
 * would send the browser to EmulatorJS's CDN. */
const OTHER_CORES = ['thread-wasm', 'legacy-wasm', 'thread-legacy-wasm'].map((build) =>
  served(`data/cores/melonds-${build}.data`, CORE, 'other core'),
)

/** The strings for the browser's language; English comes with LOGGED. */
const LOCALES = ['af-FR', 'ar-AR', 'ben-BEN', 'de-GER', 'el-GR', 'es-ES', 'fa-AF', 'hi-HI']
  .concat([
    'it-IT',
    'ja-JA',
    'jv-JV',
    'ko-KO',
    'pt-BR',
    'ro-RO',
    'ru-RU',
    'tr-TR',
    'vi-VN',
    'zh-CN',
  ])
  .map((code) => served(`data/localization/${code}.json`, ['emulatorjs'], 'locale'))

export const SITE_FILES: readonly SiteFile[] = [...LOGGED, ...OTHER_CORES, ...LOCALES]

/** The viewer's repository: the page's own source, under the MIT licence of its LICENSE. */
export const VIEWER_REPOSITORY = 'https://github.com/FullLifeGames/ingame-replay-viewer'

export const OWN_FILES: readonly OwnFiles[] = [
  {
    id: 'page',
    files: "the page's modules on the dev server, its build output on the built server",
    licence: 'MIT',
    source: 'this repository at the commit the page was built from',
  },
  // EmulatorJS's compression.js asks for data/compression/extract7z.js, whose licence nobody names
  // (U1); the page's window.EJS_paths sends it to this worker instead (src/gen5/unpacker.ts).
  {
    id: 'unpacker',
    files: `${UNPACKER_PATH}, the viewer's worker that unpacks the emulator's core in place of EmulatorJS's data/compression/extract7z.js`,
    licence: 'MIT',
    source: 'this repository: src/web/gen5/extract7z.ts and the 7z decoder in src/gen5/',
  },
  {
    id: 'saves',
    files: '/saves/<name>.sav, by a name src/gen5/save-file.ts allows',
    licence: {
      words:
        "The game wrote this save during our play from New Game on the build machine, as docs/gen5-save.md records. We offer it under the repository's MIT licence as far as it is ours.",
    },
    source: 'this repository; docs/gen5-save.md records each save',
  },
]

const SERVED = new Set(
  SITE_FILES.filter((file) => file.presence === 'served').map((file) => file.path),
)
const LISTED = new Set(SITE_FILES.map((file) => file.path))

/** True when the servers answer `path` (inside the site, normalized) from the fetched site. */
export function isServedSitePath(path: string): boolean {
  return SERVED.has(path)
}

/** True when the manifest lists `path` (inside the site), served or absent. */
export function isListed(path: string): boolean {
  return LISTED.has(path)
}

/** Each component's source once, by its name, in the order of COMPONENTS: what
 * scripts/gen5-sources.ts fetches and /source/ serves. */
export const SOURCES: readonly Source[] = [
  ...new Map(Object.values(COMPONENTS).map(({ source }) => [source.name, source])).values(),
]

/** The file name of `source`'s archive under /source/: its name and commit, a gzipped tar. */
export function archiveName(source: Source): string {
  return `${source.name}-${source.commit}.tar.gz`
}

const ARCHIVES = new Set(SOURCES.map(archiveName))

/** True when `name` is the archive of one of SOURCES. */
export function isSourceArchive(name: string): boolean {
  return ARCHIVES.has(name)
}
