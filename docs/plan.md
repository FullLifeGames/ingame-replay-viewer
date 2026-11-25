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
- **Gen 3 emulator**: `@thenick775/mgba-wasm` in the browser, unchanged. Native headless mGBA for tests on devbox: `mgba-rom-test` runs the expansion's `make check`, and the screenshot checks run on the system's libmgba. Milestone 1b showed that a WebAssembly build of the expansion runs in the browser without an emulator (`docs/wasm-spike.md`), and milestone 2 ships it (wave 3 gate, 22.11.2026). Our own platform layer passes the screenshot scenes (#43), so the WebAssembly page is the viewer at `/`. mGBA stays on the emulator page at `/emulator.html` as the fallback (user, 23.11.2026). Gen 5 stays on an emulator either way, because BW2 draws its battles with the DS's 3D chip and runs its sound on a second processor.
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

Order after milestone 2 (user, 22.11.2026): milestone 3 starts first, and Gen 5 (milestone 6) follows beside it, since the two touch different games and can run as separate lanes. Wave 5 (user, 24.11.2026): the cleanup that finishes milestone 2's code (#65 to #71) runs in one lane, with a time-boxed Gen 5 spike (#72) beside it. Milestone 3 starts once the cleanup ends.

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
   - Ships the WebAssembly build as the viewer at `/`. #43 is done, and the emulator page stays at `/emulator.html` as the fallback, on devbox and on the site (user, 23.11.2026). Milestone 2 closes every open Gen 3 issue before the work moves on (user, 22.11.2026); five parked issues whose triggers have not fired (#26, #27, #28, #29, #40) moved to milestone 3 (user, 23.11.2026).
   - Download size (#17, user 22.11.2026): the host serves the module patch as it is, compressed with brotli. `scripts/patch-sizes.ts` measured it on 24.11.2026 on the module of wave 5's stage 2 (stream version 3, our whole platform layer, the refusal screen, overlay patch 0011, the division helpers), with Node's zlib (gzip at level 9, brotli at quality 11): the module patch is 20,976,006 bytes raw, 15,600,456 with gzip and 14,207,653 with brotli. With Emscripten's glue (2,898 bytes with brotli), a visitor to the viewer fetches 14,210,551 bytes of game files. Brotli at quality 11 moves by about 0.3 % when bytes shift: a 7-byte change to the raw patch once added 46,860 bytes with brotli and 16 with gzip. The brotli figures hold for files the host compresses ahead of time; a host that compresses on the fly at a lower quality sends more. The ROM patch measures 18,392,435, 15,763,460 and 14,486,401. By ELF symbol size the ROM holds 26.82 MB, and the cries (1.62 MB) and Pokémon graphics (1.15 MB) of species up to 386 hold 2.77 MB of it. The census gave only these two classes a retail share: it did not count songs, trainer graphics, battle animation graphics or tilesets, and it counts symbol bytes, not the patch's literal bytes, so the patch may copy some of them from the dump. The 2.77 MB is the species assets' share, not a bound on what per-asset extraction could save. Extracting the species assets would save less than their 2.77 MB: the build draws Gen 1–3 Pokémon in the Gen 4/5 style, which retail Emerald lacks, and nobody has checked whether the expansion's cries match retail's. The user parked extraction until visitors report slow loading after the deploy.
   - Open: how it is deployed to vserver, including the COOP/COEP headers the page needs for `SharedArrayBuffer`.
3. **Newer formats on Gen 3.** Gen 4–9 singles, including Tera, Mega Evolution, Z-Moves and Dynamax.
   - Order (user, 24.11.2026): Gen 4 OU and Gen 5 OU first, with Team Preview as their only new mechanic; then Gen 9 OU with Tera; then Gen 6 to 8 with Mega Evolution, Z-Moves and Dynamax.
   - Gen 4 OU plays since #86: its two test replays play to the end in mGBA and in the module. The viewer opens by generation (gate, 25.11.2026), so every Gen 4 singles format plays, and the lines it has no rule for show under "Not shown in the game".
   - Gen 5 OU plays since #87: its two test replays play to the end in mGBA and in the module, and every Gen 5 singles format plays by the same rule. The game has no Team Preview screen, so the viewer lists both teams of six under the game. In ten Gen 5 OU logs from the ladder and from tournaments, checked on 25.11.2026, "Not shown in the game" held Trick's swap line, Chople Berry weakening a hit, and stand-in lines for Toxic Spikes, Taunt's end and Focus Sash. A replay in which Illusion's disguise ends does not play at all: the page says the game cannot show it.
4. **Doubles on Gen 3.** VGC, including Champions formats with open team sheets.
   - Open: which Champions mechanics the expansion covers.
5. **Viewer v2.** Jump to a turn, flip sides, exact HP for random formats (re-running the battle from the published seed and inputs), backgrounds per format, music, rating display.
6. **Gen 5.** Black 2/White 2 driven from outside: first Gen 1–5 formats, then newer ones.
   - Starts with a time-boxed spike in wave 5 (#72; user, 24.11.2026), on Black 2 (USA) from the user's dump.
   - Trainer's hint line (#76, user, 24.11.2026): once a Gen 5 backend holds the server, it never writes the adapter's action-selection command, so the client starts no action selection during a replay and shows none of the trainer's hint lines (`CheckTrainerHintMsg` in pokebw2's `src/battle/btl_client.c`).
   - Open: the emulator (EmulatorJS's melonDS, desmume-wasm, DS Anywhere) and speed on phones.
   - Way into a battle (#78; user, 24.11.2026): a save file before a trainer, and a short macro into the battle. The long route from New Game stays a development tool. A save we made from New Game, before Youngster Terrell on Route 20, ships in `src/web/gen5/saves/` (`docs/gen5-save.md`). The page loads it into the core before the game starts, and the macro reaches the battle's action menu 1,642 frames after the title.
   - Open: borrowed slots for newer content, and permission from Smogon for its Gen 5-style sprites.
7. **Live play.** Pick moves in the game's own menus and play on Showdown.
   - Open: memory access in the GBA emulator, the transport, and the choice screens.
   - Smogon's bot policy (2026-10-09) doesn't apply: it covers autonomous bots, and here a human plays (user's call, 2026-11-20).
8. **Gen 5 expansion.** A Black 2/White 2 with later generations' content, built from pinned pokebw2.
   - Open: everything. First check whether a community effort on pokebw2 already exists.
   - Candidate: Boundless Black 2 by magickappy, due on 28.11.2026 (user's pointer, 21.11.2026). The hack puts all 1,025 species into Black 2, with regional forms, the Fairy type, Megas, modern moves, abilities and items, and animated Gen 5-style sprites. Its engine is White2Upgrade (721 species and the Fairy type), expanded to 1,025. A fan site says the developer plans to open the source a few weeks after release; nobody has named a licence or the build method yet. Once the source is out, check whether it builds from pokebw2 or patches the binary, and whether its licence allows a pinned build as ADR 0007 describes.
9. **3D (Gen 9).** Scarlet/Violet.
   - Open: everything.
10. **3D (Pokémon XD).** Pokémon XD: Gale of Darkness, through its native PC port (user's pointer, 23.11.2026).
    - The port: imyourhuckleberryponcho/Pokemon-XD-PC-Port, version 0.7.0, a public beta under MIT. It compiles the Pokémon XD decompilation (CC0) for 64-bit Windows, with test builds for Linux and macOS, and draws with Direct3D 12, Vulkan or Direct3D 11. Its README (read on 23.11.2026) calls it playable from New Game into the story, with known bugs.
    - It reads everything from the user's own disc image (USA, `GXXE01`) while it runs, and its repository holds no game data. That fits ADR 0002.
    - Battles: singles and doubles, the port's own battle replays with pause, speed control and a free camera (0.7.0), and mods that script battle effects in Luau.
    - Open: everything. A spike comes first, on two questions:
      - how a battle script reaches the game while the game stays a renderer (ADR 0001) and we keep no fork (ADR 0007);
      - whether the port can run in a browser, or whether this target ships as a desktop viewer.
    - Order: it stays last (user, 24.11.2026). XD fights doubles in its story, so it builds on milestone 4.
