# The Gen 5 spike (#72)

Milestone 6 plays replays inside Black 2 and White 2 on a DS emulator, driven from outside (ADR 0003, ADR 0007). Before anyone builds a Gen 5 backend, #72 asked five questions: which emulator runs Black 2 in a browser and lets the page reach the game's memory, how the page gets into a battle, how instructions reach the battle client while the game decides nothing, where the battle text comes from, and which headless tool can check frames. The spike ran in wave 5, lane a, on 24 November 2026, in eleven builder steps: the plan's seven (S1 to S7), S2b (the page for the user's own speed check) and S3b (SkyEmu's web build), which the integrator added, and S8 and S9, which fixed what the lane's review found. The game is Black 2 (USA) from the user's dump. Each figure below names the step and the run log it comes from; the logs stay on the build machine.

## Verdict

The spike reached its goal. Black 2 boots from the dump in EmulatorJS's melonDS core in headless Chromium on the build machine, with no BIOS or firmware file. An input macro took the game from New Game into its first battle, Tepig against the rival's Oshawott, in pieces that S5 played from states saved under earlier versions of the macro. The final macro has not reached the battle from boot: in S9 its walk stalled before the lookout, at frame 23,270 (see "Into a battle"). In the battle the page holds the game's battle server, writes blocks of the game's own server commands into the player's battle adapter, and the game plays them: "Tepig used Tackle!", the move's animation, Oshawott's HP bar falling to the value the page gave, and "It's super effective!" (S6). The game decided nothing. One Tackle took Oshawott from 20 HP to 1, and in a second run Tepig used Flamethrower and Oshawott Hydro Pump, moves neither of them knows.

The proof covers one battle and one kind of moment: a move's line, its animation, an HP change and one standard line. Faints, switches, status, weather, the hit flash and the set messages stay untried. On the build machine the emulator runs far below real time, and no PC or phone figures have come back yet. A public page also waits on the licence call in "Licences" below.

## What the spike built

- `src/gen5/`: plain TypeScript that imports no DOM, no browser API and no Node module (17 files, 15 specs). It reads and checks the DS header (`nds-header.ts`), finds DS main RAM in the emulator's heap (`main-ram.ts`), plays input macros with RAM checks and a fixed clock (`macro.ts`, `route.ts`, `ram-check.ts`, `clock.ts`), packs server commands into an adapter block (`server-cmd.ts`, `adapter.ts`), finds the battle's Pokémon in RAM (`battle-mons.ts`) and builds one moment (`moment.ts`). No lint zone holds it yet (see "Open questions").
- `src/web/gen5/`: the Gen 5 page. It takes the dump through a file input, refuses anything but Black 2 (USA) version 0 with a sentence that names what it found, loads EmulatorJS, and gives the scripts a hook on `window` for frames, RAM and macros. A speed line, a device line and a "Copy figures" button serve the user's own check. The frame driver and the byte codecs have specs (S8).
- `scripts/gen5-*`: the fetch of EmulatorJS's pinned npm packages with their integrity check (`gen5-fetch.ts`), the page's servers (`gen5-serve.ts`, static with `--built`), the Chromium runs with frames, a request log and a memory log (`gen5-shot.ts`, `gen5-route.ts`, `gen5-moment.ts`), and the generator of pokebw2's numbers (`gen5-bw2*.ts`).
- The fetched emulator, the pokebw2 checkout, the generated `build/gen5/bw2.json`, the states and the frames sit in the gitignored `.cache/gen5/` and `build/gen5/`. The spike committed no ROM, no part of one, no state, no save file and no file of pokebw2. It left the Gen 3 code, its ROM files and the viewer's pages as they were; the shared files it changed are `knip.json` (one entry line) and `AGENTS.md` (one line in the project list).

## The emulator (question 1)

