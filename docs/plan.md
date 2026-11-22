# Plan

Decisions from the design session on 2026-11-20 that are not ADRs, plus the roadmap. The roadmap becomes GitHub milestones. Milestone 1 also gets issues now; each later milestone gets its issues when it starts.

## Decided

- **Audience**: a public web tool on fulllifegames.com/Tools/. The user brings their own ROM (ADR 0002). Development runs on devbox, watched over Tailscale.
- **Target game order**: pokeemerald-expansion first, then Black 2/White 2, later a Gen 5 counterpart of the expansion, then 3D (ADR 0003).
- **Scope order**: era-matched replays first on each target game, newer formats after. Singles before doubles.
- **Game-side code**: no forks (ADR 0007). Gen 3 replays go into the game's memory before it starts (ADR 0009); the emulator page, the fallback, writes them into the ROM image (ADR 0008).
- **Battle text**: BW2 uses its own message banks; Gen 3 starts with finished text from outside (ADR 0005).
- **Replay input (v1)**: a replay URL or ID from replay.pokemonshowdown.com, or an uploaded file (Showdown's downloaded replay HTML, or a raw log). The browser fetches the replay JSON directly; no proxy is needed.
- **Viewer controls (v1)**: play/pause, speed (1×/2×/fast), restart, and a small panel with player names and the turn number. Player 1 is always the near side.
- **Presentation (v1)**:
  - trainer sprites picked from the Showdown avatar, falling back to Brendan on the near side and May on the far side; the near side shows an avatar only if the game has its back sprite
  - the intro with the Poké Ball team display, in the expansion's wording ("You are challenged by Bob!")
  - trainer battle music
  - an outro with the winner
- **HP display**: both sides show only the HP bar, no numbers, because replays carry percentages.
- **Devices**: desktop browsers first; phones are best effort.
- **No silent drops**: every battle log line is either shown or listed as a dropped line. Tests fail on an unknown line, and the page lists what wasn't shown.
- **Fallbacks for content gaps on Gen 3**:
  - a move without its own animation gets a generic one for its type and category
  - a form without a sprite shows its base form
  - anything else becomes a text line

  Every fallback is listed next to the dropped lines.

- **Test replays**: real public replays saved as JSON in the repo, picked by hand or through Showdown's replay search, never from the MatchChecker crawl data. Each gets a snapshot test of its battle script and a check that every line is either shown or dropped.
- **Gen 3 emulator**: `@thenick775/mgba-wasm` in the browser, unchanged. Native headless mGBA for tests on devbox: `mgba-rom-test` runs the expansion's `make check`, and the screenshot checks run on the system's libmgba. Milestone 1b showed that a WebAssembly build of the expansion runs in the browser without an emulator (`docs/wasm-spike.md`), and milestone 2 ships it (wave 3 gate, 22.11.2026). mGBA stays as the fallback page until our own platform layer passes the screenshot scenes (#43). Gen 5 stays on an emulator either way, because BW2 draws its battles with the DS's 3D chip and runs its sound on a second processor.
- **Testing inside the ROM**: the expansion's own headless test runner (`make check`) feeds instruction streams to the ROM interpreter and checks what was shown. A few headless-emulator screenshot checks cover the whole pipeline. These are heavy checks on devbox and run one at a time.
- **Repo layout**: this repo holds the code outside the ROM, our ROM-side files and their list of changes against pinned upstream, the docs, and the build. Nintendo assets never enter it.
- **License**: MIT for this repo (ADR 0006).
- **ROMs on devbox**: the user's own dumps go in `~/roms/`, outside every repo.
- **Defaults**:
  - TypeScript on Node 24 (`.nvmrc`)
  - Vite for the page
  - vitest with at most 4 workers
  - the expansion pinned to a release tag (1.17.2 as of 2026-11-20)

## Roadmap

Order after milestone 2 (user, 22.11.2026): milestone 3 starts first, and Gen 5 (milestone 6) follows beside it, since the two touch different games and can run as separate lanes.

1. **First replay.** One real ADV OU singles replay plays start to finish in the expansion ROM, watched on a bare page served from devbox over Tailscale:
   - intro and send-outs
   - move animations and their text
   - HP bars draining to the logged percentages
   - switches, faints, status, stat changes, weather
   - the closing win message

   The first test replays are about five ADV OU replays from Smogon tournaments.

   **1b. WebAssembly spike.** A time-boxed attempt to compile the expansion straight to WebAssembly, so it runs in the browser without an emulator. It would borrow pokeemerald-multiplatform's platform layer (a software graphics renderer, a sound mixer, DMA and the BIOS calls). That layer carries no licence as a whole: the fork's MIT grant covers only its own changes, and the files come from Kurausukun's PC port, which has no licence (`docs/wasm-spike.md`, "Licences").
   - Result (wave 3, 22.11.2026): it works. Both test streams play from boot to the end in Chromium with sound, and the 13 screenshot scenes match mGBA's. Milestone 2 ships the WebAssembly build. The module patch carries what the ROM patch carries (ADR 0002 amended), and the worker writes the stream into the replay slot in the module's memory (ADR 0009). A public build needs a platform layer of our own (#43).
   - Reference only: tripplyons/pokeemerald-wasm (vanilla, no license file).

2. **Gen 3 web tool v1.** Public on fulllifegames.com/Tools/, with replay URL and upload, the v1 controls and presentation, and Gen 1–3 singles formats.
   - Ships the WebAssembly build, with the emulator page as the fallback until #43 is done. Milestone 2 closes every open Gen 3 issue before the work moves on (user, 22.11.2026).
   - Download size (#17, user 22.11.2026): the host serves the module patch as it is, compressed with brotli. `scripts/patch-sizes.ts` measured it on 22.11.2026, before the module's rebuild for stream version 2, with Node's zlib (gzip at level 9, brotli at quality 11): the module patch is 20,975,249 bytes raw, 15,604,051 with gzip and 14,183,658 with brotli. With Emscripten's glue (2,803 bytes with brotli), a visitor to the WebAssembly page fetches 14,186,461 bytes of game files. The ROM patch measures 18,391,067, 15,762,689 and 14,487,718. Per-asset extraction could take 2.77 MB off at most: the cries (1.62 MB) and Pokémon graphics (1.15 MB) of species up to 386, out of the ROM's 26.82 MB of symbols. The real gain is smaller. The build draws Gen 1–3 Pokémon in the Gen 4/5 style, which retail Emerald lacks, and nobody has checked whether the expansion's cries match retail's. Extraction is parked until visitors report slow loading after the deploy.
   - Open: how it is deployed to vserver, including the COOP/COEP headers the page needs for `SharedArrayBuffer`.
3. **Newer formats on Gen 3.** Gen 4–9 singles, including Tera, Mega Evolution, Z-Moves and Dynamax.
   - Open: which formats besides Gen 9 OU come first.
4. **Doubles on Gen 3.** VGC, including Champions formats with open team sheets.
   - Open: which Champions mechanics the expansion covers.
5. **Viewer v2.** Jump to a turn, flip sides, exact HP for random formats (re-running the battle from the published seed and inputs), backgrounds per format, music, rating display.
6. **Gen 5.** Black 2/White 2 driven from outside: first Gen 1–5 formats, then newer ones.
   - Open: the emulator (EmulatorJS's melonDS, desmume-wasm, DS Anywhere) and speed on phones.
   - Open: building the savestate in the user's browser from a save file.
   - Open: borrowed slots for newer content, and permission from Smogon for its Gen 5-style sprites.
7. **Live play.** Pick moves in the game's own menus and play on Showdown.
   - Open: memory access in the GBA emulator, the transport, and the choice screens.
   - Smogon's bot policy (2026-10-09) doesn't apply: it covers autonomous bots, and here a human plays (user's call, 2026-11-20).
8. **Gen 5 expansion.** A Black 2/White 2 with later generations' content, built from pinned pokebw2.
   - Open: everything. First check whether a community effort on pokebw2 already exists.
   - Candidate: Boundless Black 2 by magickappy, due on 28.11.2026 (user's pointer, 21.11.2026). The hack puts all 1,025 species into Black 2, with regional forms, the Fairy type, Megas, modern moves, abilities and items, and animated Gen 5-style sprites. Its engine is White2Upgrade (721 species and the Fairy type), expanded to 1,025. A fan site says the developer plans to open the source a few weeks after release; nobody has named a licence or the build method yet. Once the source is out, check whether it builds from pokebw2 or patches the binary, and whether its licence allows a pinned build as ADR 0007 describes.
9. **3D (Gen 9).** Scarlet/Violet.
   - Open: everything.
