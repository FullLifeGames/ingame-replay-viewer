# src/web

Two pages. The viewer (`index.html`, at `/`) runs the game as WebAssembly, without an emulator. The emulator page (`emulator.html`) plays the replay in the patched ROM in mGBA (`@thenick775/mgba-wasm`) and stays as the fallback. Each page links the other. On both you pick your US Emerald dump and a replay, then press Start. Below the game, each page lists every battle log line the game does not show: the dropped lines and the backend's fallbacks.

On the emulator page, the Start tap opens the page's audio context and hands it to mGBA, which loads seconds later. Firefox opens audio only while a tap lasts, so a context opened after the load stays silent there. If the browser refuses the context, the replay plays without sound. Each Start opens a new context, because mGBA closes its audio when it quits the last game.

The DOM-free modules (`session.ts`, `replay-choice.ts`, `fetch.ts`, `rom.ts`, `stream.ts`, `visitor.ts` and the rest) have specs in Node. `main.ts`, `view.ts` and `replay-view.ts` hold the DOM wiring; the e2e covers them, and coverage leaves them out.

## Starting the pages

Both pages need the build outputs, so run `npm run rom:build` first (a heavy check); the viewer needs the module too ("The viewer" below). Then:

```sh
npm run dev -- --port 5177 --strictPort
```

Open `http://localhost:5177` for the viewer and `http://localhost:5177/emulator.html` for the emulator page.

The dev server serves two files from `build/rom/` and nothing else from there: `/rom/irv-emerald.bps` and `/rom/replay-slot.json`. It never copies them. Any other `/rom/` name answers 404, and `/@fs/` refuses `build/`, `.cache/` and ROM files. When a file is missing, the status line says "The page could not load its game file irv-emerald.bps (404)", and the server's line (`build/rom/irv-emerald.bps is missing: run npm run rom:build`) sits under "Details".