|                            | EmulatorJS's melonDS                                                                                                                                                                             | SkyEmu, web build                                                                                                                                            | SkyEmu v5, native                                           | melonds-wasm, desmume-wasm, DS Anywhere                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| What the spike did         | Every hands-on step (S1, S2, S2b, S5, S6)                                                                                                                                                        | Boot and title screen (S3b)                                                                                                                                  | Two runs (S3)                                               | Read their sources and docs (plan)                                                    |
| Version                    | npm `@emulatorjs/emulatorjs` and `@emulatorjs/core-melonds` 4.2.3; the core was built on 2025-06-14 from EmulatorJS's melonDS, a melonDS 0.9.x fork (README badge 0.9.2, `CMakeLists.txt` 0.9.3) | Commit adacd078 of 2026-09-11, as https://web.skyemu.app/ served it on 24.11.2026                                                                            | Release v5 (2026-02-12), Linux build                        | melonDS DS 1.4.0; a DeSmuME fork of 2023; a melonDS fork of 2026                      |
| Black 2                    | Opening, title, New Game, the field, the first battle                                                                                                                                            | Opening and title screen                                                                                                                                     | Aborts before its first frame (skylersaleh/SkyEmu#576)      | No report of Black 2 for two of them; DeSmuME 0.9.8 and later run it by forum reports |
| BIOS and firmware          | None asked. The fork's source falls back to DraStic's FreeBIOS; its log line does not reach the browser                                                                                          | None asked. The console shows it looking for `nds7.bin`, `nds9.bin` and `firmware.bin` and finding none; by its source it then boots on its bundled FreeBIOS | Bundled FreeBIOS (source)                                   | melonds-wasm ships FreeBIOS; desmume-wasm has DeSmuME's HLE BIOS                      |
| Memory from the page       | The core's heap through `gameManager.Module`; main RAM found by content, one base; a written word held over 60 frames                                                                            | `HEAPU8` is a page global; the search finds two bases; no write tried                                                                                        | HTTP `/read_byte` and `/write_byte`; the server never bound | No memory API documented                                                              |
| States                     | `getState()` and `loadState()`: a RetroArch state of 7,042,800 bytes                                                                                                                             | Files in its in-browser file system; no exported call                                                                                                        | HTTP `/save` and `/load`                                    | melonds-wasm has both calls; desmume-wasm none                                        |
| Threads                    | The plain core runs without threads; the thread core needs `SharedArrayBuffer` and was no faster (S2)                                                                                            | None in the build                                                                                                                                            |                                                             | melonds-wasm needs cross-origin isolation                                             |
| Speed on the build machine | 7 to 35 frames per second by scene, cap and load (see "Speed")                                                                                                                                   | About 4.5 frames per second                                                                                                                                  | None: no frame                                              | Not measured                                                                          |
| Licence                    | GPL-3.0                                                                                                                                                                                          | MIT                                                                                                                                                          | MIT                                                         | GPL-3.0, GPL-2.0, GPL-3.0                                                             |

Sources for the columns not tried: the plan's research of 24.11.2026 (soyangelromero/melonds-wasm and its `API_CONTRACT.md`, 44670/desmume-wasm and its hosted `app.js`, brxxn/ds-anywhere, GitHub's API for each licence).

### EmulatorJS's melonDS

The spike recommends this emulator for a backend's development: S1, S2, S2b, S5 and S6 ran on it, the battle among them.

- The page fetches the emulator from its own server. EmulatorJS 4.2.3 asks its CDN for `version.json` when the page's host name is `localhost` or `127.0.0.1` (`checkForUpdates` in `emulator.js`). The shot script opens the page under a `.localhost` name, where EmulatorJS skips the check, and the request log of every run lists local requests alone (S1, `gen5-boot.log` to `gen5-boot-3.log`; S2b, `gen5-built.log`). The npm package ships no `emulator.min.js` and no `emulator.min.css`, so each start logs two answers of 404 and the loader takes the plain files.
- Chromium's seven processes held 2.4 to 2.5 GB (sum of PSS) while the 512 MB dump loaded, and 1.9 to 2.0 GB after; the renderer alone held 1.74 to 1.84 GB (RSS; S1). The first frame came 29 to 56 s after the pick (S1 to S2b, `user-check.log`).
- Main RAM: the page searches the core's heap (1.22 GB) for the copy of the cartridge header that the boot code leaves at 0x023FFE00. It accepts a hit only when the dump's ARM9 bytes sit at the address the header gives for them. A single candidate passed in every run, at the same heap offset per core build, and the heap did not grow in four minutes (S2, `gen5-speed-plain.log`, `gen5-speed-plain-2.log`, `gen5-speed-thread.log`). A word written at 0x021DDFA8 on the title screen read back the same 61 and 62 frames later (`gen5-speed-plain-2.log`, `gen5-speed-thread.log`). S5 and S6 then read and wrote every value through this base.
- The page set the cross-origin isolation headers in every run. By its build file (`Makefile.emulatorjs`, `HAVE_THREADS ?= 0`) the plain core needs no `SharedArrayBuffer`; the spike read that and did not run without the headers.

### SkyEmu

SkyEmu is the MIT candidate, and the spike tried it twice.

- Native (S3): SkyEmu v5's Linux build aborts in its headless `http_server` mode about a second after start, before its HTTP server binds, on a failed assert in `sg_make_image` (`gen5-skyemu.log`, `gen5-skyemu-2.log`). That is the open upstream bug skylersaleh/SkyEmu#576: headless mode loads its theme image before the graphics setup, and the release builds keep their asserts. The spike's scripts for it never ran against a live server, and S7 removed them.
- Web (S3b): the build that web.skyemu.app served on 24.11.2026, fetched once and served from the build machine, boots the dump through its own file input in headless Chromium. Run 2 pressed nothing and ended in the opening (`s3b-run2.log`). Run 3 pressed Start twice: the first press changed nothing on screen, and the second brought the title screen (`s3b-run3.log`). It asked for three files and made no request off the machine. The page can reach the whole wasm heap: `SkyEmu.js` is a classic script, so `HEAPU8` lands on `window`. The header search finds two bases that pass both checks; which one is live stays open, and the spike wrote no word there. SkyEmu's own page writes the picked file into its in-browser file system and syncs it to IndexedDB, so a visitor would keep a 512 MB copy of the dump in site storage.
- The spike reached no battle in SkyEmu and tried no state.

