# Wave 3: the WebAssembly spike and exact HP

Issues #35 (milestone M1b) and #41 (M2). The user picked the spike at the wave 2 gate (answer 4a, 21.11.2026) and asked for #41 in the next round after reporting it the same day. One stage with two lanes side by side goes to `master` in pull request #42 (S1, closes #35 and #41).

`wave/03` started from `master` at 7fa0bb6 (wave 2 merged) on 21.11.2026. Its first commit records the wave 2 gate in `docs/waves/wave-02.md`. The working files sit under `.waves/03/` (gitignored); this booking keeps what lasts.

## Goal

Milestone 1b: find out whether the pinned expansion with our C files runs in the browser as WebAssembly, without mGBA, and what shipping such a build would need (#35, a time box of ten builder steps). Also: replay gen3customgame-2115579570, a custom game that logs exact HP, plays on the page (#41).

## Delivered

### S1, lane a: exact HP (#41)

- `scaleHp` returns a whole number for every HP: no HP gives 0, full HP gives 100, and every value between rounds to 1 to 99. Before, full HP at 319/319 or 364/364 came out as 100.00000000000001, and the encoder refused the stream.
- `|debug|` lines, which a custom game in debug mode writes, drop with their own reason `debug` instead of `unsupported`.
- The review found two gaps, both fixed in the lane: an HP out of 100 with a fraction (`0.5/100`) passed through unrounded, and no committed spec covered exact HP on the lead send-outs. A spec in `src/gen3/backend.test.ts` now builds a log with leads at 319/319 and 364/364; against the old `scale.ts` it fails with the issue's own error.

### S1, lane b: the WebAssembly spike (#35)

- Emscripten 7.0.0 compiles 390 C files at `-O2`: 384 from the pinned tree (some through patched copies under `build/wasm/overlay/`) and six borrowed platform files fetched into `.cache/wasm/platform/`. A converter (`scripts/wasm-convert.ts`) turns the 544 ARM-assembled data objects into WebAssembly objects with the same bytes and relocations. `npm run wasm:build` and `wasm:convert` write only under `build/wasm/`.
- The GBA's addresses map one to one into linear memory. Our glue (`rom/gen3/wasm/src/`) blocks in `VBlankIntrWait`, draws the frame with the borrowed renderer, raises the interrupts and hands frame and sound to JavaScript.
- `npm run wasm:run` plays a stream in Node and checks the 13 scenes of the screenshot run against the frames, in the report shape of `rom:shots`.
- The spike page `src/web/wasm.html` rebuilds the module from the user's dump with a BPS patch, runs it in a worker, plays sound through an audio worklet and offers 1x, 2x, fast and Restart. The emulator page links to it and stays as it was.
- `docs/wasm-spike.md` records the result: what works, frames to END, speed, download size, the bugs the port found, the licences with their sources, what shipping would need, where the speed options go, what the result means for #17, and drafts of an ADR 0002 amendment and an ADR 0008 replacement for the gate.
- Bugs the port found and fixed: the tilemap check in `bg.c` that took every buffer above IWRAM for VRAM (the black text box); shifts by 32 in `text.c` that the GBA reads as 0 and WebAssembly as the value (the healthboxes); a VCOUNT wait in the sound setup; function-pointer traps in the decompressors and `Clear64byte`; `script.c`'s setjmp; 290 flagged function pointers in the event scripts; and, from the review, the RNG helpers in `random.c`, which drew no random numbers in the module. Nine overlay patches against the expansion, four against the platform files, five shadow headers.
- A new scene `level` in the screenshot run looks at the "Lv" glyph in the far healthbox, on mGBA and on the module alike.
- Two reviews (build and C; page, e2e and docs) found 20 defects. Fix steps 10 and 11 fixed all of them: among others the RNG helpers, a `git apply` that could do nothing without an error, a worker left running after two Start presses, a failed audio context that blocked every later Start, ring counters that wrapped after seven hours, and a latency cap of 0.2 s on the sound.

### After the gate opened

- The user's phone would not let them pick their dump on the preview. Both pages filtered the picker to `.gba`, and phone pickers grey out files with an extension they cannot type. The filter is gone from `index.html` and `wasm.html`; the SHA1 check still refuses any file that is not US Emerald. `src/web/pages.test.ts` fails on a filter.

## Evidence

- gen3customgame-2115579570 builds a stream of 9264 bytes with no fallback. Its 260 dropped lines: 82 chat, 63 spacer, 37 timestamp, 28 debug, 26 upkeep, 18 timer, 3 metadata, 1 rule, 1 room, 1 hint; none unsupported or unknown. All 116 HP values in the stream are whole numbers from 0 to 100. A probe outside the specs measured this, and the reviewer's rerun gave the same counts; the specs cover the rule.
- Both engines on the same streams (B7, two interleaved runs each; wall times on devbox's shared cores are rough): hand-made reaches END at frame 2916 on the module and 2910 on mGBA, 994052 at 39637 and 39630. All 13 scenes and both refusals pass on both. Node runs the module at 366 to 377 frames per second, native mGBA at 933 to 998. In Chromium the spike page ran 994052 at fast at 330 to 348 frames per second; mGBA's page tops out near 314 at 64x and 256x.
- After the review fixes (the relinked module): `wasm:run` passes all four runs with the same frames to END, 2916 and 39637. The e2e passes: two Start presses during the build start one run; hand-made reaches END at 1x after 48.9 s (59.70 frames per second); 2x runs at 118.7 frames per second; 994052 reaches END at fast after 155.0 s, with another session's tests running beside it.
- Sound: the mixer gives 42048 sample pairs per second. At 1x in headless Chromium the worker wrote 1.000 of them; the worklet played fewer under load, and the 0.2 s latency cap skipped the excess instead of letting it pile up.
- Download (raw / gzip / brotli): the spike page's module patch and glue 20,983,677 / 15,606,484 / 14,185,804 bytes; the emulator page's mGBA and ROM patch 20,489,786 / 16,412,691 / 14,998,272. The module patch copies 22.4 % of the module from the dump, the ROM patch 24.0 % of the ROM.
- `npm run check` on the lane's last commit (1ccb8f9): 104 spec files, 1471 tests, coverage 99.84 % of lines and 97.6 % of branches. Lane a's last check (50c55d6): 1046 passed, 139 skipped (the devbox-only ROM specs in a tree without the pinned expansion).

## Decided without the user

Each entry gives the scene, the options, the choice and what a reversal costs.

- S1-1 The wave 2 gate record. (a) the first commit on `wave/03`, so it reaches `master` with this wave's stage pull request, (b) its own pull request, as after wave 1. Chosen (a): one okay fewer. Reversal: none.
- S1-2 (#41) No sixth fixture. (a) specs on the rule plus a one-off probe of the replay, (b) the custom game as a sixth fixture with its snapshots. Chosen (a): the five fixtures are tournament replays, and the rule lives in one function the specs cover. Reversal: one fixture and its snapshots.
- S1-3 (#41) The replay's 28 `|debug|` lines showed as unsupported on the page's "Not shown" list. (a) a new drop reason `debug`, (b) reuse `room`, (c) leave them unsupported. Chosen (a): a debug line is server output about the battle, neither room HTML nor a gap in the viewer. Reversal: one table entry.
- S1-4 (#35) The toolchain. (a) emsdk 7.0.0 under `~/tools/emsdk`, pinned in `rom/gen3/wasm/wasm.json`, (b) apt's emscripten 3.1.69, (c) bare clang and lld from apt. Chosen (a): the latest release, with libc and the worker glue, and nothing installed system-wide. Reversal: one config line and the compile flags.
- S1-5 (#35) The memory model. (a) GBA addresses kept as they are in linear memory, static data from 0x08000000, (b) pokeemerald-multiplatform's `PORTABLE` arrays, (c) a mix. Chosen (a): no header patch for literal addresses such as `*(vu16 *)BG_PLTT`, and tripplyons/pokeemerald-wasm runs the same way. Reversal: the renderer's address macros and the shadow headers, about one step.
- S1-6 (#35) The main loop, which never returns. (a) a Web Worker whose `VBlankIntrWait` blocks on `Atomics.wait`, (b) ASYNCIFY, (c) an overlay patch to `main.c` with a per-frame export. Chosen (a): no change to upstream code, and the page is cross-origin isolated already. Reversal: (c), one overlay patch and a loop in the worker.
- S1-7 (#35) The data assembly (`battle_anim_scripts.s` alone holds 35,060 lines of macros). (a) assemble with ARM `as` as the ROM build does and convert the ELF objects, (b) our own macro re-expander, (c) port the data to C. Chosen (a): it reuses the expansion's own assembly and handles every relocation the same way. Reversal: none that later steps need.
- S1-8 (#35) The `ReplayProgress` size: wasm32 makes the struct 10 bytes, and our assert expects 12. (a) three explicit padding bytes at its end, (b) skip the assert in the wasm build, (c) a per-file define. Chosen (a): same offsets, 12 bytes on both builds, the ROM unchanged (SHA1 779ba38d… before and after). Reversal: one line.
- S1-9 (#35) Sound. (a) silent first, one step at most for sound, (b) sound required before the spike counts as working. Chosen (a): #35 asks the write-up to report on sound. Sound played after its one step. Reversal: none.
- S1-10 (#35) What merges. (a) everything, with specs and the ceilings, if the hand-made stream reaches END, otherwise only the write-up and the converter, (b) only the write-up, (c) everything. Chosen (a); the stream reached END, so the lane merged whole. Reversal: a revert of the lane merge.
- S1-11 (#35) The time box. The brief said "this wave"; the integrator set it at ten builder steps for B1 to B7, fix steps included. Reversal: none; the gate can extend it.
- S1-12 (#35) For the spike only: the borrowed platform files (BIOS calls, DMA, renderer, mixer) sit pinned in `.cache/` and never enter the repository, and the page rebuilds the module from the user's dump with a BPS patch served on devbox only. How a build could ship goes to the gate.
- S1-13 (#35) The patches against the borrowed platform files (`rom/gen3/wasm/platform-patches/`) carry 45 of their lines as context and removed lines (50 with five changed lines), as `rom/gen3/patches/` does against the expansion, which has no licence either. (a) keep them as diffs, the same posture as the ROM patches, (b) express each change through defines and shadow headers instead, (c) drop the borrowed layer now. Chosen (a): four small diffs, and a swap of the layer before shipping removes them. Reversal: four patch files.
- S1-14 (#35) B3 in two builder steps (every file compiles; then the glue, the link and a Node smoke run), as the plan allowed one or two. Reversal: none.
- S1-15 (#35) The healthbox defect after B4. (a) a fix step before the page, (b) the page first and the defect as a rest. Chosen (a): the page would have shown it, and the cause turned out to be a class of bug (shift by 32) worth naming. Reversal: none.
- S1-16 (#35) The link at `-O2` passed every scene at 271 MB peak, with a 26.0 MB module against 28.3 MB. (a) `-O2` as the default, (b) keep `-O0`. Chosen (a). Reversal: one default and one spec line.
- S1-17 (#35) Sound at 2x and fast. (a) 2x plays at double pace and fast is silent, (b) mute both. Chosen (a): the user asked for speed options, and double-pace sound tells the viewer the speed. Aliasing at 2x stays a rest. Reversal: one rule in the worker.
- S1-18 (#35) The fixes after the review. (a) two fix steps in sequence (build and C first, then the page, audio and docs), one step past the box of ten, (b) one fix step and the rest as issues, (c) stop at the box and file every finding. Chosen (a): the review and its fixes belong to every lane, the box was set for the exploration, and the top finding (the RNG helpers) changed behaviour. Reversal: none.
- S1-19 (#35) A hidden tab. The review asked whether playback resumes where it paused or jumps ahead. (a) resume where it paused, (b) jump ahead. Chosen (a). The first cut treated every gap over a quarter second as a pause, which slowed the game on a busy machine; the clock now rebases only when the tab comes back into view. Reversal: one condition.
- S1-20 (#35) Heavy runs beside another session. devbox allows one heavy check at a time across sessions, and ps-dashboard-2 queued its runs for hours. (a) each of our heavy runs also takes ps-dashboard-2's lock file, so the runs take turns, (b) wait until its queue empties. Chosen (a): `flock` only opens the file, and our runs fit between theirs. Reversal: none.
- S1-21 (#35) No tester step. (a) the gate's preview link for the user's own look, with the e2e and the 13 scenes as evidence, (b) a tester agent in a browser before the gate. Chosen (a): the machine was contended, and the spike page is a test page beside the viewer. Reversal: a tester step in the next wave.
- S1-22 (preview) The dump picker on phones. (a) drop the `accept` filter on both pages, (b) widen it with `application/octet-stream`, (c) leave it until phones get their own issue (R7). Chosen (a): the SHA1 check already refuses a wrong file with its SHA1, and a wider filter still depends on how each phone maps types. Reversal: one attribute per page.

## Gate

Open. The gate page asks the user six questions: the merge of #42, the route for milestone 2, the platform layer, the assets in the module patch, the rests as issues, and what wave 4 takes. The dev page runs behind `tailscale serve` for the user's own look at both pages.

| Stage | Lane | Issues | Pull request | State before the gate |
| ----- | ---- | ------ | ------------ | --------------------- |
| S1    | a    | #41    | #42          | waits for the okay    |
| S1    | b    | #35    | #42          | waits for the okay    |

## Rests

Proposals for issues, ruled at the gate. Where an item depends on the route for milestone 2, the line says so.

- R1 (with the WebAssembly route): a platform layer we may ship, in place of the borrowed one. The gate's question 3 picks which.
- R2 (with the WebAssembly route): one full compile with `-fsanitize=shift`, to list every shift by 32 or more that the battle path reaches. Nothing in the build warns about that class.
- R3 (with the WebAssembly route): the module tells the page its slot size, so the page refuses a `replay-slot.json` from another build. Today only the magic ties them.
- R4 (with the WebAssembly route): a list of the stubs a run may call; a run that calls another one fails.
- R5 (with the WebAssembly route): sound on a real device. Headless Chromium played a fifth slower than the worker wrote under load; the 0.2 s cap kept the latency, at the cost of skipped samples. The worklet also starts with no reserve, so a late frame plays as silence, and 2x drops every other sample pair without a low-pass filter.
- R6 (with the WebAssembly route): the frame buffer has no double buffering, so a frame can tear.
- R7 (with the WebAssembly route): phones. 256 MB of fixed memory, a module worker, `SharedArrayBuffer` and an audio worklet, untried on a phone.
- R8 (no issue): the module's clock stays at 2000-01-01 12:00, while mGBA reads the host's.
- R9 (no issue): mGBA's frames to END differ between sessions on the same ROM (up to 104 frames on 994052).
- R10 (no issue): `pokedex_cry_screen.c` and three mirror checks in `include/script.h` read the module wrong; both sit off the battle path.
- R11 (no issue): `wasm-config.ts` and `rom-config.ts` each check their own fields; one shared checker would do. `scripts/rom-shot.ts` sits at 298 of 300 lines.

## Notes

- Boundless Black 2 (user's pointer, 21.11.2026) went into `docs/plan.md` as a candidate base for milestone 8, with the two checks its source release decides.
