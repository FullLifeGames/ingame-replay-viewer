# The Gen 5 page's licences and sources

The Gen 5 page runs Black 2 in EmulatorJS 4.2.3, its melonDS core and RetroArch (#79). All three are under the GNU General Public License, version 3 (GPL-3.0). This file records how we read that licence, where the parts that carry it live, and what a public page still needs. It is our reading, not legal advice.

## The reading

The viewer's code drives the emulator in the same browser tab. We treat the page and the emulator as one program, so the page as a whole goes to each visitor under GPL-3.0. That is reading (a) of #79, which the user chose on 24.11.2026.

The repository's own code stays under the MIT licence in `LICENSE`. GPL-3.0 lets MIT code join a GPL whole, the same reasoning ADR 0007 gives. A spec holds `LICENSE` as it is.

So the page owes each visitor:

- a notice before the file input that names GPL-3.0, says there is no warranty and links the licence (GPL-3.0, section 5(d));
- the GPL's full text and every copyright notice the parts ship (section 4);
- the build's date and commit, and what the build combined (section 5(a));
- the source of every file it sends, at the exact version sent, on the same host (section 6(d)).

## What the page shows

The notice stands in `src/web/gen5/index.html` as `#licence-notice`, above the file input. It links `licences.html`.

The licences page holds, in this order:

1. what the page runs and how it is licensed;
2. the build's date and commit, with a link to the repository at that commit, and a sentence when the build machine had changes the commit lacks;
3. a table of every file the page sends, with its component, version, licence and source;
4. one line per source archive: its commit, its size, the SHA-256 of its tar, a link to the archive and one to the upstream repository at that commit;
5. the copyright notices, each quoted whole from its file at the pin;
6. the licence texts: the GPL, the MIT texts and the licences of the parts the core compiles in.

## Where it lives

- `scripts/gen5-manifest.ts` lists every file the page serves from EmulatorJS's packages. Each file names its components; each component names its version, licence, source by commit and notice files. The servers answer no other file of the site.
- `scripts/gen5-notices.ts` names, for each component, the files at its pin that hold its notices and those of the parts its build compiles in. It quotes nothing. The list comes from the build files at the pins: RetroArch's `Makefile.emulatorjs` and `Makefile.common`, melonDS's `Makefile.common`.
- `scripts/gen5-sources.ts` fetches each source's commit into a bare repository under `.cache/gen5/sources/git/`. It keeps a ref under `refs/pins/` on that commit, writes the archive with `git archive` and checks the tar's SHA-256 against the pin before it places the file.
- `scripts/gen5-licences-read.ts` reads each notice and the GPL's text from the bare repositories with `git show <commit>:<path>`. `scripts/gen5-licences.ts` turns them into the page and escapes every string it got from a file.
- `scripts/gen5-built.ts` writes `licences.html` beside the built page. The dev server (`scripts/gen5-serve.ts`) makes it on each request. Both answer `/source/<archive>` for the manifest's archives alone.
- `scripts/gen5-licences-shot.ts` checks it all in a browser: the notice above the file input at 360 px, the licences page, and a `HEAD` to every source link.

Run `node scripts/gen5-sources.ts` once before you build. Without the archives the build stops and says so.

Nothing fetched is committed: not the archives, not the bare repositories, not the built page. The GPL's text comes from melonDS's `LICENSE` at its pin, the same text the core ships as `license.txt`.

## The commits behind the core

The core's package names no commit of melonDS or RetroArch. The core's own bytes do: its wasm holds melonDS's version string `0.9.3 18a057d` and RetroArch's git hash `6dd4353`. Both resolve in EmulatorJS's forks. The build scripts are EmulatorJS/build at the commit that was the head of its main branch on the build's date. The manifest records each commit and why.

## Parts with no notice in the pinned sources

Two parts the core holds carry no notice in any pinned source. The licences page names both and says so.

- Emscripten's runtime. EmulatorJS's build scripts install emsdk 3.1.74. No pinned tree holds Emscripten.
- zlib. RetroArch's web build links Emscripten's own zlib port. RetroArch's copy in `deps/libz` is not compiled in.

libretro-common's files each carry their own MIT notice. The page quotes one of them, from `archive_file.c`.

## What a public page still needs

The page now runs on the build machine alone. Before it goes public:

- The host serves an archive of our own repository at the build's commit beside the other archives. Today the page links the repository at that commit.
- The host keeps every archive for as long as it serves the build that needs it.
- The deploy copies exactly the manifest's files, the built page and the archives, and refuses a tree with local changes.
- A request log of the live page shows each archive answering 200.

The public Gen 5 page's own issue takes these, next to #62.

## Open: `extract7z.js`

EmulatorJS ships `data/compression/extract7z.js` with no licence. The file came from another website in 2021 and has not changed since. Nobody names its author or its source. The page needs it to unpack the core. Until the user rules on it (U1), the manifest marks its licence as unnamed, and its row on the licences page says so.