## Speed

The build machine has six shared vCPUs (AMD EPYC), 12 GB of RAM and no GPU; Chromium drew WebGL 2 on the CPU through SwiftShader. Another session ran beside most runs, at a load average of 3 to 10, so take each figure as a floor for this machine. The DS runs at 59.8261 frames per second.

EmulatorJS's melonDS, frames per second over 30 s windows (S2; vsync on, EmulatorJS's default):

| Log                      | Core   | Opening, 1x | Opening, uncapped | Title, 1x | Title, uncapped |
| ------------------------ | ------ | ----------- | ----------------- | --------- | --------------- |
| `gen5-speed-plain.log`   | plain  | 19.4        | 22.6              | 9.7       | 12.3            |
| `gen5-speed-plain-2.log` | plain  | 12.4        | 24.0              | 8.0       | 12.6            |
| `gen5-speed-thread.log`  | thread | 11.2        | 22.7              | 7.3       | 11.1            |

The opening windows start at different frames per run, so only the title columns compare. The title screen draws Black Kyurem in 3D, and the software 3D renderer is the likely cost: one wasm function takes 18 to 19 % of the page's time there and is absent from the opening's top twelve (S2's CPU profiles; an inference). Uncapped means EmulatorJS's fast-forward at ratio 0.

The 1x pace, title screen, plain core (S2b):

| Log                 | 1x, vsync on | 1x, vsync off | Fast-forward at ratio 1.0 | Uncapped |
| ------------------- | ------------ | ------------- | ------------------------- | -------- |
| `gen5-pacing.log`   | 8.7          | 9.9           |                           | 13.0     |
| `gen5-pacing-2.log` |              | 10.7          | 12.2                      | 14.2     |

With vsync on, RetroArch's Emscripten loop runs one core frame per animation frame; with vsync off it runs on `setImmediate` (`platform_emulatorjs.c` in EmulatorJS's RetroArch). Vsync off gains about one frame per second, and the page now starts with it off (`src/gen5/pacing.ts`; `?vsync=1` brings EmulatorJS's default back). The rest of the gap to uncapped stays unexplained after two runs. A guess: uncapped skips presenting frames, and presenting through SwiftShader costs this machine's CPU.

Other runs:

| What                                                                | Frames per second                    | Source                                   |
| ------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| S1's boot runs, opening and title together, vsync on                | 19.4, 15.9, 14.8                     | `gen5-boot.log` to `gen5-boot-3.log`     |
| The built page, 150 s of opening and title, vsync off               | 13.7                                 | S2b, `gen5-built.log`                    |
| The page as served to the user, opening, vsync off, load not logged | 35.1 over 5 s, 30.2 over 19 s        | The integrator's check, `user-check.log` |
| The route from boot, uncapped, a state saved at every mark          | 23.0 (22,670 frames in 984 s)        | S5, `gen5-route-36.log`                  |
| SkyEmu's web build, opening, 1x                                     | About 4.5, by two methods that agree | S3b, `s3b-run2.log`, `s3b-run3.log`      |

So EmulatorJS's melonDS runs at 12 to 18 % of the DS's rate on the title screen at 1x and 19 to 24 % uncapped. SkyEmu's web build ran at about a third of melonDS's opening figures at 1x (4.5 against 11 to 19) under the same load. SkyEmu draws its own interface through software GL on every frame, and the spike measured neither engine on a real GPU.

Calibration: the page reads `navigator.hardwareConcurrency` and counts the turns of a JavaScript loop on one thread for 2 s, so a figure from another device can be set against this machine's. Here: 6 logical cores and 609 to 859 million turns (`gen5-speed-*.log`, `gen5-built.log`, `user-check.log`).

PC and phone (N3): the user has a link to the Gen 5 page, served from the build machine over their private network, with the speed line, the device line and "Copy figures". No figures have come back, so the spike cannot say whether a visitor's device runs Black 2 at real time. In those figures, fps over 60 s near 59.8 means the game ran at the DS's pace; a reload or a blank tab after the pick means the browser ran out of memory, and that is a result too.

## Download size

Bytes of the files a start of the Gen 5 page fetched in S2b's built run (`gen5-built.log`), measured on 24.11.2026 with `scripts/patch-sizes.ts` (Node's zlib, gzip at level 9, brotli at quality 11; S7, `s7-sizes.log`). The page's own files are the build of S2b's sources; the frame hook that S5 and S6 added since is not in it, and adds a few kilobytes.

