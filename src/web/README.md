# src/web

The dev page. You pick your US Emerald dump and a replay, press Start, and the replay plays in the patched ROM in mGBA (`@thenick775/mgba-wasm`). Below the game, the page lists every battle log line the game does not show: the dropped lines and the backend's fallbacks.

The DOM-free modules (`session.ts`, `fetch.ts`, `rom.ts`, `stream.ts` and the rest) have specs in Node. `main.ts` and `view.ts` hold the DOM wiring; the e2e covers them, and coverage leaves them out.

## Starting the page

The page needs the build outputs, so run `npm run rom:build` first (a heavy check). Then:

```sh
npm run dev -- --port 5177 --strictPort
```

The dev server serves two files from `build/rom/` and nothing else from there: `/rom/irv-emerald.bps` and `/rom/replay-slot.json`. It never copies them. Any other `/rom/` name answers 404, and `/@fs/` refuses `build/`, `.cache/` and ROM files. When a file is missing, the page shows the server's line: `build/rom/irv-emerald.bps is missing: run npm run rom:build`.

Every response carries `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The plugin in `scripts/web-server.ts` sets them.

## The preview

```sh
npm run build && npx vite preview --port 5177 --strictPort
```

The preview uses the same plugin, so it sends the same headers and serves the same two files from `build/rom/`. `dist/` holds the page, mGBA's script, worker and wasm, and the test replays. It holds no ROM, patch or save. mGBA's worker and wasm load from `dist/assets/`, and the replay runs as it does on the dev server. The production build for a real host is M2's work.

## HTTPS or localhost

mGBA runs its threads on `SharedArrayBuffer`. A browser grants it only on a secure context (HTTPS or `localhost`) that is cross-origin isolated (the two headers above). The dump's SHA1 needs `crypto.subtle`, which also needs a secure context.

So `http://<tailscale ip>:5177` does not work: it is plain HTTP, and the page shows one line that says what is missing. Open `http://localhost:5177` on devbox, or reach the page over the tailnet with HTTPS.

## Reaching the page over the tailnet

`tailscale serve` puts the dev server behind a tailnet-only HTTPS address with a real certificate:

1. Turn on HTTPS certificates in the tailnet's admin console (DNS, HTTPS Certificates). This is a one-time setting.
2. Start the dev server on 127.0.0.1: `npm run dev -- --host 127.0.0.1 --port 5177 --strictPort`. Without `--host`, Vite listens on `::1` only on devbox, and `tailscale serve` below forwards to 127.0.0.1.
3. Run `tailscale serve --bg --https=8443 http://127.0.0.1:5177` on devbox.
4. Open `https://devbox.<tailnet>.ts.net:8443` on the phone or PC.

Vite accepts the `.ts.net` host name (`server.allowedHosts` in `vite.config.ts`). Nothing is opened to the internet. `tailscale serve --https=8443 off` ends it.

## Your dump

The page reads your dump in this tab. It checks the SHA1 against `rom/gen3/build.json`, applies the patch and keeps the patched ROM in memory. It never uploads the dump and never stores it: no IndexedDB, no local storage, no savestate. mGBA's file system stays in memory, and its autosave is off. A reload forgets the dump.

Besides its own files, the page sends only GET requests: the two `/rom/` files from its own server, and a replay JSON from `replay.pokemonshowdown.com` when you load a replay by link or ID.

## The e2e

```sh
npm run test:e2e
```

Playwright drives the page in Chromium on its own dev server at port 5178. It runs on devbox only, never in CI, and it is a heavy check. The first run needs `npx playwright install chromium`.

Five tests need neither the dump nor `npm run rom:build`: the headers and the replay list, the environment line on a page without the headers, the refusal of a file that is not US Emerald, and two tests of a replay by link (`e2e/replay-link.spec.ts`). There a route answers for Showdown from the test fixture, so no request leaves devbox.

The emulator test plays 994052, then 994086 after a second Start. It reads your dump by the build's rule: `~/roms/Pokemon - Emerald Version (USA, Europe).gba`, or the path in `IRV_BASE_ROM`. Without the dump or without `build/rom/irv-emerald.bps`, it skips and names what is missing. It fails when `build/rom/build-info.json` lacks part of `rom/gen3/patches/series` or `src/replay_boot.c`. It shows that the emulator runs the replay's ROM and that frames change after Restart; that the replay plays to its end, and that Restart starts it over, is the tester's to check.

The game's frames come from the ROM, so no frame leaves memory. The e2e writes no screenshot, video or trace. It compares frames in memory (`e2e/frames.ts`), and only counts and yes-or-no answers leave it.
