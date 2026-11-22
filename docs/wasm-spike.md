# The WebAssembly spike (#35)

Milestone 1b asked one question: can the pinned pokeemerald-expansion, with our C files, run in the browser as WebAssembly instead of inside mGBA? The spike ran in wave 3, lane b, from 21 to 22 November 2026: nine builder steps of a ten-step box, a review, and two fix steps for its findings. This page records what it found. Whether milestone 2 ships the WebAssembly build is the gate's call.

## Verdict

The spike works. The WebAssembly build of the pinned expansion with our C files plays the hand-made stream at 1x and 994052 at fast from boot to END in Chromium on devbox, with sound. In the Node harness its frames pass the same 13 scenes as mGBA's, and in Chromium it reaches END at the same frames as in Node. In Chromium it runs about as fast as mGBA's page at fast-forward, and compressed it downloads 0.8 MB less.

Two things stand between it and a public build. The borrowed platform layer has no licence, so a public build needs a layer of our own or one built partly on mGBA's MPL-2.0 code: four to seven builder steps. And the module patch carries the expansion's new and recompressed assets, as the ROM patch does today; the gate rules whether that holds for the module too.

## What the build is

- Emscripten 7.0.0 (pinned in `rom/gen3/wasm/wasm.json`, installed under `~/tools/emsdk`) compiles 390 C files: 384 tree files, our replay files among them and six from patched copies, plus the six borrowed platform files. All 390 compile at `-O2`. The census before any fix had 373 of 395 passing. It applies no overlay patch, so it still counts the files that one fixes, `random.c` among them, as failing.
- The 544 data objects that the ROM build assembles with ARM `as` (battle scripts, animation scripts, event scripts, songs) go through a converter (`scripts/wasm-convert.ts`). It reads each ARM ELF object and writes LLVM's WebAssembly assembly with the same bytes and relocations. All 544 assemble.
- The GBA's addresses map one to one into linear memory: EWRAM at 0x02000000, IO at 0x04000000, VRAM at 0x06000000, static data from 0x08000000, where the ROM would sit. The memory is a fixed 256 MB.
- The platform layer, borrowed from pokeemerald-multiplatform at db1cab3d, stands in for the hardware: the BIOS calls (`bios.c`), DMA (`dma.c`), a scanline renderer (`gba_easy_draw.c`) and the sound (`sound_mixer.c`, `music_player.c`, `cgb_audio.c`). `npm run wasm:build` fetches it into `.cache/wasm/platform/`; git never sees it.
- Our glue (`rom/gen3/wasm/src/`, six files, 719 lines) blocks in `VBlankIntrWait`, draws the frame, raises the interrupts, and hands each frame and its sound to JavaScript. It also stubs flash, the clock, the link cable and multiboot, and its compile checks the offset and size of every field that the port's sound structs share with the expansion's.
- The page (`src/web/wasm.html`) rebuilds the module from your dump with a BPS patch, the way the emulator page rebuilds the ROM. A worker runs the game, the page allows its frames at 1x, 2x or fast, and an audio worklet plays its sound.

## What works

### Graphics

All 13 scenes of `rom:shots` pass in the Node harness (`npm run wasm:run`) on hand-made and on 994052, with the same probes and thresholds as on mGBA, and both refusals show their colour. After the two drawing fixes below, the scene frames of `send-outs`, `level`, `first-hp`, `first-status` and most others match mGBA's to the pixel. The frames that still differ were taken mid-animation, where the two engines stand a few frames apart (see Timing).

The renderer covers text and affine backgrounds, sprites, windows, blending, brightness and mosaic. No scene compares mosaic or affine sprites with mGBA.

### Sound