| Files                                                                                                                                                                                              | Raw           | gzip          | brotli        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------- | ------------- |
| The page: `index.html` and its one script                                                                                                                                                          | 10,708        | 4,812         | 4,195         |
| EmulatorJS `data/src/emulator.js`                                                                                                                                                                  | 341,775       | 64,770        | 52,355        |
| EmulatorJS `data/compression/extract7z.js`                                                                                                                                                         | 280,155       | 73,914        | 61,204        |
| EmulatorJS `data/src/shaders.js`                                                                                                                                                                   | 139,565       | 36,748        | 30,934        |
| EmulatorJS `data/src/socket.io.min.js`                                                                                                                                                             | 46,831        | 14,674        | 13,222        |
| Nine smaller EmulatorJS files: `loader.js`, `emulator.css`, `GameManager.js`, `nipplejs.js`, `localization/en-US.json`, `compression.js`, `gamepad.js`, `storage.js`, `cores/reports/melonds.json` | 107,488       | 24,767        | 21,669        |
| `data/cores/melonds-wasm.data`, the plain core (a 7z archive)                                                                                                                                      | 1,194,723     | 1,195,106     | 1,194,728     |
| **Gen 5 page, plain core**                                                                                                                                                                         | **2,121,245** | **1,414,791** | **1,378,307** |
| `melonds-thread-wasm.data` in place of the plain core                                                                                                                                              | 1,255,844     | 1,256,247     | 1,255,849     |
| **Gen 5 page, thread core**                                                                                                                                                                        | **2,182,366** | **1,475,932** | **1,439,428** |
| SkyEmu's web build: `index.html`, `SkyEmu.js`, `SkyEmu.wasm`                                                                                                                                       | 3,205,379     | 1,286,208     | 1,030,735     |

The core comes packed as 7z, so the host's compression gains nothing on it. A visitor would fetch 1.38 MB with brotli, against the viewer's 14.2 MB for Gen 3 (`docs/wasm-spike.md`); the 512 MB dump comes from the visitor's own disk. Both of the spike's servers send the emulator's files, and the built page's server every file, uncompressed and with `no-store`, so each start fetches the core again.

## Into a battle (question 2)

The routes the plan weighed (plan 1.4):

- (a) An input macro from New Game to the first battle. It needs the dump and nothing else.
- (b) A save file placed before a trainer, plus a short macro. ADR 0002 allows shipping a save file.
- (c) Memory writes after boot that start a battle. Without code of ours this needs a field hook; with injected code it is ADR 0007's fallback.
- (d) A Battle Video from the save, started from the game's menu: route (b) with extra steps.

S5 built route (a) and reached the battle with it in pieces; from boot, the final macro stalls on the way (below). The macro (`src/gen5/route.ts`) names the player "IRV", takes the rival's default name, walks out of the house and through Aspertia City to the lookout, picks Tepig, skips the nickname and follows Hugh into the battle. Most walks go by the player's position in RAM, so a step waits for a tile instead of counting frames. The route ends when the battle checks hold for 60 frames: the player's adapter exists, `sCommMode` reads 0 (a local battle) and the client waits for an action. "What will Tepig do?" and the action menu are then on screen.

| Mark                       | Frame  |
| -------------------------- | ------ |
| Title screen               | 2,504  |
| Name entry                 | 5,620  |
| Outside the house          | 17,218 |
| Beside Hugh at the lookout | 31,796 |
| The battle's opening fade  | 32,544 |
| The battle, action menu    | 33,570 |

33,570 frames are 9 min 21 s of game time at the DS's rate. Uncapped on the build machine, at the 23 frames per second of S5's run from boot, they take about 24 minutes, longer than the 20 minutes one run may take there. So S5 grew and played the route in pieces, each starting from the state of an earlier mark (38 route runs, `gen5-route-1.log` to `gen5-route-38.log`). The macro changed between the pieces, so most states of that chain come from earlier versions of it. The table gives that chain's frames.

Determinism: two runs from boot under the final macro reached all 179 marks up to frame 22,670 on the same frames with the same SHA-256 of main RAM (`gen5-route-36.log`, `gen5-route-37.log`; each stopped at its 17-minute deadline). Two runs from the earlier chain's state at Hugh's trigger (frame 29,486) agreed in every mark's frame, RAM hash and frame image to the end (`gen5-route-35.log`, `gen5-route-38.log`).

The final macro from boot to the battle: S9 ran it from the boot runs' last state, at frame 22,670, toward the battle (`gen5-route-39.log`). The load check held, the hook saw every frame, and every request stayed local. The first walk, north to the lookout's row, did not move the player in 600 frames: IRV stood at (55, 750) beside a man at the trees on the town's east edge, and the run failed at frame 23,270. The boot runs had left the earlier chain at Hugh's greeting. At town-06 (frame 18,342), the mark before the talk, both chains show the same image; from hugh-01 (18,642) on, every mark's image differs. At hugh-03 (19,242) the earlier chain had finished the talk, while the boot runs' A presses had opened it a second time ("You're really lucky to get a Pokémon!"), and the walks after it, which count frames, took IRV elsewhere. So the route reaches the battle only from the earlier chain's states, and the stretch from frame 18,342 to 29,486, the starter pick included, rests on states made under earlier code. The route needs a fix at Hugh's talk before it reaches the battle from boot in one chain.

The core lets the page fix what the route depends on:

- The clock: no core option, but melonDS reads the real-time clock through Emscripten's `Date.now`. The page sets it to noon on 1 January 2000 plus the emulated frames over 59.8261 (`src/gen5/clock.ts`), so the battle's clock showed 12:09.
- The firmware: the core boots on its defaults (name, birthday, language), and two runs agreed with them.
- Input: the page presses buttons through EmulatorJS's `simulateInput` before each emulated frame, frame-exact; no run skipped a frame.