The plugin in `scripts/web-server.ts` puts `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every response.

## What the pages say

Each failure shows two parts. The status line holds the visitor line from `visitor.ts`: what went wrong and what to do next, such as "This replay is a Gen 9 battle. The viewer plays Gen 1 to 3 singles for now." The module's own words, the build commands among them, sit under "Details", a disclosure that starts closed. A line that went well clears the old words under "Details". `visitor.ts` holds every visitor line (`VISITOR_LINES`), and its specs fail on a rendered line that holds `npm run`, `localhost`, `devbox`, `tailscale`, `README` or `<`. Both pages write each line as text, never as markup, since the values come from other people's replays, links and files.

Under a line that asks for a report sits the report link. It opens the repository's issue form "Replay problem" (`.github/ISSUE_TEMPLATE/replay-problem.yml`) in a new tab, with the replay and the line filled in; `report-link.ts` builds the address. GitHub reads issue forms from the default branch, so until the form reaches `master` the link opens GitHub's new-issue page with no form filled in.

The viewer opens with a short intro: what it does, the dump it needs, that your dump and your replay files stay in the tab, and the formats it plays (`PLAYED_FORMATS` in `visitor.ts`). It links the emulator page, the licence page (`public/licences.html`, which Vite copies into the build as it stands) and the source code. The select of test replays reads "Example replay" on both pages.

## The viewer

`index.html` is the viewer. It started as the WebAssembly spike's test page `wasm.html` (#35) and moved to `/` once our own platform layer was done (#43; U1 a, user 23.11.2026). The emulator page moved from `/` to `/emulator.html`.

The viewer runs the game without an emulator. The build compiles the expansion to WebAssembly (`npm run wasm:build`), and the viewer rebuilds that module from your dump with a BPS patch, as the emulator page rebuilds the ROM. You pick the same dump and a replay, then press Start. The viewer reads a replay from a link or ID, from the example replays, or from a file: a replay saved with Showdown's Download replay, a replay page saved from a browser, a battle log, or a replay's JSON file. The file stays in the tab. Both pages share the replay controls (`replay-view.ts`) and the choice (`replay-choice.ts`), so the list under the game gives the same counts on both, and Start plays the replay the list describes. Above the game, a panel names the players by side and the turn the game reached (#58). The game runs in a worker, and the page allows its frames at 1x, 2x or fast. The speed switch works while a replay runs: the new pace counts from the frame the game is at, with no Restart. If the game falls behind after a slow start or a stall, the page lets it go on from the frame it reached, and the game makes up half a second at most. A gap in the page's own asks has no cap yet: a page in view that asks again after five seconds grants those five seconds of frames at once (#57 adds the cap). The worker draws each frame into one of two buffers and the page copies the other, so the page never shows a half-drawn frame. The game's sound plays at 1x, and at 2x at double pace and pitch: a half-band filter (`half-band.ts`) cuts what the halved rate cannot hold before the worker keeps one pair of each two. The worklet waits until two frames of sound sit in the ring, at the start and after each dry spell, and the progress line under "Details" counts the samples it skipped and the times it ran out of sound. At fast it stays silent, and at END the page leaves fast for 1x. The sound starts with Start, because a browser opens audio only after a click. If the page cannot open its audio, the game plays without sound, the status line says why, the line at END keeps the reason, and the next Start tries again.

It needs `npm run rom:build`, `npm run wasm:build -- --compile`, `npm run wasm:convert` and `npm run wasm:build -- --link`, in that order, all heavy checks. The link writes `build/wasm/irv-emerald-wasm.bps` from your dump by the build's rule (`~/roms/` or `IRV_BASE_ROM`); `npm run wasm:build -- --patch` writes it alone.

The dev server serves two files from `build/wasm/`: `/wasm/irv-emerald.js` (the Emscripten glue) and `/wasm/irv-emerald-wasm.bps`. Any other `/wasm/` name answers 404, the module `irv-emerald.wasm` included. The page's own modules in `src/web/wasm/` pass through to Vite under the same prefix. The page also fetches `/rom/replay-slot.json`, since the module's replay slot has the ROM's layout.

`e2e/wasm-spike.spec.ts` plays the hand-made battle at 1x, switches it to 2x and back while it runs, and plays it to END. It then plays it again from Restart at 2x to END, and 994052 at fast, and checks the pace and the sound written at 1x and 2x. It also counts the samples that pass the audio ring, reports the worklet's skips and underruns, finds their counts on the progress line, and measures how loud the sound is. Two Start presses during the build must start one run. A game that fails stops the test with its line. It skips without the dump or the build outputs and names what is missing. Only numbers leave it.

`e2e/wasm-page.spec.ts` loads a replay by link in the viewer and checks its list against the emulator page's. It also follows the viewer's links to the emulator page and to the licence page, and the links back. With the dump and the build outputs, it starts that replay at fast and waits until the game has played some of its instructions, and it plays the hand-made battle to END with an audio context that refuses to start, then reads the reason in the END line.

## Phones

Issue #49 asks the viewer to play a replay to its end on Android in Firefox and in Chrome, and on iOS in Safari. Each browser needs the same five things, and the page names what it lacks:

- A secure context: HTTPS, which `tailscale serve` gives the page (see "Reaching the page over the tailnet"). Plain `http://<tailscale ip>` gets the secure-context line.
- Cross-origin isolation, from the two headers of the dev server and the preview. Without it the browser grants no `SharedArrayBuffer`, which the worker and the page share for the frames, the sound and the pace. The page shows the isolation line instead of its controls.
- Module workers: Firefox 114, Chrome 80, Safari 15 and their later versions. The page asks the `Worker` constructor before it shows its controls, and an older browser gets a line that names these versions.
- The audio worklet (`AudioWorkletNode`). Without it the game plays without sound, and the status line says why.
- 256 MB of memory for the module, fixed at instantiation and never grown. A phone that refuses it gets the line "This browser did not give the game the 256 MB of memory it needs", with the browser's own words, after Start. Each Start tries again with the picked dump. The build before it, the patch applied to the dump and the compile, can run out of memory too; that gets the line "This browser ran out of memory while it built the game from your dump", and a reload with the dump picked again tries once more. `src/web/wasm/failures.ts` holds both lines and the number, and the web server's spec holds it equal to the link's (`scripts/wasm-link.ts`).

On 22.11.2026 the user played the viewer on an Android phone in Firefox over `tailscale serve`, with sound. The viewer was still `wasm.html` then. The runs at the end of wave 4's stage 4 fill this table: a replay at 1x and at 2x to its end on each phone, with the counts of the progress line.

| Phone and browser | Replay | 1x to the end | 2x to the end | Samples skipped | Ran out of sound | What the browser lacks |
| ----------------- | ------ | ------------- | ------------- | --------------- | ---------------- | ---------------------- |
| Android, Firefox  |        |               |               |                 |                  |                        |
| Android, Chrome   |        |               |               |                 |                  |                        |
| iOS, Safari       |        |               |               |                 |                  |                        |

## The preview

```sh
npm run build && npx vite preview --port 5177 --strictPort
```