Sound plays. The module mixes 704 left and right pairs per frame at 42048 Hz, the expansion's own top rate, in Node and in Chromium. In Chromium the worker writes 1.001 of the mixer's rate into the audio ring at 1x, and the worklet reads 0.976 (B7's e2e; at 2x 0.999 and 0.969). At 2x the page plays the game's sound at double pace and pitch; at fast it stays silent.

In B6 the worklet read about 3 % slower than the worker wrote (0.962 against 0.992); in B7's two e2e runs the gap was 2.5 % on the dev server and none on the preview (0.998 against 0.997), each over one 5 s window. B6 suspects the clock of headless Chromium's fake output; nobody measured a real output. At B6's gap the ring filled in about half a minute, and from then on every push dropped the tail of a frame.

The worklet now caps the ring's latency at 0.2 s. When more waits, it skips the oldest samples down to 0.1 s in whole left and right pairs and counts them. It also counts its underruns, the output frames that found the ring empty once the sound had started. The test hook reports both, and the e2e asserts the worker's pace and reports the worklet's. The ring's counters wrap at 2^32, so a run that plays on for hours keeps its sound.

### Timing

The page ticks at the GBA's 59.7275 frames per second. The e2e measures 1x within 5 % of that and 2x within 5 % of twice that. Fast runs the worker as fast as it goes, and at END the page leaves fast for 1x, so no core spins while the game plays on after the replay. A hidden tab gets no animation frame, so the game pauses there at 1x and 2x; back in view, it goes on from where it paused. The tick clock counts any gap of more than 250 ms as such a pause.

### Input

The viewer presses no key, and neither page passes one to the game: mGBA's page turns input off (`toggleInput(false)`), and the module's glue sets `REG_KEYINPUT` to all keys up once at start (`irv_wasm_layout.c`). A zero there would read as every key held, and A, B, Start and Select held together make the game soft-reset.

A held B would end the replay in both builds: the replay plays as a recorded battle, and `BattleMainCB2` (`src/battle_main.c:1739`) quits a recorded battle's playback on B when `RecordedBattle_CanStopPlayback()` allows it. A or B also speed up the battle text (`src/text.c:1338-1344`). Leaving a replay with B, or live play (roadmap 7), needs the page to write the keys it reads to 0x04000130 before each frame.

## Frames to END

| Stream                        | WebAssembly, Node | mGBA, headless    | WebAssembly before sound (B4) |
| ----------------------------- | ----------------- | ----------------- | ----------------------------- |
| hand-made (34 ops)            | 2916              | 2910              | 2876                          |
| 994052 (461 ops)              | 39637             | 39630             | 38942                         |
| refusals (`EMPTY`, `VERSION`) | error at frame 31 | error at frame 44 | 31                            |

Each engine ran both streams twice in B7, interleaved, and each pair of runs gave the same frames. The page in Chromium reaches END at the same frames as the Node harness (2916 for hand-made, 39637 for 994052), so both hosts play the same game.

Three things move the counts:

- Boot. mGBA spends 13 frames before the game's first frame, which the module skips: it calls `AgbMain` straight away. The refusals show it (44 against 31).
- The silent stubs before B6. Until the module had sound, every cry and fanfare that the game waits for ended at once, and in B4 994052 reached END 767 frames before mGBA. With the mixer in, the module ends 7 frames after mGBA.
- VBlank overruns. On the GBA a frame whose work runs past the next VBlank misses it and takes two. The module's work takes no display time, so its frames never overrun, which would let it finish earlier. After the 13 boot frames, the module still takes about 20 frames more than mGBA on both streams. So mGBA's overruns cost it fewer frames than something else costs the module, the mixer's timing of the cry waits being the first candidate. The spike did not measure the split.

mGBA itself varies between sessions on the same ROM: 994052 reached END at frame 39709 in B4 and 39734 in fix step 6, against 39630 in both runs of B7, and hand-made at 2947 in fix step 6 against 2910. That spread of 104 frames is larger than the gap between the engines. mGBA reads the host's clock for the cartridge's real-time clock, while the module's clock stays at 2000-01-01 12:00; that is the first suspect, unmeasured.

## Speed

Wall-clock numbers on devbox are rough: its six cores are slow and shared, and another session ran beside some of these runs.

| Host     | Engine                                                  | 994052 to its stop                                                        | Frames per second                 |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Node 24  | WebAssembly at `-O2` (`wasm:run`)                       | 106.6 s and 110.0 s                                                       | 366 to 377                        |
| native   | mGBA headless (`rom:shots`, frames taken at the scenes) | 40.3 s and 43.1 s                                                         | 933 to 998                        |
| Chromium | WebAssembly page at fast                                | 116.0 s on the dev server and 120.1 s on the preview in B7, 113.8 s in B6 | 330 to 348, averaged over the run |
| Chromium | mGBA page at fast-forward                               | 10 s windows at multipliers 16 to 256 (two runs)                          | 243 to 314; 60.0 and 60.2 at 1x   |

At 1x the module needs about a sixth of one core on devbox. Native mGBA runs about 2.6 times faster than the module in Node. In Chromium the gap closes: mGBA's own WebAssembly build tops out at about 314 frames per second, with the multiplier at 64 or 256, and the module plays 994052 at 330 to 348 on average. The numbers measure different stretches. Each of mGBA's windows covers the 10 s of the battle it fell on, while the module's numbers average the whole run, so call the two engines even in the browser.

The mGBA probe (`e2e/wasm-spike.spec.ts`, its second test) plays 994052 on the emulator page and sets mGBA's fast-forward multiplier to 1, 4, 16 and 64 in a first run and 1, 16, 64 and 256 in a second, counting frames for 10 s at each through mGBA's end-of-frame callback. The page keeps mGBA's module to itself, so the probe wraps the package's default export as the browser loads it; the page's code stays as it is.

## Download size

Bytes, with gzip at level 9 and brotli at quality 11 from Node's zlib:

| File                                  | Raw            | gzip           | brotli         |
| ------------------------------------- | -------------- | -------------- | -------------- |
| `irv-emerald-wasm.bps` (module patch) | 20,975,133     | 15,602,741     | 14,184,412     |
| `irv-emerald.js` (Emscripten's glue)  | 8,458          | 3,094          | 2,803          |
| **WebAssembly page**                  | **20,983,591** | **15,605,835** | **14,187,215** |
| `mgba.wasm`                           | 1,852,041      | 597,591        | 463,184        |
| `mgba.js`                             | 248,854        | 57,127         | 48,706         |
| `irv-emerald.bps` (ROM patch)         | 18,388,891     | 15,757,973     | 14,486,382     |
| **Emulator page**                     | **20,489,786** | **16,412,691** | **14,998,272** |

Raw, the WebAssembly page fetches 0.49 MB more. Compressed, it fetches 0.81 MB less with either method. The dev server sends both pages' files uncompressed; a real host picks the encoding (M2).

The module patch copies 5,815,654 of the module's 25,977,607 bytes (22.4 %) from the dump and carries 20,143,807 bytes as literals. For comparison, the ROM patch copies 8,069,773 of the ROM's 33,554,432 bytes (24.0 %) from the dump (the BPS actions SourceRead and SourceCopy, counted in both patches).

The module itself, `irv-emerald.wasm` (25,977,607 bytes), never leaves devbox: the server answers 404 for it, and the page rebuilds it from the dump.

## What it means for the speed options and for #17

#35 also asks where the speed options go, mGBA's fast-forward or our own frame loop, and how #17, the patch size, gets solved.

The speed options go into our own frame loop if milestone 2 ships the module. The page already grants the worker its frames by the tick rule (`src/web/wasm/protocol.ts`), so 1x, 2x and fast are one factor each, the sound follows at 1x and 2x, and fast gives way to 1x at END. If milestone 2 keeps mGBA, the options go to mGBA's fast-forward multiplier instead. In Chromium that tops out near 314 frames per second, where the module's fast averages 330 to 348.

The module does not solve #17. Its patch is 20.98 MB raw and 14.18 MB with brotli, against 18.39 MB and 14.49 MB for the ROM patch. Each copies under a quarter of its bytes from the dump and carries the rest itself. A visitor fetches 0.81 MB less on the WebAssembly page with either compression, and the host's compression saves more than the switch: brotli takes 3.90 MB off the ROM patch. Per-asset extraction (below, "Nintendo's assets from the dump") is the one lever the spike found that shrinks the module patch itself, by the retail assets the expansion recompresses. The expansion's new assets stay in the patch on either route.

## Patches, shadow headers and flags

Every change against upstream sits in our tree as a patch, a shadow header or a per-file flag. The ROM build sees none of them and stays byte for byte the same (ROM SHA1 779ba38d… before and after).

| Kind                                               | Count        | What                                                                                                                                                                                     |
| -------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlay patch (`rom/gen3/wasm/patches/`)           | 9            | 122 added and 5 removed lines against copies of `script.c` (2), `decompress.c`, `m4a.c` (2), `bg.c`, `text.c`, `random.c` and `include/gba/m4a_internal.h`, each under `IRV_WASM`        |
| Platform patch (`rom/gen3/wasm/platform-patches/`) | 4            | 9 added and 15 removed lines against copies of `bios.c`, `include/platform/dma.h`, `gba_easy_draw.c` and `cgb_audio.c`                                                                   |
| Shadow header (`rom/gen3/wasm/include/`)           | 5            | `global.h`, `limits.h`, `gba/syscall.h`, `gba/macro.h`, `gba/m4a_internal.h`; each includes upstream's and adds defines, and `global.h` the includes and types the platform files expect |
| Own header                                         | 1            | `irv_wasm_sound.h` (the mixer rate, the sound entry points `m4a.c` calls)                                                                                                                |
| Per-file define or flag (`wasm.json`)              | 2 on 2 files | `recorded_battle.c` (1 define), `ow_abilities.c` (1 compiler flag)                                                                                                                       |
| Excluded file                                      | 11           | flash, real-time clock, link cable (RFU), multiboot, the debug printer; the glue stubs their functions                                                                                   |
| Our own header changed for both builds             | 1            | `struct ReplayProgress` gets explicit padding                                                                                                                                            |

The plan's stop rule allowed 15 overlay patches; the spike used 9.

## Bugs the port found

Each one passed on the GBA and broke the module; each fix stays inside the WebAssembly build.

- **Struct layout.** The GBA build compiles with `-mabi=apcs-gnu`, which rounds a struct's size and alignment up to 4. wasm32 aligns each member by its own size. Our `struct ReplayProgress` came out 10 bytes under wasm32 against 12 on the GBA, and its size assert stopped 12 files. Explicit padding (`u8 padding[3]`) gives 12 on both; the ROM stayed the same. A probe of 159 structs found 35 that differ, none of them in the ARM data the converter carries. The save blocks shrink, so a save from the module would not load on a GBA, and the module turns off the one save size assert the battle reaches (`recorded_battle.c`).
- **The tilemap check in `bg.c`.** `IsTileMapOutsideWram` counts every buffer above IWRAM's end as VRAM. In the module the heap and static data sit above 0x08000000, so every background's tilemap buffer counted as outside, and the copy and fill functions skipped their writes. The text box and every window on BG0 stayed black. Patch 0005 counts only the range between IWRAM's end and 0x08000000 as outside.
- **The shift by 32 in `text.c`.** `GLYPH_COPY` computes `(1 << 32) - 1` for an 8-pixel glyph column and shifts right by 32 when a glyph starts on a tile's edge. The GBA's shift by a register gives 0 for a count of 32; WebAssembly's `i32.shl` and `i32.shr_u` take the count modulo 32. The healthbox lost its "Lv" glyph, and the first letter of each name showed a second time 8 pixels to its right. Patch 0006 gives what the GBA gives.
- **Function-pointer traps.** A WebAssembly function pointer is an index into a table, and `call_indirect` checks the callee's type. Three cases came up. `m4aSoundInit` calls jump table entry 35 (`SoundMainBTM`) with one argument, and the first stub took none: a signature trap, fixed in the glue's table. `decompress.c` copies its ARM decoders, the bytes between two function addresses, into a stack buffer and calls the buffer: "table index is out of bounds" at the battle's first load, fixed by patch 0003. `event_scripts.s` marks an effect command as `func + ROM_SIZE`, and a table index carries no addend: the converter refuses that by name, and patch 0002 looks the functions up in a list instead.
- **The VCOUNT wait.** `SampleFreqSet` in `m4a.c` waits until the display reaches line 159. In the module VCOUNT moves only inside `VBlankIntrWait`, so the game hung in `m4aSoundInit` before its first frame. Patch 0004 drops the wait.

- **The rename that renamed the callers.** `random.c` writes `Random32` as Thumb assembly in a naked function, which clang cannot compile for wasm32. The first build renamed it with `-DRandom32=IrvWasm_UnusedRandom32` and emptied its body, so that the glue's C `Random32` would serve every call. A `-D` rename also renames the file's own calls, the inline `Random()` among them. `RandomUniform` and the other helpers of `random.c` reached the empty copy: `RandomUniform` always returned its lower bound, and `AdvanceRandom`, called once per frame, never stepped the RNG. The review found it in the compiled object. Patch 0009 leaves the naked function out under `IRV_WASM`, the rename and the emptied body are gone, and the helpers call the glue's `Random32`. `wasm-config.ts` now refuses a define that renames a name.

Smaller ones: `script.c` breaks out of its effect analysis with `__builtin_setjmp`, which clang refuses on wasm32 (patch 0001, libc's `setjmp`); `REG_DISPCNT` must start in forced blank as the BIOS leaves it, or the first DISPSTAT write stays buffered and VBlank never fires.

### The class nothing warns about

A shift by 32 or more is undefined in C. The GBA gives 0, WebAssembly gives the shift by the count modulo 32, and neither gcc nor clang warns when the count is a variable. Patch 0006 fixes the one case that a scene showed. Others may sit on paths no scene reaches. One full compile with `-fsanitize=shift` and a trap or a log would list every case the battle path hits; that is a rest.

## Licences

Each claim names its source. "No licence" means GitHub's API reports none and no licence file exists, so the code is all rights reserved by its authors.

- **pokeemerald-expansion** (rh-hideout): no licence. `gh api repos/rh-hideout/pokeemerald-expansion --jq .license` gives null. The ROM patch already carries its compiled code; ADR 0002 and 0007 hold that posture.
- **pret/pokeemerald**: no licence (`gh api repos/pret/pokeemerald --jq .license`: null).
- **Kurausukun/pokeemerald**, branch `pc_port` (11658255, 22.08.2026): no licence (`--jq .license`: null; the contents API answers 404 for `LICENSE` on `pc_port`). That branch already holds all six borrowed files: `src/platform/bios.c`, `dma.c`, `gba_easy_draw.c`, `cgb_audio.c`, `src/sound_mixer.c` and `src/music_player.c` (`gh api repos/Kurausukun/pokeemerald/contents/<file>?ref=pc_port`).
- **pokeemerald-multiplatform** (gradenGnostic, db1cab3d): its `LICENSE` is an MIT text that grants rights only to "the original multiplatform-port modifications contributed through this fork". Its Scope section adds that it "does not grant rights to, or relicense: The upstream pokeemerald decompilation or contributions from its authors". GitHub reports `NOASSERTION`. The README credits "the existing pokeemerald PC/SDL port work by Kurausukun, NT_x86, Normmatt, camthesaxman and other contributors". So the MIT grant covers the fork's own changes to the six files, its audio fixes among them, and not the files as such. The three sound files share that unlicensed lineage.
- **VBA-M**: `bios.c` says "BIOS function implementations are based on the VBA-M source code." (line 2 at db1cab3d; line 4 of Kurausukun's copy). VBA-M's `LICENSE` is the GNU General Public License, version 2 of June 1991, and GitHub reports `GPL-2.0` (visualboyadvance-m/visualboyadvance-m at 05cf257a, 21.11.2026). The line names no function and no version of VBA-M. If `bios.c` copies VBA-M's code, GPL-2.0 terms reach it on top of the missing licence.
- **Our platform patches** carry 15 removed lines and 30 context lines of the borrowed files: 45 lines of unlicensed text in our tracked tree, `bios.c`'s ten memory arrays among them. Five added lines are borrowed lines with a cast added; with them the count is 50.
- **Emscripten 7.0.0**: its `LICENSE` offers the MIT license and the University of Illinois/NCSA Open Source License. The glue `irv-emerald.js` is Emscripten's runtime.
- **Linked into the module** from Emscripten's system libraries: musl's formatted printing and stdio writers (`printf_core`, `__fwritex`, `puts` and a few more), MIT by musl's `COPYRIGHT` ("musl as a whole is licensed under the following standard MIT license"), and Emscripten's `setjmp`, `longjmp` and stack helpers from `system/lib/libemcc`, MIT and NCSA by their headers. The module keeps its function names (`--profiling-funcs`), and `llvm-nm` lists no libc++ function, no allocator and no compiler-rt arithmetic: of the libraries the plan expected, compiler-rt (Apache-2.0 with LLVM exceptions, its `LICENSE.TXT`) and libc++ do not reach the module.
- **mGBA** (the emulator the page runs today, and a source for a clean layer): MPL-2.0 (`gh api repos/mgba-emu/mgba --jq .license.spdx_id`; the header of `src/gba/bios.c`). `@thenick775/mgba-wasm` builds from thenick775/mgba, MPL-2.0 as well.

## What shipping would need

Two questions stand between the spike and a public build (plan D5 and D7). Each has options with a cost in builder steps.

### A platform layer we may ship

The module patch holds the borrowed files compiled. No licence allows us to serve them, and `bios.c` adds the VBA-M question.

- **(a) Keep the borrowed layer.** It works today, but it ships code nobody licensed to us. Only a licence from the pc_port authors (Kurausukun, NT_x86, Normmatt, camthesaxman and others) would change that. Cost: no steps, a request with an open answer.
- **(b) Our own layer, MIT.** BIOS calls (about ten: CpuSet, CpuFastSet, LZ77 and RL decompression, BgAffineSet, ObjAffineSet, Div, Sqrt, ArcTan2) and DMA from GBATEK's descriptions; a scanline renderer for text and affine backgrounds, sprites, windows, blending and mosaic; an MP2K sequencer, a PCM mixer and the PSG channels. The spike's glue keeps the entry points (`DrawFrame`, `RunDMAs`, the BIOS names, `SoundMain` and the `ply_*` table), so a swap stays local, and `wasm:run` with its 13 scenes and a pixel diff against mGBA tests each piece. Cost: BIOS and DMA one step, the renderer two or three, sound two or three: five to seven steps.
- **(c) mGBA's code for graphics and the BIOS, our own sound.** mGBA's software renderer (`src/gba/renderers/video-software.c`, `software-bg.c`, `software-obj.c`) and its high-level BIOS (`src/gba/bios.c`) are MPL-2.0: we would ship those files under MPL-2.0 with their source, beside our MIT code. They expect mGBA's own structs (`struct GBA`, `struct GBAVideo`), so an adapter is needed. mGBA emulates the sound hardware, and the game's own mixer and sequencer run on it as ARM code, which the module cannot run. mGBA's README also lists "MP2k audio mixing"; the spike did not check whether that code could drive the module's sound without an emulated CPU, so count the sound as ours. Cost: the adapter and the renderer two or three steps, sound two or three: four to six steps.

### Nintendo's assets from the dump

The module patch works as the ROM patch does: the page applies it to your dump. It copies 22 % of the module's bytes from the dump and carries the other 20.1 MB itself: the compiled code, the expansion's new assets, and the retail assets that the expansion recompresses or stores in another form.

- **(a) Per-asset extraction.** The page would find each asset in the dump and place it in the module's data. The expansion recompresses graphics with its own tANS decoder (`src/decompress.c`) and stores them in other places and formats, so the build would need a generated table from the pinned sources: asset, retail offset, retail format, the module's address and format, with a spec that checks it against the dump. Assets that retail Emerald lacks (the new species, moves and their sounds) still travel in the patch. Cost: four to six steps, and the patch keeps the new assets.
- **(b) Accept the module patch as the ROM patch is accepted**, an ADR 0002 amendment (draft below). Cost: none in steps; it carries the same new and recompressed assets that `irv-emerald.bps` carries today.

## Drafts for the gate

These are proposals. The ADRs stay as they are until the gate rules.

### Draft: ADR 0002 amended

> For pokeemerald-expansion the page may build either a ROM image or a WebAssembly module from the user's base ROM. The module patch (`irv-emerald-wasm.bps`) turns the base ROM into the module, as the patch turns it into the ROM image. The module stays in the user's tab, like the patched ROM: no server hosts or ships a module, a ROM, or a module or ROM with the patch applied. The server serves the module patch and Emscripten's glue.
>
> The module patch may carry what the ROM patch carries: the expansion's code and assets, compiled with ours, under the posture that ADR 0002 and 0007 take for the ROM patch. Any other code compiled into the module, the platform layer and the runtime libraries among it, needs a licence that lets us distribute it inside a patch.

### Draft: ADR 0008 replaced

> **Gen 3 replays are written into the game's memory before it starts.** In the WebAssembly build the worker writes a replay's instruction stream into the replay slot in linear memory after it instantiates the module and before it calls `AgbMain`. The slot keeps the layout of `rom/gen3/include/replay_slot.h`, so the page writes it through the same `writeReplaySlot`. Nothing is built per replay, and Restart starts a fresh instance with the stream again.
>
> The emulator path keeps writing the stream into the ROM image as before. Because the worker owns the game's memory, live play (roadmap 7) can write instructions and keys while the game runs.

## Rests

- The audio drift: in headless Chromium the worklet reads about 3 % slower than the worker writes. The latency cap holds the fill at 0.2 s, and each skip back to 0.1 s cuts the sound once; at a 3 % gap that is a cut every few seconds. A resampler that follows the fill would play it without cuts. The worklet also starts to play with no reserve, so a frame that comes late from the worker plays as silence; the underrun count shows how often.
- `pokedex_cry_screen.c` reads `SoundInfo.pcmBuffer`, which holds floats in the module, through the tree's header that declares bytes. It is off the battle path; the Pokédex cry screen would show noise.
- `include/script.h` has three inline checks that test a pointer for ROM mirror 1 (specials, `gotonative`, `callnative`). Under the module they read every pointer as unmarked, so an effect analysis stops early. That is the field path, not the battle's.
- `-fsanitize=shift`: one full compile to list the shifts by 32 or more that the battle path reaches.
- Phones: 256 MB of fixed linear memory, a module worker, `SharedArrayBuffer` and an audio worklet. Not tried on a phone.
- Input: no key reaches the game. Leaving with B and live play need key input.
- The clock: the module's real-time clock stays at 2000-01-01 12:00, while mGBA reads the host's. A time-of-day difference in a scene is possible.
- mGBA's frames to END differ between sessions on the same ROM (up to 104 frames on 994052), cause unmeasured.
- 2x keeps every other sample pair without a low-pass filter, so some aliasing reaches the ear.
- The frame buffer has no double buffering, so a frame can tear. The e2e counts colours and saw nothing; nobody has looked.
- The 45 lines of borrowed text in the platform patches (50 with the five changed ones), if the layer stays borrowed.
- Nothing ties the module to `build/rom/replay-slot.json` beyond the slot's magic. A ROM rebuilt with another slot layout beside a stale module would let the page write past the module's slot; the module could export its slot's size for the page to check.
- An unexpected stub call (the link cable, multiboot) only logs to the console. For milestone 2, a list of allowed stubs that fails a run would catch one.
- `docs/plan.md` says the page hands the stream over instead of through the replay slot, while the ADR 0008 draft keeps the slot in linear memory. The gate reconciles the two.
- `wasm-config.ts` and `rom-config.ts` each check their config fields; one shared checker would do.
- The production build for a real host, and its headers, stay M2's work. `npm run build` with `vite preview` already serves the spike page: the e2e passed against it, with the worker and the worklet loading from `dist/assets/`.