What a visitor brings: the dump, and with route (a) nothing else. The page would build the state in the visitor's browser from the dump and the macro, keep it there (IndexedDB) for the next visit, and start each battle from it. ADR 0002 holds: a state counts as ROM-derived, so no state leaves the visitor's browser and no server hosts one. On a device that runs the DS's pace the first visit costs the 9 min 21 s of the route, less with the speed cap off. Route (b) would shorten that with a shipped save file; the spike did not try it.

## The way in (question 3)

The page writes blocks of the game's own server commands into memory where the battle client reads them, at addresses that pokebw2 gives. It injects no code and changes no file of the game (ADR 0007).

pokebw2 (fuddlesworth/pokebw2, pinned at `345b790e6000869b481b79838bb5727309f832fb`) rebuilds Black 2 and White 2 byte for byte, so its symbols are the retail addresses. `scripts/gen5-bw2.ts` reads a checkout of that commit and writes `build/gen5/bw2.json`: 26 symbols of overlay 167, both command enums, every command's argument format, the message rules, the queue size and the layouts of the structs the page touches, worked out from the C structs. The code reads every address, offset, command number and message number of pokebw2's at run time, from that file or, for a line's number, from the text bank by its label; the specs use invented numbers, and the generator stops on a layout that breaks its rules for the adapter (S8). This document quotes a few of the numbers as the record of what the spike read. A few rules of the game have no number in the file, and the code writes them out, each with its source in pokebw2 named in a comment: `sCommMode` 0 for a local battle and `returned` 0 and 1 (`btl_adapter.c`), and the route's waypoints (`aspertia_city.json`). The addresses the moment depends on:

| Symbol                          | Address    | What it is                                                                                                                         |
| ------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `sAdapters`                     | 0x021DD86C | The four battle adapters, one per client; the page reads the player's from here each time, since the game allocates it on its heap |
| `sCommMode`                     | 0x021DD868 | 0 in a local battle                                                                                                                |
| `BattleServer_ProcSelectAction` | 0x0219E6B0 | The server's step that waits for every client's action                                                                             |
| `BattleClient_ServerCmdLoop`    | 0x021B6E20 | The client's loop that plays a block of server commands                                                                            |
| `sServerCmdTable`               | 0x021D7160 | The client's handler per server command                                                                                            |
| `sCmdFormats`                   | 0x021D6E50 | Each server command's argument format                                                                                              |

The adapter (0xBD0 bytes): `returned` in the low four bits of +0x0C and `isNet` in the high four, `clientId` +0x0D, `state` +0x0E, `cmd` +0x0F, then the command to the client: `sendCmd.cmd` +0x10, `sendCmd.size` +0x12 and `sendCmd.data` +0x14. The first battle's RAM confirmed every offset, the bit order included (S5).

How a block gets in: the client polls its adapter, and while `returned` reads 0 it takes `sendCmd.cmd` and `sendCmd.data`. The page writes the data, the size, `BTL_ACMD_SERVER_CMD` (8) into both command fields, zero into the reply fields, and `returned` = 0 last, so the client never sees half a block. When the client has played the block, it sets `returned` to 1, and the page writes the next one. Inside a block every value goes high byte first, as the game's own queue writes it; the adapter's fields are little-endian. A block holds at most 3,000 bytes, the client's queue.

How the server is held: the page sets the player's adapter `state` to idle (0) before the first block. At the battle's start the server waits in `BattleServer_ProcSelectAction` for every client to reply; that check asks each adapter through `BtlAdapter_WaitCmd`, which has no case for the idle state and answers no. The client never reads `state`, so it takes block after block, and the server stays where it is. The page writes no server field, and the watch showed the server's step and sequence unchanged through both blocks of each run (S6, `gen5-moment-3.log`, `gen5-moment-4.log`).

One moment (`src/gen5/moment.ts`) is five commands: `SC_MOVE_MSG` (the user, the move), `SC_MOVE_ANIM` (the user's position, the target's, the move), `SC_OP_SUBTRACT_HP` or `SC_OP_ADD_HP` (the target, the difference to the given HP), `SC_UPDATE_HP_GAUGE` (the target), and, if the moment has one, `SC_MSG_STD` with a message number. The page reads the current HP from the client's copy of the battle in RAM, so the bar stops at the value given. The first block of the known run held 27 bytes:

```
00 59 00 00 21 · 00 30 00 40 21 00 · 00 01 0c 00 13 · 00 41 0c · 00 5a 00 4e ff ff 00 00
```

That is Tepig (battle mon 0) uses Tackle (33) on Oshawott (battle mon 12), Oshawott loses 19 HP, its bar moves, and standard message 78 ends the block. Move and species numbers come from @pkmn/dex, which the scripts checked against the battle's RAM (Tepig 498, Oshawott 501).

