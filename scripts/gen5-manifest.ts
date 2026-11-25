// The manifest of the Gen 5 page's served files (#79): each EmulatorJS file the page may fetch
// from the site scripts/gen5-fetch.ts unpacks, with its components, and each component's version,
// licence and corresponding source. Both servers answer only the paths it lists as served
// (scripts/gen5-files.ts), and a run's request log fails on a path it does not list
// (scripts/gen5-requests.ts). The page's own files are described as rules in OWN_FILES.

/** A licence by its SPDX id as the component states it, or the reason nobody can name one. */
export type Licence = 'GPL-3.0' | 'MIT' | { unnamed: string }

/** A git repository at one full commit, pinned by the SHA-256 of the tar that `git archive`
 * writes of it (scripts/gen5-sources.ts; each read with --print under git 2.53.0, 25.11.2026,
 * and held on a fresh fetch). The name is the archive's and the bare repository's. */
export interface Source {
  name: string
  repository: string
  commit: string
  tar: string
}

export type ComponentId =
  'emulatorjs' | 'melonds' | 'retroarch' | 'build' | 'nipplejs' | 'socketio' | 'extract7z'

export interface Component {
  name: string
  version: string
  licence: Licence
  /** The pinned npm package (scripts/gen5-fetch.ts) that brings the component's files. */
  from: string
  source: Source
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
  files: string
  licence: Licence
  source: string
}

const EMULATORJS_PACKAGE = '@emulatorjs/emulatorjs@4.2.3'
const CORE_PACKAGE = '@emulatorjs/core-melonds@4.2.3'
const EMULATORJS_SOURCE: Source = {
  name: 'emulatorjs',
  repository: 'https://github.com/EmulatorJS/EmulatorJS',
  commit: 'e150dc0491ae747028919fb82d6598954976ede6',
  tar: '133ea8f066b966bf716d71954d66238d5cf30bf2a243285d804322f2936f9b37',
}

export const COMPONENTS: Readonly<Record<ComponentId, Component>> = {
  // The registry's gitHead of both packages at 4.2.3, the tag v4.2.3. The served files equal that
  // commit's tree by git blob hash.
  emulatorjs: {
    name: 'EmulatorJS',
    version: '4.2.3',
    licence: 'GPL-3.0',
    from: EMULATORJS_PACKAGE,
    source: EMULATORJS_SOURCE,
  },
  // The core's wasm holds the library version "0.9.3 18a057d": melonDS's libretro.cpp builds it
  // from MELONDS_VERSION and the git hash its Makefile reads. 18a057d resolves in this repository.
  melonds: {
    name: "EmulatorJS's melonDS",
    version: '0.9.3 (18a057d)',
    licence: 'GPL-3.0',
    from: CORE_PACKAGE,
    source: {
      name: 'melonds',
      repository: 'https://github.com/EmulatorJS/melonDS',
      commit: '18a057d372783b42d7e297b8731f3c3d673cdcab',
      tar: '4368395f6ce9ec1e199a5bdef4591a86b8cfe70f101bc9d0421a56ea15d3e928',
    },
  },
  // The wasm's data starts with "6dd4353", RetroArch's GIT_VERSION (version_git.c); it resolves in
  // this repository, on the branch next that EmulatorJS's build script clones.
  retroarch: {
    name: "EmulatorJS's RetroArch",
    version: '1.21.0 (6dd4353)',
    licence: 'GPL-3.0',
    from: CORE_PACKAGE,
    source: {
      name: 'retroarch',
      repository: 'https://github.com/EmulatorJS/RetroArch',
      commit: '6dd4353937ef48b6ec0bfbdbb15d1c5992d86927',
      tar: '05515361238893f7983dffb1be87881cb774868c9adf99169a17616ce74b13d7',
    },
  },
  // Each core archive's build.json names the build scripts' version 2.0.2; this commit was main's
  // head from 2025-06-02 to 2025-07-06, around the build of 2025-06-14 (an inference). build.sh
  // writes the report and packs core.json, license.txt and build.json into each core.
  build: {
    name: "EmulatorJS's build scripts",
    version: '2.0.2',
    licence: 'GPL-3.0',
    from: CORE_PACKAGE,
    source: {
      name: 'emulatorjs-build',
      repository: 'https://github.com/EmulatorJS/build',
      commit: 'b24e5b535034dc7c3428d76f236d4793881969b6',
      tar: '4010b0545376a6573facab7e10fddd1ec627f1e8091e042c1aaba673140c442f',
    },
  },
  // EmulatorJS's update.js copies node_modules/nipplejs/dist/nipplejs.js; the served file equals
  // nipplejs 0.10.2's plus one newline. LICENSE at the tag v0.10.2 is MIT.
  nipplejs: {
    name: 'nipplejs',
    version: '0.10.2',
    licence: 'MIT',
    from: EMULATORJS_PACKAGE,
    source: {
      name: 'nipplejs',
      repository: 'https://github.com/yoannmoinet/nipplejs',
      commit: '9fca6e72bb99318d69092075015140179f4e32bf',
      tar: '8b7b070943ed50c5dfaab5539e8789a46e78f41c27adbec361e01d08ef398d6f',
    },
  },
  // update.js copies socket.io/client-dist/socket.io.min.js; its header names MIT. The commit is
  // the tag socket.io@4.8.1 of the monorepo.
  socketio: {
    name: 'Socket.IO client',
    version: '4.8.1',
    licence: 'MIT',
    from: EMULATORJS_PACKAGE,
    source: {
      name: 'socket.io',
      repository: 'https://github.com/socketio/socket.io',
      commit: '91e1c8b3584054db6072046404a24e79a17c1367',
      tar: '81780e2ad998b36375cbe33f6420e700f0f830b9f921bf98b090648cf1f9a932',
    },
  },
  // An old Emscripten build of a small 7z unpacker, unchanged in EmulatorJS since 2021. Nobody
  // names its licence (U1, for the user); the source is the place EmulatorJS keeps it.
  extract7z: {
    name: "EmulatorJS's 7z unpacker",
    version: 'unversioned, unchanged since EmulatorJS 0.4.23',
    licence: { unnamed: 'no licence in the file, its folder or EmulatorJS since 2021' },
    from: EMULATORJS_PACKAGE,
    source: EMULATORJS_SOURCE,
  },
}

const CORE: readonly ComponentId[] = ['melonds', 'retroarch', 'build']

const served = (path: string, components: readonly ComponentId[], why: Why): SiteFile => ({
  path,
  components,
  presence: 'served',
  why,
})

/** The EmulatorJS files the runs of stage 2 (#78) asked for, the plain core among them. */
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
  served('data/compression/extract7z.js', ['extract7z'], 'logged'),
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

export const OWN_FILES: readonly OwnFiles[] = [
  {
    files: "the page's modules on the dev server, its build output on the built server",
    licence: 'MIT',
    source: 'this repository at the commit the page was built from',
  },
  {
    files: '/saves/<name>.sav, by a name src/gen5/save-file.ts allows',
    licence: 'MIT',
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
  ...new Map(Object.values(COMPONENTS).map((part) => [part.source.name, part.source])).values(),
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