The preview uses the same plugin, so it sends the same headers and serves the same two files from `build/rom/`. `dist/` holds both pages, the viewer's worker and audio worklet, mGBA's script, worker and wasm, and the test replays. It holds no ROM, patch or save. The workers, the worklet and mGBA's wasm load from `dist/assets/`, and the plugin serves the viewer's two `/wasm/` files from `build/wasm/`, so a replay runs as it does on the dev server. The WebAssembly e2e passed against the preview in wave 3 (B7), when the viewer was still `wasm.html`. The production build for a real host is M2's work.

## HTTPS or localhost

mGBA runs its threads on `SharedArrayBuffer`. A browser grants it only on a secure context (HTTPS or `localhost`) that is cross-origin isolated (the two headers above). The dump's SHA1 needs `crypto.subtle`, which also needs a secure context.

`http://<tailscale ip>:5177` is plain HTTP, so neither page can run the game there, and each shows one line that names what is missing. Open `http://localhost:5177` on devbox, or reach the page over the tailnet with HTTPS.

## Reaching the page over the tailnet

`tailscale serve` puts the dev server behind a tailnet-only HTTPS address with a real certificate:

1. Turn on HTTPS certificates in the tailnet's admin console (DNS, HTTPS Certificates). You set it once.
2. Start the dev server on 127.0.0.1: `npm run dev -- --host 127.0.0.1 --port 5177 --strictPort`. Without `--host`, Vite listens on `::1` only on devbox, and `tailscale serve` below forwards to 127.0.0.1.
3. Run `tailscale serve --bg --https=8443 http://127.0.0.1:5177` on devbox.
4. Open `https://devbox.<tailnet>.ts.net:8443` on the phone or PC.

Vite accepts the `.ts.net` host name (`server.allowedHosts` in `vite.config.ts`). `tailscale serve` opens nothing to the internet. `tailscale serve --https=8443 off` ends it.

## Your dump

The page reads your dump in this tab. Its picker takes any file: a phone greys out a `.gba` file when the picker filters by that extension, and the SHA1 check refuses any other file. It checks the SHA1 against `rom/gen3/build.json`, applies the patch and keeps the patched ROM in memory. It never uploads the dump and never stores it: no IndexedDB, no local storage, no savestate. mGBA's file system stays in memory, and its autosave is off. A reload forgets the dump.

Besides its own files, each page sends only GET requests. The emulator page fetches the two `/rom/` files from its own server. The viewer fetches the glue `/wasm/irv-emerald.js`, the module patch `/wasm/irv-emerald-wasm.bps` and the slot file `/rom/replay-slot.json`. Both fetch a replay JSON from `replay.pokemonshowdown.com` when you load a replay by link or ID.

## The e2e

```sh
npm run test:e2e
```

Playwright drives both pages in Chromium on its own dev server at port 5178. It runs on devbox only, never in CI, and it is a heavy check. The first run needs `npx playwright install chromium`.

Thirteen tests need neither the dump nor `npm run rom:build`. Three run on the emulator page (`e2e/page.spec.ts`): the headers, the link back to the viewer and the replay list; the environment line on a page without the headers, with its words under "Details" and its report link; and the refusal of a file that is not US Emerald. Three in the viewer load a replay by link or pick an example replay (`e2e/replay-link.spec.ts`), with a link that holds markup and an example that fails to load with its report link, and two more sit in `e2e/wasm-page.spec.ts`. Three read a replay from a file in the viewer (`e2e/replay-file.spec.ts`): each kind of saved file, built from the test fixture, gives the list of the same replay loaded by link; a file of no kind the viewer reads gets its line and leaves the list as it was; and on a screen 360 px wide, the longest replay ID the reader takes wraps in the status line, its detail and the summary. There a route answers for Showdown from the test fixture, so no request leaves the machine. Two check the panel on a screen 360 px wide (`e2e/panel.spec.ts`): it names the players by side, and it writes a file's names as text and wraps a long one. With the dump and the build outputs, a third panel test checks that the panel's turn follows the game's.

The emulator test plays 994052, then 994086 after a second Start. It reads your dump by the build's rule: `~/roms/Pokemon - Emerald Version (USA, Europe).gba`, or the path in `IRV_BASE_ROM`. Without the dump or without `build/rom/irv-emerald.bps`, it skips and names what is missing. It fails when `build/rom/build-info.json` lacks part of `rom/gen3/patches/series` or `src/replay_boot.c`. It shows that the emulator runs the replay's ROM and that the frames change after Restart. The tester checks that the replay plays to its end and that Restart starts it over.

The game's frames come from the ROM, so no frame leaves memory. The e2e writes no screenshot, video or trace. It compares frames in memory (`e2e/frames.ts`), and only counts and yes-or-no answers leave it.