What S6 showed, in two runs from the battle's state: the client took two blocks one after the other with no button press between, and Black 2 played each with its line, its animation and its bar. A block took 271 to 486 frames, 4.5 to 8.1 s at the DS's rate, by the move's animation. The moves need the battle scene's animation setting as the game has it now; both runs animated. Writing an adapter command `SELECT_ACTION` afterwards brought the action menu back. Before the menu, the client played Hugh's own line "I won't forget the pain you just put my partner through!": the client shows a trainer's hint line once by the opponent's HP when the player selects an action (`CheckTrainerHintMsg`). A replay needs no menu, so a backend would not send `SELECT_ACTION`.

Injected code stays the fallback (ADR 0007), for what memory writes cannot reach. Nothing in the spike needed it.

## Battle text (question 4)

`btl_string.c` loads nine message files from the system message archive for a battle: banks 19 (standard lines), 18 (set lines, with variants for the player's, a wild and the foe's Pokémon), 16 (move lines), 20, ability names, move learning, yes and no, and the trainer lines of the Battle Subway and the PWT. The client prints a line from a message number plus its arguments, and the page picks a line the same way:

- `SC_MOVE_MSG` prints "X used Y!" from bank 16, message move × 3 plus a variant (0 the player's, 1 wild, 2 the foe's). S6 showed "Tepig used Tackle!" and "The foe's Oshawott used Tackle!".
- `SC_MSG_STD` prints a line of bank 19 by its number and fills its placeholders from the words after it. S6 found number 78 by its label in pokebw2's text bank, `Bank0019_Text_ItsSuperEffective`, and the game printed "It's super effective!".
- `SC_MSG_SET` prints a line of bank 18, its number plus the variant of the Pokémon in its first argument. Untried.

So a backend picks a line by its label in the pinned sources, as Gen 3's backend checks its wording against the pinned expansion. Lines that Black 2 has no message for (Showdown's own messages, clauses, forfeits, effects of later generations) need finished text, as ADR 0005 says. How finished text reaches the screen stays open. showdown-bw2's README says it writes longer lines over lines it does not show; the spike did not try that, and injected code is the other route.

## Checks (question 5)

The spike checked every frame with headless Chromium on the page itself: `scripts/gen5-shot.ts` and its scenes run the server and Playwright's Chromium in one process and save the core's own screenshot (a PNG from `gameManager.screenshot()`, no WebGL readback) next to a log of frames, requests and memory. S5's route and S6's moment ran this way, and the integrator looked at the frames.

SkyEmu's headless control server would have served as the check tool that mGBA is for Gen 3, but its v5 builds abort before the server binds (skylersaleh/SkyEmu#576). Untried, each needing an install, a build or a fix upstream: SkyEmu's windowed mode under `xvfb-run` with its control server turned on, SkyEmu built from source without asserts, a fixed SkyEmu release, desmume-cli 0.9.13 (no scripting) and melonDS 1.1 under `xvfb-run` (no scripting, a GDB stub only). The spike recommends headless Chromium with the core's screenshot. Its cost: a check starts from a state of the battle, since the route takes about 24 minutes here; states stay on the build machine.

## The dumps

pokebw2's README expects Black 2 (USA, Europe) with SHA1 `e51e6dfb8678a3d19dcd2a10691b96a569ca0abb`, which TASVideos lists as the good dump. The spike ran on a dump that carries Black 2 (USA)'s header (game code `IREO`, ROM version 0, 536,870,912 bytes). Its DS code matches the retail code at every point checked. Its DSi area is all 0xFF, as a dumper in DS mode leaves it, so its SHA1 differs from the one pokebw2 expects.

That dump suffices for DS mode: DS mode never loads the DSi area, and pokebw2's addresses describe its DS code. The page refuses any other game code or version. DSi mode and a later ROM built from pokebw2 (roadmap step 8) would need the good dump.

## Licences

Each claim names its source.

