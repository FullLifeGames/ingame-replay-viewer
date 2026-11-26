// The notices of the Gen 5 page's components (#79, D6, D7, D16): for each component of
// scripts/gen5-manifest.ts, the files in its source at the pinned commit that hold its copyright
// notices and licence texts, and those of the parts its build compiles in (RetroArch's
// Makefile.emulatorjs and Makefile.common, melonDS's Makefile.common, at the pins). Emscripten's
// parts follow Makefile.emulatorjs's link: its JS runtime, musl, libc++, libc++abi, compiler-rt
// and dlmalloc (no flag picks another allocator), and zlib through its port. Nothing here
// quotes a notice: scripts/gen5-licences-read.ts reads each one from the pinned commit, and the
// licences page shows it whole. The GPL's text comes from melonDS's LICENSE, never from the tree.
import type { ComponentId } from './gen5-manifest.ts'

export interface Notice {
  /** What the text covers: the component itself or a part compiled into it. */
  part: string
  /** The file in the component's source at its pinned commit. */
  path: string
  /** The first and last line of the notice, when it heads a longer file; else the whole file. */
  lines?: readonly [number, number]
  /** `notice`: a copyright notice; `licence`: a licence text the part ships. */
  kind: 'notice' | 'licence'
}

/** A folder whose files each state their own notice: the reader takes the opening comment of
 * every file under `folder` with one of `extensions` at the component's pin and groups the files
 * by its text (scripts/gen5-notice-groups.ts). The folder may hold more than the build compiles. */
export interface NoticeTree {
  component: ComponentId
  part: string
  folder: string
  extensions: readonly string[]
}

/** A part compiled in whose notice no pinned source holds, with what the files say of it. */
export interface Unfound {
  component: ComponentId
  part: string
  says: string
}

const notice = (part: string, path: string, lines?: readonly [number, number]): Notice =>
  lines === undefined ? { part, path, kind: 'notice' } : { part, path, lines, kind: 'notice' }

const licence = (part: string, path: string): Notice => ({ part, path, kind: 'licence' })

/** EmulatorJS's LICENSE (and its build scripts') ends with its filled-in notice. */
const GPL_APPENDIX = (part: string): Notice[] => [
  notice(part, 'LICENSE', [634, 648]),
  notice(part, 'LICENSE', [655, 658]),
]

const SOCKET_IO_PACKAGES = [
  'socket.io-client',
  'engine.io-client',
  'engine.io-parser',
  'socket.io-parser',
  'socket.io-component-emitter',
]

export const NOTICES: Readonly<Record<ComponentId, readonly Notice[]>> = {
  emulatorjs: GPL_APPENDIX('EmulatorJS'),
  melonds: [
    notice('melonDS', 'src/NDS.cpp', [1, 18]),
    notice('xxHash', 'src/xxhash/xxhash.c', [1, 33]),
    notice('SHA-1 in C', 'src/sha1/sha1.c', [6, 8]),
    notice('FreeBIOS', 'src/FreeBIOS.h', [1, 25]),
    licence('tiny-AES-c', 'src/tiny-AES-c/unlicense.txt'),
    licence('FatFs', 'src/fatfs/LICENSE.txt'),
    licence('Teakra', 'src/teakra/LICENSE'),
  ],
  retroarch: [
    notice('RetroArch', 'retroarch.c', [1, 18]),
    notice('LZMA SDK', 'deps/7zip/7z.h', [1, 2]),
    notice('stb_truetype', 'deps/stb/stb_truetype.h', [1, 3]),
    notice('stb_truetype', 'deps/stb/stb_truetype.h', [84, 88]),
    notice('stb_rect_pack', 'deps/stb/stb_rect_pack.h', [1, 3]),
    notice('yxml', 'deps/yxml/yxml.c', [3, 23]),
    licence('ibxm', 'deps/ibxm/licence.txt'),
  ],
  build: GPL_APPENDIX("EmulatorJS's build scripts"),
  emscripten: [
    licence('Emscripten', 'LICENSE'),
    licence('musl', 'system/lib/libc/musl/COPYRIGHT'),
    licence('libc++', 'system/lib/libcxx/LICENSE.TXT'),
    licence('libc++abi', 'system/lib/libcxxabi/LICENSE.TXT'),
    licence('compiler-rt', 'system/lib/compiler-rt/LICENSE.TXT'),
    notice('dlmalloc', 'system/lib/dlmalloc.c', [52, 55]),
  ],
  // zlib.h states the version's year; zlib's LICENSE at the tag still says 1995-2022.
  zlib: [notice('zlib', 'zlib.h', [1, 23])],
  nipplejs: [licence('nipplejs', 'LICENSE')],
  socketio: SOCKET_IO_PACKAGES.map((name) => licence(name, `packages/${name}/LICENSE`)),
}

/** libretro-common's files each carry a notice of their own; RetroArch compiles many of them. */
export const NOTICE_TREES: readonly NoticeTree[] = [
  {
    component: 'retroarch',
    part: 'libretro-common',
    folder: 'libretro-common/',
    extensions: ['.c', '.h'],
  },
]

/** The GPL's full text: melonDS's LICENSE at its pin, the text the core's license.txt holds. */
export const GPL_TEXT = { component: 'melonds', path: 'LICENSE' } as const

/** Parts the core holds whose notice none of the pinned sources carries. Empty since 79-5, when
 * Emscripten and zlib became components with sources of their own; a pin bump may fill it. */
export const UNFOUND: readonly Unfound[] = []
