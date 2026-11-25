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

The licence ids follow the notices at the pins. Every GPL notice there, in melonDS, RetroArch, EmulatorJS and its build scripts, says "either version 3 of the License, or (at your option) any later version", so the manifest names each `GPL-3.0-or-later`. The page as a whole goes out under version 3.

The save the page serves is not code. The game wrote its bytes during our play from New Game on the build machine (`docs/gen5-save.md`), and the page offers it under the repository's MIT licence as far as it is ours.

## What the page shows

The notice stands in `src/web/gen5/index.html` as `#licence-notice`, above the file input. It links `licences.html`.

The licences page holds, in this order:

1. what the page runs and how it is licensed, and that the viewer unpacks the core with its own code;
2. the build's date and commit, with a link to the repository at that commit, and a sentence when the build machine had changes the commit lacks;
3. a table of every file the page sends, with its component, version, licence and source, and the viewer's own files by rule: the page, its unpacker of the core and the saves;
4. one line per source archive: its commit and how we know that commit, its size, the SHA-256 of its tar, a link to the archive and one to the upstream repository at that commit;
5. the copyright notices, each quoted whole from its file at the pin;
6. the licence texts: the GPL, the MIT texts and the licences of the parts the core compiles in.

## Where it lives

- `scripts/gen5-manifest.ts` lists every file the page serves from EmulatorJS's packages. Each file names its components; each component names its version, licence, source by commit and notice files. The servers answer no other file of the site.
- `scripts/gen5-notices.ts` names, for each component, the files at its pin that hold its notices and those of the parts its build compiles in, and the folders whose files each carry their own notice. It quotes nothing. The list comes from the build files at the pins: RetroArch's `Makefile.emulatorjs` and `Makefile.common`, melonDS's `Makefile.common`.
- `scripts/gen5-sources.ts` fetches each source's commit into a bare repository under `.cache/gen5/sources/git/`. It keeps a ref under `refs/pins/` on that commit, writes the archive with `git archive` and checks the tar's SHA-256 against the pin before it places the file.
- `scripts/gen5-licences-read.ts` reads each notice and the GPL's text from the bare repositories with `git show <commit>:<path>`, and every file of such a folder in one `git cat-file --batch`. `scripts/gen5-notice-groups.ts` groups those files by their opening comment. `scripts/gen5-licences.ts` turns them into the page and escapes every string it got from a file.
- `scripts/gen5-built.ts` writes `licences.html` beside the built page. The dev server (`scripts/gen5-serve.ts`) makes it on each request. Both answer `/source/<archive>` for the manifest's archives alone.
- `src/gen5/core-unpack.ts` names the page's unpacker and its path, which the page, the build, the manifest and both servers read (see "The core's unpacker").
- `scripts/gen5-licences-shot.ts` checks it all in a browser: the notice above the file input at 360 px, the licences page, and a `HEAD` to every source link.

Run `node scripts/gen5-sources.ts` once before you build. Without the archives the build stops and says so.

Nothing fetched is committed: not the archives, not the bare repositories, not the built page. The GPL's text comes from melonDS's `LICENSE` at its pin, the same text the core ships as `license.txt`.

## The commits behind the core

The core's package names no commit of melonDS or RetroArch. The core's own bytes do: its wasm holds melonDS's version string `0.9.3 18a057d` and RetroArch's git hash `6dd4353`. Both resolve in EmulatorJS's forks.

The build scripts' commit is an inference from dates. Each core's `build.json` names the scripts' version 2.0.2, and `b24e5b5` was the head of EmulatorJS/build's main branch around the core's build day. Nothing in the core's bytes names that commit.

`scripts/gen5-pins.ts` records each commit with its basis in a few words, and the licences page prints that basis beside the archive: the registry's `gitHead` for EmulatorJS, the commit named in the core's own bytes for melonDS and RetroArch, the inference from dates for the build scripts, and the tag of the version the served file equals or names for nipplejs and Socket.IO.

## Parts with no notice in the pinned sources

Two parts the core holds carry no notice in any pinned source. The licences page names both and says so.