| Component                                                                                                                                       | How the spike used it                                                                                                | Licence                                                                                         | Source                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| EmulatorJS 4.2.3 (`@emulatorjs/emulatorjs`)                                                                                                     | Served to the page from the build machine                                                                            | GPL-3.0                                                                                         | The package's `LICENSE` and its `package.json`; GitHub's API for EmulatorJS/EmulatorJS                                           |
| Socket.IO client 4.8.1, inside EmulatorJS                                                                                                       | Served                                                                                                               | MIT                                                                                             | The header of `data/src/socket.io.min.js`                                                                                        |
| `nipplejs.js` and `extract7z.js`, inside EmulatorJS                                                                                             | Served                                                                                                               | None named in the files or in `data/compression/README.md`                                      | The files                                                                                                                        |
| EmulatorJS's melonDS (`@emulatorjs/core-melonds` 4.2.3, built 2025-06-14)                                                                       | Served inside the core                                                                                               | GPL-3.0                                                                                         | GitHub's API and `LICENSE` of EmulatorJS/melonDS. The npm package ships no licence file; its `license` field reads "LICENSE"     |
| EmulatorJS's RetroArch, the frontend the core is built with                                                                                     | Served inside the core                                                                                               | GPL-3.0                                                                                         | GitHub's API for EmulatorJS/RetroArch                                                                                            |
| DraStic's FreeBIOS in EmulatorJS's melonDS (`freebios/`)                                                                                        | The core's fallback when no BIOS is given                                                                            | BSD 2-clause                                                                                    | `freebios/drastic_bios_readme.txt`                                                                                               |
| SkyEmu (web build adacd078; v5 Linux release)                                                                                                   | Served on the build machine in S3b; run as the Linux binary in S3                                                    | MIT                                                                                             | `LICENSE` ("Copyright (c) 2021 Skyler "Sky" Saleh"); GitHub's API                                                                |
| DraStic's FreeBIOS in SkyEmu (`src/freebios/`)                                                                                                  | SkyEmu's fallback; the console showed it boot without BIOS files                                                     | BSD 2-clause                                                                                    | `src/freebios/drastic_bios_readme.txt`                                                                                           |
| Cult-of-GBA BIOS in SkyEmu (`src/gba_bios.h`)                                                                                                   | SkyEmu's GBA BIOS replacement, inside the web build served in S3b                                                    | MIT                                                                                             | The header comment of `src/gba_bios.h` (authors DenSinH, Fleroviux, Sky)                                                         |
| SkyEmu's DS ROM database                                                                                                                        | Inside SkyEmu                                                                                                        | MIT, relicensed from melonDS's GPL code by the melonDS team                                     | The header of `src/nds_rom_database.h`                                                                                           |
| SkyEmu's third-party folders (SDL2, cimgui, rcheevos, capstone, utf8proc, curl, OpenSSL, sokol-tools)                                           | Inside SkyEmu, as far as the web build links them                                                                    | Each folder's own licence file; which of them the web build links is unchecked                  | The folders' licence files                                                                                                       |
| pokebw2 at `345b790e`                                                                                                                           | Read at run time from a checkout in `.cache/gen5/`; numbers generated into `build/gen5/bw2.json`; nothing committed  | GPL-3.0                                                                                         | GitHub's API; the README                                                                                                         |
| swan, the names pokebw2 uses                                                                                                                    | Through pokebw2                                                                                                      | GPL-3.0                                                                                         | GitHub's API for ds-pokemon-hacking/swan                                                                                         |
| showdown-bw2                                                                                                                                    | Read through its README only, as a reference (ADR 0006)                                                              | GPL-3.0                                                                                         | GitHub's API for LuciPengu/showdown-bw2                                                                                          |
| @pkmn/dex 0.11.0                                                                                                                                | Move and species numbers in the moment's scripts                                                                     | MIT                                                                                             | Its `package.json`                                                                                                               |
| Development tools of the repository: Playwright 1.65.1 (`@playwright/test`), the Chromium headless shell it installs (159.0.8154.6), Vite 8.3.8 | Playwright and Chromium ran every check on the build machine; Vite served the Gen 5 page in development and built it | Playwright Apache-2.0; Chromium BSD 3-clause, followed by its third parties' licences; Vite MIT | Playwright's `package.json` and `LICENSE`; the headless shell's `LICENSE.headless_shell`; Vite's `package.json` and `LICENSE.md` |

### The GPL question for a public page (N2)

The facts: EmulatorJS, its RetroArch and its melonDS are GPL-3.0. Serving them to visitors conveys them, which needs the GPL's text and the corresponding source of every file served, at the exact versions, under either reading below. The spike served them only on the build machine and over the user's private network to the user's own devices. The repository stays MIT; MIT is compatible with the GPL, as ADR 0007 reasons for a ROM built from pokebw2.

Two readings of what the Gen 5 page is:

- (a) One program. The page reaches into the emulator's heap, writes the game's memory, and drives its frames and input from the same tab. Read that way, the page and the emulator form one work, and the served page as a whole goes out under GPL-3.0's terms. Our code keeps its MIT licence in the repository, and the page names the GPL and offers the source, ours included, which the public repository already holds.
- (b) Two programs side by side. The page uses EmulatorJS's published JavaScript calls and reads memory as data, and the two form an aggregate. Read that way, only the emulator's files carry GPL duties.

The second route avoids the question: SkyEmu is MIT, and its web build runs Black 2 to the title screen. Its costs as measured: about a third of melonDS's speed on this machine; memory access shown by search only, with two candidate bases and no write proof; no battle, no server hold and no state tried. A page of our own around SkyEmu would also need SkyEmu built from source with the calls it needs exported, since the deployed build exports none for memory or states.

The spike recommends route one, EmulatorJS's melonDS, with the Gen 5 page served under reading (a): everything the spike proved runs on it, and reading (a) costs a notice and a source offer beside a public MIT repository. A choice of SkyEmu would first need a speed figure of both emulators on a real GPU, SkyEmu's write proof, and one moment of a battle in it. The call belongs to the user at the gate.

## pokebw2's numbers in CI

The user's answer to question 7 (24.11.2026, #77): commit none of pokebw2's numbers. CI fetches pokebw2 at its pin before the check, at depth 1, with no blob fetched before the checkout and a sparse tree of exactly the files in `POKEBW2_FILES` (`scripts/gen5-bw2-source.ts`). `node scripts/gen5-bw2.ts --quiet` then generates `build/gen5/bw2.json`. Its report gives the pin, the fetch time, counts and its two checks, and no address, offset or value, because the log is public. `scripts/gen5-bw2-real.test.ts` runs the Gen 5 code on the real numbers and asserts names and truth values only. On a machine without the file the spec skips; under CI its guard fails.

