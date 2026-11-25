// The sources of the Gen 5 page's components (#79): each a git repository at one full commit,
// pinned by the SHA-256 of the tar that `git archive` writes of it (scripts/gen5-sources.ts; each
// read with --print under git 2.53.0, 25.11.2026, and held on a fresh fetch). Each names its
// basis: how we know the served files came from that commit, in the words the licences page
// prints beside its archive. scripts/gen5-manifest.ts gives them to its components.
import type { Source } from './gen5-manifest.ts'

/** EmulatorJS's commit: the registry's gitHead of both pinned packages (scripts/gen5-fetch.ts). */
export const EMULATORJS_COMMIT = 'e150dc0491ae747028919fb82d6598954976ede6'

/** The tag v4.2.3. The served files equal that commit's tree by git blob hash. */
export const EMULATORJS_SOURCE: Source = {
  name: 'emulatorjs',
  repository: 'https://github.com/EmulatorJS/EmulatorJS',
  commit: EMULATORJS_COMMIT,
  tar: '133ea8f066b966bf716d71954d66238d5cf30bf2a243285d804322f2936f9b37',
  basis: "the registry's gitHead of both pinned packages",
}

/** The core's wasm holds the library version "0.9.3 18a057d": melonDS's libretro.cpp builds it
 * from MELONDS_VERSION and the git hash its Makefile reads. 18a057d resolves in this repository. */
export const MELONDS_SOURCE: Source = {
  name: 'melonds',
  repository: 'https://github.com/EmulatorJS/melonDS',
  commit: '18a057d372783b42d7e297b8731f3c3d673cdcab',
  tar: '4368395f6ce9ec1e199a5bdef4591a86b8cfe70f101bc9d0421a56ea15d3e928',
  basis: "the commit named in the core's own bytes",
}

/** The wasm's data starts with "6dd4353", RetroArch's GIT_VERSION (version_git.c); it resolves
 * in this repository, on the branch next that EmulatorJS's build script clones. */
export const RETROARCH_SOURCE: Source = {
  name: 'retroarch',
  repository: 'https://github.com/EmulatorJS/RetroArch',
  commit: '6dd4353937ef48b6ec0bfbdbb15d1c5992d86927',
  tar: '05515361238893f7983dffb1be87881cb774868c9adf99169a17616ce74b13d7',
  basis: "the commit named in the core's own bytes",
}

/** Each core archive's build.json names the build scripts' version 2.0.2; this commit was main's
 * head from 2025-06-02 to 2025-07-06, around the build of 2025-06-14. Nothing in the core names
 * the commit: it is an inference from dates. */
export const BUILD_SOURCE: Source = {
  name: 'emulatorjs-build',
  repository: 'https://github.com/EmulatorJS/build',
  commit: 'b24e5b535034dc7c3428d76f236d4793881969b6',
  tar: '4010b0545376a6573facab7e10fddd1ec627f1e8091e042c1aaba673140c442f',
  basis: "inferred from dates: the head of the scripts' main branch around the core's build day",
}

/** The tag v0.10.2: the served file equals nipplejs 0.10.2's dist/nipplejs.js plus one newline. */
export const NIPPLEJS_SOURCE: Source = {
  name: 'nipplejs',
  repository: 'https://github.com/yoannmoinet/nipplejs',
  commit: '9fca6e72bb99318d69092075015140179f4e32bf',
  tar: '8b7b070943ed50c5dfaab5539e8789a46e78f41c27adbec361e01d08ef398d6f',
  basis: 'the tag v0.10.2, the version the served file equals',
}

/** The tag socket.io@4.8.1 of the monorepo; the served file's header names Socket.IO v4.8.1. */
export const SOCKET_IO_SOURCE: Source = {
  name: 'socket.io',
  repository: 'https://github.com/socketio/socket.io',
  commit: '91e1c8b3584054db6072046404a24e79a17c1367',
  tar: '81780e2ad998b36375cbe33f6420e700f0f830b9f921bf98b090648cf1f9a932',
  basis: "the tag socket.io@4.8.1, the version the served file's header names",
}