- Emscripten's runtime. The build scripts' `build_env.sh` names emsdk 3.1.74 for a local build; their CI takes the version from a setting the pin does not hold. The core's wasm names its compiler as `21.0.0git (https:/github.com/llvm/llvm-project 23e3cbb2e82b62586266116c8ab77ce68e412cf8)`. Which Emscripten release that was is not established. No pinned tree holds Emscripten.
- zlib. RetroArch's web build links Emscripten's own zlib port (`-s USE_ZLIB=1`); RetroArch's copy in `deps/libz` is not compiled in. The core's wasm holds zlib's messages and the string `1.3.1`, but no copyright line of zlib.

## libretro-common's notices

The files of libretro-common carry notices of their own, and they differ. Two files the build compiles, `encodings/encoding_base64.c` and `utils/md5.c`, state other terms than the MIT notice most files carry, and some files carry no notice at all. So no notice is typed for the folder. The page takes the opening comment of every `.c` and `.h` file under `libretro-common/` at RetroArch's pin, which is more than the build compiles, and groups the files by that text. Each distinct text stands once, with how many files carry it and, for ten files or fewer, their paths. Where a comment names its own file, the page reads `<this file>` in its place, so the MIT notices that differ only in that name form one group. Files that open with no comment stand by path under "No notice in the file".

## What a public page still needs

The page now runs on the build machine alone. Before it goes public:

- The host serves an archive of our own repository at the build's commit beside the other archives. Today the page links the repository at that commit.
- The host keeps every archive for as long as it serves the build that needs it.
- The deploy copies exactly the manifest's files, the built page and the archives, and refuses a tree with local changes.
- A request log of the live page shows each archive answering 200.

The public Gen 5 page's own issue takes these, next to #62.

## The core's unpacker

EmulatorJS packs each core as a 7z archive and unpacks it with `data/compression/extract7z.js`. That file ships with no licence. It came from another website in 2021 and has not changed since, and nobody names its author or its source. So the page no longer sends it: on 25.11.2026 the user chose that the viewer unpacks the core with its own code.

The page sets `window.EJS_paths` so that EmulatorJS fetches `/extract7z.js` instead: a worker of the viewer's own, under the repository's MIT licence. It speaks the messages EmulatorJS's `compression.js` waits for: progress, one message per file, then done. On a broken archive it posts done and throws the decoder's sentence, so EmulatorJS stops with its own error instead of waiting. The manifest no longer lists EmulatorJS's file, both servers answer it with a 404, and a run whose page asks for it fails on its request log.

The code:

- `src/gen5/range-decoder.ts` and `src/gen5/lzma.ts` decode LZMA, `src/gen5/lzma2.ts` LZMA2's chunks, and `src/gen5/seven-zip.ts` with its header and reader modules the 7z container. It reads LZMA2 and LZMA, the two methods the cores use, checks every CRC the archive carries and refuses any other method by name.
- `src/gen5/core-unpack.ts` holds the worker's logic, the script's name and its path.
- `src/web/gen5/extract7z.ts` is the worker's shell. EmulatorJS starts it from a Blob URL, where a module could not load its imports, so `scripts/gen5-built.ts` bundles it into one classic script, for the build and for the dev server.

We wrote the decoder from these texts:

- `lzma-specification.txt` by Igor Pavlov (2015), from the LZMA SDK, which is in the public domain: the range coder and LZMA's symbols.
- `7zFormat.txt` from the LZMA SDK: the 7z container.
- "The .xz File Format" by Lasse Collin and Igor Pavlov, in the public domain, section 5.3.1: LZMA2's dictionary property.
- The section "LZMA2 format" of the English Wikipedia article "Lempel-Ziv-Markov chain algorithm": LZMA2's chunk layout. We took the layout's facts from it, and no code or text.

The builders of the decoder did not open `extract7z.js`, the LZMA SDK's code, any npm package of a 7z or LZMA decoder, or the planner's probe script, which they only ran. They checked the decoder against that probe: for all four fetched cores, every unpacked file had the same SHA-256. A spec unpacks the four cores with our decoder and finds the commits of melonDS and RetroArch in them; CI runs it on the fetched packages.