When the fetch fails, the generator step fails with git's message. The check still runs, so lint and types report as usual, and the guard turns the job red. Nothing falls back to invented numbers. A committed table goes to a gate on either trigger: CI cannot fetch the pin on two runs at least a day apart, or the fetch and the generator add more than 30 s to the check job, the median of five runs against the five before.

## What a Gen 5 backend needs next

- A writer of server commands per turn of a battle script, from the moment's shape: `SC_DAMAGE` for the hit flash, faints, switches, status, weather and the set lines of bank 18, each with its handler's arguments read from pokebw2.
- The HP rule from the battle log's percentages to the game's HP. Gen 3's rule lives in `src/gen3/translate/scale.ts` and would move to one shared module first.
- A start for each battle: the route's state, built in the visitor's browser once the route reaches the battle from boot, or a save file (route (b)), and the server held through the adapter's state from the first action selection.
- The teams: the spike played the rival's battle with the game's own Pokémon. How a replay's teams reach the battle (the parties before the battle starts, or the client's copies and the view's sprites after) is untried; S6 generated the layouts of `BattleParty` and `BattleMonCore` for it.
- A pace for the blocks: a block took 4.5 to 8.1 s at the DS's rate, and the page waits for `returned` before the next.

## Open questions for the gate

Each is one issue proposal.

1. **The GPL question for a public page (N2).** Weight: blocks a public Gen 5 page; a backend's work can start without it. Options in "Licences" above; the spike recommends EmulatorJS's melonDS under reading (a). It also settles whether EmulatorJS may join `package.json`, which the spike avoided with its own fetch (W5-11).
2. **The clean dump (N1).** pokebw2 expects SHA1 `e51e6dfb8678a3d19dcd2a10691b96a569ca0abb`; the dump the spike ran on does not match it. Weight: none for milestone 6 in DS mode; needed for DSi mode and a ROM built from pokebw2 (roadmap step 8). Dumping it needs a DSi or a 3DS.
3. **The opening before the first battle (N4).** The route takes 9 min 21 s at the DS's pace on a visitor's first visit, about 24 min uncapped on the build machine, and from boot it first needs its fix at Hugh's talk (S9). Options: keep the route and keep its state in the visitor's browser; ship a save file before a trainer (ADR 0002 allows it); or both, the save file first. Whichever route: no state leaves the visitor's browser (ADR 0002). Weight: decides the first visit's wait.
4. **Speed on a PC and a phone (N3).** The user has the link; the figures are open. Weight: decides whether a browser route exists for visitors at all, and whether the phone keeps the 2 GB tab.
5. **The trainer's hint line.** The client shows a trainer's line once by the opponent's HP before an action menu. A backend that sends no action selection never meets it; a backend that does must expect it. Weight: small; one ruling and one spec.
6. **The lint zone and coverage threshold for `src/gen5/`.** `eslint.config.js` and `vitest.config.ts` do not name it yet, so only review keeps it free of DOM and Node imports (W5-15). Weight: small; two lines in shared files when the backend starts.
7. **pokebw2's numbers in the repository.** The spike generates them at run time and commits none (W5-13). AGENTS.md wants a target game's numbers generated from its pinned sources and checked by a spec; for a GPL-3.0 source the gate decides whether a generated table may be committed. The same ruling covers the few rules the code writes out with their pokebw2 source in a comment ("The way in"): `sCommMode` 0 and `returned` 0 and 1, the two clients of a single battle and the route's waypoints. It also covers the line rule of bank 16 in the moment script's log, which names no source, and the route's two heap addresses, which come from comparing states ("Rests"). Weight: decides how the backend's specs run in CI, where no checkout of pokebw2 exists.

## Rests

- The 1x gap: vsync off runs about 10 frames per second on the title screen against 13 to 14 uncapped, unexplained. Whether RetroArch's audio sync holds a fast device at 1x with vsync off is untested here; the user's 60 s figure answers it.
- Nobody measured the thread core with vsync off.
- The route from boot stalls at frame 23,270, before the lookout: a second talk with Hugh, on screen at frame 19,242, sends the walks after it elsewhere (S9, `gen5-route-39.log`). The battle state that S6 started from belongs to the chain built under earlier versions of the macro.
- The route walks by two heap addresses for the player's position (0x0223E4DA and 0x0223E4DE), found by comparing states and not from pokebw2's symbols. They held in every run.
- The FreeBIOS fallback of EmulatorJS's melonDS is read from its source; its log line never reached the browser.
- SkyEmu: which of the two RAM bases is live, its own "Emulation FPS" counter, its uncapped speed, and the white screen after five minutes on the title (likely the opening's loop) stay open.
- The watch in S6 logs only while a macro step waits, so the client's answer shows as the end frame of that step.
- `docs/plan.md`'s roadmap step 6 still lists the emulator and the save-file route as open; the gate's answers will settle both.
