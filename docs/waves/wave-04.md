# Wave 4: milestone 2's cleanup, our own platform layer and the viewer

Issues #15 to #20, #25, #30 to #32, #36 to #39, #43 to #52 and #56 to #61, all of milestone M2. The user set the course at the wave 3 gate (answer 6c, 22.11.2026). The integrator cut stage 4 on 22.11.2026, and the review pages of 23.11.2026 moved the viewer to `/` within it and added stage 5. Five stages, each to `master` in its own pull request:

- #53 (S1, merge 1fc328b, 22.11.2026, closes #36, #37, #38, #39, #51)
- #54 (S2, merge 706241d, 22.11.2026, closes #15, #16, #19)
- #55 (S3, merge 180bffc, 23.11.2026, closes #17, #18, #20, #25, refers to #43)
- #63 (S4, open, closes #43, #44, #45, #46, #48, #50, #52, refers to #47, #49)
- #64 (S5, open, closes #30, #31, #32, #60, #61, refers to #56, #57, #58, #59)

`wave/04` started from `master` at ed3466c (wave 3 merged) on 22.11.2026. Its first commit (8fc25a3) records the wave 3 gate, and d71b3ff records the order after milestone 2. The brief cut two stages: the small game fixes beside #43's first part, then the next game issues beside #43's sound. The integrator cut again twice (S1-15, S2-13): lane a's stages went to `master` alone, and lane b's #43 part 1 ran on `wave/04-s1b` from stage 1 to the end of stage 3. The working files sit under `.waves/04/` (gitignored); this booking keeps what lasts.

## Goal

Two lanes: our own platform layer for the WebAssembly build (#43) in one, milestone 2's game fixes in the other. The user's note at the wave 3 gate: "I wanna finish Gen 3 though an M2, so let's have a full cleanup, but then focus on the next milestone, specifically heading to the extended dex and Gen 5". Milestone 2 ships the WebAssembly build, and the emulator page stays as the fallback until #43 is done. On 23.11.2026 the user widened the wave: the WebAssembly page becomes the viewer at `/`, the five milestone 2 gaps the planner listed become issues for a fifth stage, and #30, #31 and #32 leave `parked` for it.

## Delivered

### S1, lane a: five small fixes (#36, #37, #38, #39, #51)

- #38: a Substitute when one is already up prints the game's "Dugtrio already has a substitute!" (`STRINGID_PKMNHASSUBSTITUTE`).
- #36: a move that Volt Absorb or Water Absorb takes in plays no animation. The rule reads no ability names: an ability's heal on the move's target right after the move marks it absorbed.
- #37: Own Tempo stopping confusion shows its pop-up and the game's line, and Confuse Ray plays no animation.
- #39: a Destiny Bond KO prints "took its attacker down with it!" when the attacker faints and drains the attacker's bar first; a Perish Song count of 0 drains the bar after its line.
- #51: the emulator page opens its audio context inside the Start click and hands it to mGBA before mGBA opens audio, since Firefox for Android allows audio only during a tap.
- The review confirmed 14 claims, found none wrong and left 2 unclear; nothing to fix. No fix reaches the ROM.

### S2, lane a: multi-hit moves, item pop-ups and partial traps (#15, #16, #19)

- #15: each hit of a multi-hit move plays its animation, hit and bar; its critical hit line follows that hit, the effectiveness line waits for the last hit, and "The Pokémon was hit 2 times!" follows it. A KO on the last hit faints first. The text box empties before each hit after the first (S2-10). The ladder replay `gen3ou-2717564545` (Rock Blast) joins the fixtures.
- #19: Leftovers, Shell Bell, Sitrus and the other eaten Gen 3 berries show the held item's pop-up where the expansion's scripts show it. Item numbers come from `itemOf`.
- #16: Wrap, Bind, Clamp, Fire Spin, Whirlpool and Sand Tomb print the game's start line, play the trap's turn animation before each turn's damage and print the freed line. A spec ties the start lines to the pinned `gWrappedStringIds`.
- The instruction stream moves to version 2 with three ops: ITEM_POP_UP (0x12), TRAP_TURN (0x13) and FLUSH_TEXT_BOX (0x14), plus the simple heal's ANIM value. The ROM and the decoder refuse versions 1 and 3.
- The review found 2 mediums and 9 lows; the fix step took the flush op (S2-10) and the lows (S2-11).

### S3, lane a: order rules, trainer pictures, the outro and the patch sizes (#17, #18, #20, #25)

- #18: a second pass checks the stream's order before playback, in the ROM (`ValidateOrder`, `REPLAY_ERROR_ORDER`) and in TypeScript (`checkOrder`). A spec holds the cases of both sides equal, side operands included. The stream stays at version 2.
- #20: each side's trainer comes from the player's Showdown avatar through a name rule; without a match Brendan stands near and May far, and the near side shows only the 11 trainers the game draws from behind. Generated tables list 11 back pictures and 156 front pictures, and ROM patch 0004 lets the replay pick them. Either side's win plays the trainer victory theme. After END the outro returns each Pokémon still out, slides the winner's trainer in, holds two seconds and fades screen and music to black. The Battle Frontier background stays.
- #25: on the WebAssembly page the status line reads "Played <id> to the end of the battle." at END (S3-5). The emulator page keeps "Running".
- #17: `scripts/patch-sizes.ts` measures both patches. The module patch goes out compressed with brotli, and per-asset extraction stays parked (the user's answer). `docs/plan.md` names what the 2.77 MB extraction bound counts.
- The review confirmed 18 claims, found 3 wrong and left 4 unclear; the fix step reworded the #17 line, made the order cross-check compare sides and made the near `outro` scene prove the slide (S3-7).

### S3, lane b: our own platform layer, part 1 (#43, B1 to B5)

- Written from GBATEK under MIT in `rom/gen3/wasm/layer/`, swapped in one piece at a time behind the spike's entry points: the BIOS calls (B1), DMA and the interrupt dispatch (B2), the renderer core and frame driver (B3), windows, blending, mosaic and the renderer swap (B4), affine backgrounds with modes 3 to 7 drawing the backdrop (B5). The borrowed `bios.c`, `dma.c`, `gba_easy_draw.c` and platform patches 0001 to 0003 left the build.
- A native harness built with `cc` runs the layer's specs inside vitest, so CI runs them.
- `npm run wasm:oracle` draws mGBA's own video state with our layer and compares it with mGBA's frame of the same instant; after the review it also holds each drawn pixel against GBATEK's 5-bit result of its trace. `npm run wasm:diff` counts the pixels where a scene frame of the module differs from mGBA's.
- The shot tool runs mGBA on a fixed clock (`--clock`, noon on 1 January 2000, the module's own time). Before, mGBA's cartridge clock followed the host's, and two runs of the same ROM parted at frame 10.
- The review confirmed 15 claims, found 1 wrong and left 4 unclear (S3-6). The fix step showed that 994052's `first-faint` difference of 791 pixels is mGBA's run-to-run variance: the saved borrowed module gives the same 791.

### S3, the stage end: the module rebuilt for stream version 2

- Lane b merged `wave/04` and rebuilt the module from the merged tree (388 C files, `replay_outro.c` new) and took its baseline again. The old baseline stays under `build/wasm/borrowed-w3/` for the sound A/B.
- The victory theme in the module stayed unchecked here: mGBA's state dumps hold no IWRAM, and the module exports no data address. B8b settled it.

### S4, lane a: the viewer (#45, #48, #52, #50, #47, #49)

- #45: `readSlotHeaderLayout` in `src/patch/slot.ts` takes the slot header's offsets from `replay_slot.h`, for the page and for `scripts/rom-slot.ts` (S4-3). A slot and a `replay-slot.json` from different builds stop the page with a line that names the four build steps (S4-9).
- #48: the worker draws into two frame buffers, and the page claims the finished one through the control words `front` and `reading` (`src/web/wasm/frame-swap.ts`).
- #52: the WebAssembly page loads any replay by link or ID and lists what the game does not show, with rules it shares with the emulator page (`src/web/replay-choice.ts`, `src/web/replay-view.ts`).
- #50: 1x, 2x and fast, switched while a replay runs. The page's tick clock grants the game at most half a second of frames past the frame it has reached, plus the frames owed since its last ask, so a game that stalls makes up half a second and goes on at its pace (S4-14 to S4-16).
- #47, the code: a 19-tap half-band filter halves the rate at 2x (`src/web/wasm/half-band.ts`); the worklet waits for a reserve of 1408 sample pairs (33 ms) before it plays and after each dry spell; the progress line ends "The page skipped N sound samples and ran out of sound M times."
- #49, the code: a browser that cannot start a module worker, refuses the module's 256 MB or runs out of memory while it builds the game each get a line of their own. `src/web/README.md` holds the table for the phone runs.
- The viewer moved to `/` and the emulator page to `/emulator.html`, each linking the other (the user's answer, 23.11.2026). `/wasm.html` is gone, and "spike" left both pages' HTML.
- The first review found 3 mediums and 9 lows (S4-9). A second review covered the clock merge and the swap merge, which had reached `wave/04` without one, and found 2 mediums and 7 lows (S4-18).

### S4, lane b: our own sound, the stub stop and the shift check (#43 part 2, #46, #44)

- B6: one agent wrote a functional spec of the game's sound engine (MP2K, 471 lines) from the engine's sources and GBATEK, and a second agent answered the builders' questions in it (S4-7). The builders of the sequencer and the mixer worked from that spec, GBATEK and the game's C sources and headers; they never opened `m4a_1.s` or a borrowed file.
- Our PSG channels (`irv_psg.c`, B7), the MP2K sequencer (`irv_mp2k_main.c`, `irv_mp2k_commands.c`, `irv_mp2k_note.c`, B8a) and the mixer (`irv_mp2k_mixer.c`, `irv_mp2k_sound.c`, B8b), under MIT. The three borrowed sound files, platform patch 0004 and overlay patch 0007 left the build; 0008 keeps its 42048 Hz hunk alone.
- B9: the borrowed checkout left the build. `wasm.json` lost its `platform` field and refuses a field it does not know, the link refuses a compile record that still names `platform/` files, and `.cache/wasm/platform/` is deleted unread.
- #46: `rom/gen3/wasm/src/irv_wasm_stub_list.h` lists the four stubs `InitRFU` calls at boot. The first call of any other stub stops the run with its name, and the page shows "The game stopped: irv-emerald: <name> is a stub that no replay should call". A mixer rate other than the page expects stops through the same `IrvWasm_Stop`.
- #44: `--sanitize shift` builds and plays a second module with UBSan's runtime. Its first run found a fault outside the shifts: `AnimShakeMonOrBattlePlatforms` rebuilt an address from two `s16` fields without a `u16` cast. Overlay patch 0010 adds the cast for the module (S4-12).
- The review found 2 mediums and 11 lows (S4-13). The fix step added a native spec of both stops, 994052 windows at 1x and 2x to the spike e2e, and glossary lines for the stub list and the sanitized module.

### S4, after the freeze: a fault in the module

Stage 5 found it after stage 4 froze. The module stops with "RuntimeError: divide by zero" when a Pokémon with one of two send-out animations enters (near side: Tyranitar, Rhydon, Donphan, Hariyama, Aggron, Tauros and others; far side: Tauros, Blastoise, Aggron, Exploud and others). Upstream `src/pokemon_animation.c` divides by the 0 in the last row of `sVerticalShakeData`; the GBA's division helper returns, WebAssembly traps. Stage 4's module runs played only hand-made and 994052 to END, and neither sends such a Pokémon out on that side. #63's text names the fault, and stage 5 fixed it under #60 (S5-14, S5-15).

### S5, prelude: typed refusals (#59, step 1)

- `GenerationRefusal` in `src/gen3/errors.ts` and `GameTypeRefusal` in `src/script/errors.ts`, on `wave/04` before the lanes branched, so the page's visitor lines can key on them.

### S5, lane a: saved replays, the panel, Pause and visitor lines (#32, #31, #56, #58, #59, #57)

- #32: a failed pick sends the select back to the replay the page holds, on both pages. A pick that a newer, failing pick replaced no longer reaches Start.
- #31: the "Not shown" list shows a chat line without Showdown's markup (`src/web/markup.ts`): tags leave, character references decode once, and the list still writes text. The tag rule runs in linear time: 200,000 unclosed tags take 2 ms.
- #56: `src/script/saved-replay.ts` reads four kinds of saved replay: Showdown's downloaded file, a saved replay page, a raw battle log and a replay's JSON. Each kind gives 994052's stream byte for byte. A file over 5 MB is refused by its size, unread; the file stays in the tab. An id from a file must have a replay ID's shape (`src/script/replay-id.ts`), else the replay gets a fixed name of its kind.
- #58: a panel above the game names both players by side and shows the turn the game has reached. It fits a 360 px screen, and a name with markup shows as text.
- #59: each failure shows a visitor line (`src/web/visitor.ts`) that says what went wrong and what to do next, with the failing code's own words under a closed "Details". Where a report helps, a link opens the issue form "Replay problem" with the replay and the line filled in (`src/web/report-link.ts`, `.github/ISSUE_TEMPLATE/replay-problem.yml`); a private replay's password part stays out (S5-12). The viewer's intro names "Gen 1 to 3 singles", the select reads "Example replay", and `licences.html` holds the licences.
- #57: Pause holds the replay at its frame and suspends the sound; Play goes on from that frame, and Space toggles outside links, buttons and form fields. The clock moved into `src/web/wasm/clock.ts`; one ask now pays at most one second of owed frames plus the half-second lead.
- Battle log lines count from 1 in every line a person reads (`lineNumber` in `src/script/lines.ts`); the data keeps the 0-based index.
- Two reviews (2 mediums and 13 lows; 4 mediums and 8 lows) and a tester in a real browser (nothing broken, 4 wrong texts) each led to a fix step (S5-12, S5-17, S5-18, S5-20).

### S5, lane b: the refusal screen, the assert stop, Gen 1 and Gen 2 replays (#61, #30, #60)

- #61: a failed assert stops the module through `IrvWasm_Stop` with "assert failed at <file> line <n>: <condition>", where it stopped with "Aborted()" before.
- #30: `rom/gen3/src/replay_refusal.c` draws a refusal screen with the calls of the expansion's `CB2_FlashNotDetectedScreen`: "The game cannot play this replay.", one reason for each of the ten refusal codes and "Error N". A test fails when a code has no text. After END the B button no longer leaves the battle: `Op_End` calls upstream's `RecordedBattle_SetPlaybackFinished()`. No upstream file and no patch changed.
- #60: two tournament replays join the fixtures, `smogtours-gen1ou-995161` and `smogtours-gen2ou-993907`, picked from 64 probed replays. The kind census (`src/script/census.test.ts`) gives each of the 155 kinds of `Protocol.ARGS` one place: 41 have a rule, 33 drop by their kind, 1 drops by its text, and 80 sit on the named list (`src/script/census.ts`): 44 never occur in a replay's log, 21 belong to refused formats, 15 have no rule yet.
- #60, the rules: a recharge turn drops with the new reason `state`; a miss without a target, Gen 1's Reflect and Light Screen, Belly Drum, Mean Look, Haze, Disable, Transform, Bide, Rage, Mist, Future Sight, Heal Bell and Berserk Gene say the game's lines. Pursuit's activation prints nothing and joins the named mechanics.
- #60, the module: overlay patch 0011 guards the two shake divisions under `IRV_WASM`; the guard's 0 is the GBA's 0 / 0. A static read found no other computed divisor in `pokemon_animation.c` that singles can bring to 0. Every fixture now plays through the module at a lane's end that changes the module or a stream rule, and at the stage's end.
- The review found 2 mediums and 9 lows (S5-19). It corrected R27: Transform's sprite turns on both sides, and only a shiny target's colours stay unset, so the fallback now rises for a shiny target alone.

## Evidence

- S1, `npm run check` at 4373173: 106 spec files, 1362 passed, 142 skipped (the pinned-tree specs); 99.8 % of lines, 97.29 % of branches. The phrase spec read 145 strings from the pinned `battle_message.c`. The user heard the emulator page's sound on an Android phone in Firefox on the stage 1 preview (22.11.2026).
- S2, ROM at aa2dc66: SHA1 `cc5bff750cd275b0df66e86350ff68bffefa67fd`, patch 18,390,229 bytes, `rom:check` 94 of 94. `rom:shots`: 994052 494 ops, hand-made 34, gen3ou-2717564545 313; 13, 13 and 12 scenes (the ladder replay has no weather); refusals at frame 44. #54's table gives 41574, 3524 and 26277 frames: the shot tool's totals, END plus its 600-frame hold. END itself came at 40974, 2924 and 25677. `npm run check`: 109 files, 1573 tests, 99.8 % / 97.38 %.
- S3, ROM at be37484: SHA1 `eb5d6a0a6b997ce68e89d7f02e67b3e2f4f910d0`, patch 18,391,067 bytes, `rom:check` 126 of 126.
- S3, lane b's oracle at B5: 48 of 48 sampled states on hand-made and 660 of 660 on 994052 equal mGBA's frames. A mutant that rounds alpha to nearest passed the old compare and fails 4 of 48 and 61 of 660 under the 5-bit check. Our renderer ran at 360 to 399 frames per second in Node against the borrowed one's 374 to 404 (interleaved). On the fixed clock two oracle runs of hand-made gave byte-identical states and frames.
- S3 stage end, on the merged tree (40fa751): module 388 of 388 C files, 950 objects; `wasm:run` 13 of 13 scenes on hand-made and 994052 with `outro`, refusals at frame 31, END 2916 and 40981. `rom:shots` on the fixed clock: END 2923, 40974 and 25677, refusals at frame 44; a second hand-made run reached END on the same frame with the same 20 frames byte for byte. `wasm:oracle` 48 of 48 and 682 of 682. `wasm:diff`: `outro` 0 pixels on both streams; first-faint 1584 and 791, hand-made win 803, intro-before 882, weather-start 20849, the borrowed renderer's counts. e2e 8 of 8. `npm run check`: 126 files, 1838 tests, 99.81 % / 97.3 %.
- S3 sizes (raw / gzip / brotli): module patch 20,977,267 / 15,605,329 / 14,159,223, a visitor's fetch 14,162,026 with brotli; ROM patch 18,391,067 / 15,762,689 / 14,487,718. The extraction bound counts 2.77 MB: cries 1.62 MB and Pokémon graphics 1.15 MB for species up to 386, of 26.82 MB of ROM symbols.
- #55's CI: GitHub started no CI job while the repository was private. A fresh clone of 40fa751 without the pinned tree ran `npm ci` and `npm run check` in its place: 126 files, 1679 passed, 149 skipped, 99.81 % / 97.3 %.
- S4, the sound swap (B8b): every frame of the four `wasm:run` runs equals stage 3's baseline, END 2916 and 40981. The music player switches to `MUS_VICTORY_TRAINER` at frame 2829 on hand-made and 40884 on 994052, 87 and 97 frames before END. Our mixer plays about 8 times louder than the borrowed one: RMS 0.148 against 0.018 on hand-made, 0.158 against 0.020 on 994052; 994052 clips 8 of 57.7 million samples (S4-10).
- S4, B9: `llvm-nm` names none of the 26 names only the borrowed files defined. Module 25,967,713 bytes.
- S4, #44 on the sanitized module: END 2916 and 40981 with every frame equal to the baseline; 0 shifts by 32 or more and 0 negative counts; 32 sites shift into or past the sign bit or shift a negative value, each with the GBA's bits.
- S4, the filter: -0.02 dB at 1 kHz and -55.5 dB at 15 kHz. The old pick let 15 kHz through at -0.0003 dB.
- S4, the e2e after the move to `/` (11 of 11 at b00ef10, headless Chromium with sound): hand-made 59.87 frames per second at 1x, 120.44 after the switch to 2x, 60.25 back at 1x, 119.50 at Restart 2x; 994052 59.94 at 1x and 118.97 at 2x. hand-made reaches END at 2916 at both speeds, 994052 at fast at 40981. Headless Chromium's audio thread reads slower than the worker writes: the page skipped 794,470 samples and ran out of sound 8 times over hand-made.
- S4, the head of #63: module build 385 tree files and 25 glue and layer files, 954 objects; module patch 20,970,753 bytes, 14,203,531 with brotli (brotli's size moves by about 0.3 % between builds). `npm run check`: 137 files, 2018 tests, 99.78 % / 97.11 %. `wasm:oracle` and the sanitized run stand at 0658d15. CI green in 55 s.
- S5, ROM at d84599d: SHA1 `5a8a3c9f87908679d2e6a3a573fdb75614d788c9`, patch 18,391,834 bytes, `rom:check` 128 of 128. The refusal screens show 1718 text pixels (empty slot) and 2294 (version 3) on the refusal colour; the module's refusal frames equal mGBA's to the pixel. hand-made's outro with B held from END equals hand-made's (0 pixels differ).
- S5, the new fixtures: 995161 has 425 lines, 44 turns, 431 instructions and 6,700 stream bytes with no fallback; 993907 has 1109 lines, 92 turns, 1554 instructions and 19,026 stream bytes with 3 fallbacks, all named. No Gen 3 snapshot moved.
- S5, every stream through the module with patch 0011 (c0a51b9), END frame, with mGBA's for the two new replays: hand-made 2916, 994052 40981, 995161 32711 (mGBA 32784), 993907 133202 (mGBA 132991), 2717564545 25643, 994086 95326, 994128 91992, 994141 98969, 994176 158491. hand-made and 994052 equal the baseline on every frame. The game's objects hold 2,197 32-bit divisions and remainders, about 490 with a computed divisor; the fixtures reached 2.
- S5, two scene frames against mGBA: 995161's `first-faint` differs by timing (the module's frame 5 later differs in 0 pixels inside the sprite's box). 993907's `first-move` differs by 2647 to 2655 pixels at every offset from -6 to +6: the Reflect wall blends with EVA 13 and EVB 3, our layer on 5-bit channels as GBATEK gives the hardware, and mGBA's frame holds values off that grid; the shades differ by at most 7 of 255.
- S5 sizes (raw / gzip / brotli): module patch 20,970,945 / 15,597,563 / 14,202,743; the viewer's fetch 20,979,580 / 15,600,698 / 14,205,580; ROM patch 18,391,834 / 15,762,743 / 14,485,705.
- S5, lane a: hostile files of 5 MB read in 202, 335 and 149 ms where the first reader took 4369, 2375 and 1604; the growth spec measures 5 MB against 0.5 MB at ratios of 8.5 to 11.8, and a rescanning mutant fails at 95. Whole e2e at step 10: 18 passed in 6.1 minutes, every pace window held. With the clock in `clock.ts`: hand-made 60.95 at 1x, 118.39 at 2x, 58.30 back at 1x, 120.60 at Restart 2x; 994052 59.98 at 1x and 118.70 at 2x. Pause held hand-made at frame 199 for 3 s, and END came at 2916.
- S5, `npm run check` on the merged tree before lane a's merge commit: 151 spec files passed and 2 skipped, 2305 tests passed and 170 skipped (the pinned-tree specs), 99.81 % of lines, 97.4 % of branches. CI green on d68747b.
- S5 stage end on the merged tree (d68747b), with lane b's build set (S5-22): the whole e2e passed 23 of 23 in 8.2 minutes with no rerun. Pace windows: hand-made 59.82 frames per second at 1x, 119.67 after the switch to 2x, 59.52 back at 1x, 122.64 at Restart 2x; 994052 59.31 at 1x and 122.21 at 2x. hand-made reaches END at 2916 at both speeds and after a pause, 994052 at fast at 40981. Pause held hand-made at frame 201 for 3 s, with no dry spell while it held or right after Play. Over hand-made the page skipped 578,490 samples and ran out of sound 6 times.
- S5 stage end, `npm run check` with the pinned tree: 153 spec files, 2485 tests, 99.81 % of lines, 97.4 % of branches.
- S5 stage end, every fixture through the module: all nine streams reach END on the frames of c0a51b9's runs (hand-made 2916, 994052 40981, 995161 32711, 993907 133202, 2717564545 25643, 994086 95326, 994128 91992, 994141 98969, 994176 158491). hand-made, 994052 and both refusals equal the baseline on every frame, and the refusals come at frame 31. Every scene passes: 13 on hand-made and on each Gen 3 tournament replay, 12 on 995161, 993907 and 2717564545, which hold no weather scene. The nine plays took about 31 minutes of run time.
- S5, the orange dashes a tester saw on 994052's END screen (R43): the game draws them. After END the near side's Suicune returns to its ball while the near trainer slides in, and the recall's particles cross the trainer's spot. mGBA shows them from END+10 to END+40 (4, 33, 46 and 23 orange pixels; none at END and none from END+50 on), and the module's frame equals mGBA's on every pixel at each tenth frame from END to END+150.

## Decided without the user

Each entry gives the choice and what a reversal costs. An entry that weighed options gives the scene and the options too. A planner's batch (S1-5 to S1-13, S2-1 to S2-8, S3-1, S4-2, S5-8) lists the rulings the integrator took as recommended.

- S1-1 (#51) Where the Start click's audio hand-over lives. (a) `src/web/main.ts` joins lane a, (b) a document-wide listener, (c) `session.start` takes the context. Chosen (a). Reversal: three lines.
- S1-2 (#39) The Destiny Bond line. (a) the game's "took its attacker down" line, held until the attacker faints, (b) drain only, (c) the line before the holder faints. Chosen (a), the expansion's order. Reversal: one rule.
- S1-3 (#36) How an absorbed move is found. (a) any ability heal on the target right after the move, (b) a list of Volt Absorb and Water Absorb. Chosen (a): our code lists no names. Reversal: one predicate.
- S1-4 (#39) The builder held the line only when another faint follows before the next turn, else it plays at once with no drain, so a held line never drops. The review confirmed it against Showdown and the expansion. Reversal: one rule.
- S1-5 to S1-13 (#43) The lane b planner's nine decisions as recommended: the oracle on mGBA's dumped states plus the 13 scenes as the pixel standard, a native `cc` harness inside vitest, the oracle inside the shot tool, a two-agent clean room for the sound engine, the folder `rom/gen3/wasm/layer/`, the backdrop for bitmap modes, new frames to END accepted once scenes and oracle pass, overlay patches 0007 and 0008 cut with the sound, and B9 deleting `.cache/wasm/platform/`. Reversal: each stays inside lane b's steps.
- S1-14 Lane b's file list gained `rom/gen3/shot/`, `scripts/rom-shot-run.ts`, `GLOSSARY.md` and `AGENTS.md`. Reversal: none.
- S1-15 The stage cut: lane a finished five fixes while lane b was on its first of five steps. (a) stage 1 is lane a alone with its pull request now, (b) lane a waits, (c) lane a starts stage 2 on the stage 1 branch. Chosen (a): a pull request the user can merge now, and both lanes stay busy. Reversal: none.
- S2-1 to S2-8 (#15, #16, #19) The lane a planner's D1 to D8 as recommended: the file list, a TRAP_TURN op, one ITEM_POP_UP op, the pop-up for every Gen 3 item heal and eaten berry, the fixture gen3ou-2717564545, proof by `rom:check`, `rom:shots` and a tester, the faint before the hit-count line, and `[partiallytrapped]` mapped to nothing. Stream format version 2. Reversal: each stays inside its step, except the two ops, which the stream's version carries.
- S2-9 (#16) TRAP_TURN passes `moveOf` with its fallback: all ten trapping moves in `@pkmn/dex` have an expansion row, so the plan's skip branch could never run. Reversal: one `if`.
- S2-10 (#15) The game empties the text box before hits 2 to n (`BattleScript_FlushMessageBox`). (a) a flush op in version 2 now, before it reaches `master`, (b) a version 3 later. Chosen (a): one op and its specs now. Reversal: drop the op before #54 merged, or a version 3 after.
- S2-11 (#15, #19) The review's lows: the fix step covers the two untested branches, a spec tying the trap move ids to `gWrappedStringIds`, one home for the pop-up decision and a long comment line. White Herb and Quick Claw became R9. Reversal: none.
- S2-12 (#43) `package.json` gains `"wasm:oracle"`, outside lane b's list; lane a leaves `package.json` alone in stage 2. Reversal: one line.
- S2-13 The second cut: stage 2 reaches `master` with lane a alone, and lane b's #43 part 1 joins stage 3's pull request. (a) this cut, (b) hold #54 until lane b merges. Chosen (a): a smaller pull request sooner. The cost: #54 carried no module rebuilt for version 2. Reversal: reopen the pull request with lane b inside.
- S2-14 (#43, B4's open points) A fixed clock in the shot tool makes the oracle and `rom:shots` repeatable. (a) B5 adds it, (b) a rest. Chosen (a). Also: `package.json` gains `"wasm:diff"`, and B5 writes the glossary's "Platform layer" line and AGENTS.md's `rom/gen3/wasm/` line. Reversal: one setting.
- S3-1 (stage 3 lane a plan) The planner's I1 to I12 as recommended, among them the victory music by a look-ahead in the ROM (no format change), stream version 2 kept, the five order rules with the four weather animations free, the avatar name rule with no new dependency, the outro after END, the trainer slide from our own file, and no fallback row for an unmatched avatar. U6 (a): #25 on the WebAssembly page alone; the emulator page keeps "Running" as a rest. Reversal: each local to its step; U6 (b) costs one step.
- S3-2 (#20) POKEDUDE and OLD_MAN have a back picture and no front picture, and a replay's avatar string is free text. (a) a generated front-picture table and a far check in `fitsSide` and `ValidateTeams`, (b) a rest. Chosen (a): a few lines in the step that touches both checks. Reversal: drop the check.
- S3-3 (#20) Patch 0004 has no ball-throw hunk: `BtlController_HandleIntroTrainerBallThrow` never reads its palette arguments, so a hunk there would change nothing and could not be tested. Reversal: one line in 0004.
- S3-4 Lane a borrows `scripts/rom-shot-probes.ts` for a "frame is drawn" flag, so the `outro` check fails on a faded frame, and `src/web/wasm/main.ts` with `e2e/wasm-spike.spec.ts` for #25. Reversal: none.
- S3-5 (#25) The END line reads "Played <id> to the end of the battle." in place of the plan's "Ended <id> at the win line.", since a tie reaches END with no win line. Reversal: one string and its spec.
- S3-6 (#43, the review) The fix step settles the 791-pixel cause with one `wasm:diff` of the saved borrowed module, adds the 5-bit pixel assertion to the oracle, corrects the spike notes and shows red by mutation for two specs. R13, R14 and R15 stay. Reversal: none.
- S3-7 (#17, #18, #20, the review) The fix step names what the 2.77 MB counts, makes the order cross-check compare sides and makes the `outro` scene prove the slide where the frames allow it; R16 books the far side's slide. #25 closes for the WebAssembly page alone, and #55 says so. Reversal: none.
- S4-1 (#43, B6) By the spec writer's recommendation: the audio goes to the host at the end of `SoundMain`, and a layer file that does not include `m4a_internal.h` defines `SoundMainBTM`, so patch 0007 can go whole. The reverb's ring offsets become a rest if the user hears them. Reversal: a few lines in B8.
- S4-2 (stage 4 lane a plan) The planner's I1 to I8 as recommended: lane a owns `src/web/**`, `src/patch/slot.ts`, `e2e/**`, `scripts/web-server.ts` and `vite.config.ts`; #44 and #46 go to lane b after B9; #45 stays TypeScript; #48 gets two buffers and a claim word on the page side; lane a gets the module by a one-time copy; skip and underrun counts in the progress line; a short FIR low-pass before the 2x decimation. Reversal: each local to its step.
- S4-3 (#45) `scripts/rom-slot.ts` parsed the same offsets as the new `readSlotHeaderLayout`, one rule in two modules. Lane a takes the file for one commit and keeps its exported names. S4-9 replaced the refusal's remedy. Reversal: one commit each.
- S4-4 (#43, B7) The builder's PSG rulings, accepted: new wave bytes go into the playing bank when the frame's register read restarts channel 3, the sequencer's step order, a length reload at each restart, levels centred on 0, NR50 by (n+1)/8 and no band limit. Reversal: a line or two each in `irv_psg.c`.
- S4-5 (#43) B8 in two steps: B8a the sequencer with native specs alone, B8b the mixer, the swap and the devbox runs. The spec runs to 471 lines. Reversal: none.
- S4-6 (#47) An underrun counts once per dry spell; the counts line reads "The page skipped N sound samples and ran out of sound M times." in place of the plan's "N skipped, M underruns". Reversal: one string, two specs and an e2e pattern.
- S4-7 (#43, B8a) Three gaps in the spec went to a fresh spec-side agent, who read `m4a_1.s` and wrote prose answers, so the builders' clean room held. Reversal: one line and one spec each.
- S4-8 (#43, on the answers) A data byte with no running status ends the track as FINE would, a stated deviation: the engine stalls or hangs on bytes the module places, and no track of the 530 songs or the cries reaches the case. The channel scan reads `maxChans`, with 12 kept as a guard. Reversal: one line each.
- S4-9 (stage 4 lane a review) The fix step leaves `replay-view.ts` out of coverage, makes the slot refusal name the four build steps from a constant held equal to `WASM_BUILD_STEPS`, gives a memory failure at build time its own line, takes the small lows and runs the whole e2e once. Reversal: each local.
- S4-10 (#43) Our mixer plays about 8 times louder than the borrowed one. (a) keep GBATEK's hardware level, (b) one constant back to the old loudness, (c) a gain on the page. Chosen (a): the old level sat near -35 dBFS. The gate names it. Reversal: one constant.
- S4-11 (#46) The stub list lives in a C header, and `wasm.json` gains no field for it; `wasm:run` keeps its "trapped" wording. Reversal: one file.
- S4-12 (#44) Patch 0010 lands under #44 although it fixes no shift: the bug sits on the battle path. The 32 sign-bit sites go into one table in `docs/wasm-spike.md`. Reversal: drop 0010 and its table row.
- S4-13 (stage 4 lane b review) The fix step adds 994052 windows at 1x and 2x to the spike e2e, a native test of the stop, the mixer's rate mismatch through the same stop, stale comments and docs, glossary lines, and brotli sizes booked with about ±0.3 %. Reversal: each local.
- S4-14 (#50) A 5 s pace window saw more than 1x: `TickClock` counted from the run's start, so after a stall the game raced to catch up, and on a phone the same burst overflows the sound ring. (a) cap the clock's lead over the game's frame, (b) the e2e waits for the game to catch up, (c) wider bounds. Chosen (a): it removes the cause for viewers too. Reversal: one constant.
- S4-15 (#50) A fixed 6-frame cap missed low (0.928x). (a) measure first, (b) a lead of 0.25 s, (c) the cap grows with the frames owed since the last ask. Chosen (c), with (a)'s numbers logged if a window still missed. Reversal: a few lines in `protocol.ts`.
- S4-16 (#50) With (c) the 2x window missed at 1.32x: headless Chromium's animation frames came up to 450 ms apart. (i) judge against the previous grant, (ii) a lead of about 0.5 s, (iii) drop debt only while the frame stands still, (iv) move the pace into the worker. Chosen (ii): one constant that covers the gaps the probe saw. (iv) became R21. Reversal: one constant.
- S4-17 The pinned-tree tables spec gets 30 s: it took 5527 ms at a load near 8 and 1.9 s alone. Reversal: one argument.
- S4-18 (#50) The second review found that a gap in a visible page's asks owes its frames uncapped (a 5 s gap grants 299 frames at once). (a) a cap now in stage 4's files, then the spike e2e and a preview rebuild, (b) stage 4's docs say what the clock does, and the cap comes with #57, (c) rests. Chosen (b): `master` deploys nowhere before #62, and stage 4 gets no code change after its checks. Reversal: one builder step, one spike e2e and one preview rebuild.
- S5-1 (#62) The user approved the deploy proposal with "Let's skip the deployment for now, let's focus on building". (a) file it parked with the trigger "the user asks for the deploy", carrying the answers on the address, the emulator page and the server, (b) a rest, (c) build the site build now. Chosen (a). Reversal: one label.
- S5-2 Stage 5's lanes: lane a the page (#32, #31, #56, #58, #57, #59), lane b #30, #60 and R20 (#61). #59 keeps the visitor words, the intro, the licence page and the report link, and loses its deploy lines. Reversal: an issue moves to the other lane before its first step.
- S5-3 R20's place in lane b. (a) last, one more module build, (b) first, so one baseline serves #61, #30 and #60. Chosen (b). Reversal: the order of two steps.
- S5-4 (#60) `@pkmn/view`'s LogFormatter for scenes with no game message. (a) keep our phrases and bring Showdown's text to the gate, (b) add it for Gen 1 and 2, (c) add it for every phrase, which moves the snapshots. Chosen (a): the expansion has a message for nearly every probe scene, and a new dependency (about 27 kB gzip) needs code that uses it. Reversal: one dependency.
- S5-5 (#56) The reader's spec and the file e2e both need Showdown's saved shapes of the 994052 fixture. (a) `src/script/saved-replay-testing.ts`, (b) an e2e helper the unit spec imports, (c) a copy in each. Chosen (a). Reversal: move one file.
- S5-6 (#59) The emulator page shares the replay flow. (a) both pages show visitor lines and "Details", (b) the viewer alone. Chosen (a). Reversal: one `act` and one HTML block.
- S5-7 (#57) Step 7 moves the clock the pace windows test. (a) run the spike e2e at step 8, (b) leave it to the lane's whole run. Chosen (a). Reversal: none; the e2e ran once more.
- S5-8 (#30, #60) The lane b planner's rulings as recommended: the refusal words live in C alone; B is blocked after END alone, through upstream's call; the stream and slot versions stay; the refusal scene is one `text` probe; `rom:shots` gains the run `hand-made-b`; the fixtures 995161 and 993907; the named list in `src/script/census.ts`; `-mustrecharge` drops with the reason `state`; a miss without a target takes its move's target; Pursuit's activation joins the named mechanics; `-start` reads a third argument; `Before` copies each active Pokémon's boosts. Reversal: each stays inside lane b's files.
- S5-9 Lane steps waited up to an hour for a check behind the heavy-check lock that ps-dashboard-2's runs hold. (a) CI also runs on pushes to `wave/**` (805582c), (b) keep waiting on devbox. Chosen (a). Reversal: one line in `.github/workflows/ci.yml`.
- S5-10 (#57) Steps 7 and 8 waited for the phone runs; steps 9 and 10 (#59) touch none of their files. (a) 9 and 10 first, (b) hold the lane. Chosen (a). Reversal: none after the steps ran; the plan's line numbers for 7 and 8 shifted.
- S5-11 (#59) The slot file's `RomError` becomes a `BuildMismatchError`; the worker's `onerror` reads as the game's stop; a run's place comes from its pick, so a failed run of a saved file reports the file's kind and never its name. Reversal: one rule each.
- S5-12 (#59) A visitor loads a private replay by its link, the run fails, and the report link fills the public issue form with the link as typed. (a) the form asks the visitor to remove the password, (b) the link leaves the password out and the form says so. Chosen (b). Reversal: one function and one sentence.
- S5-13 (#57) The plan held Pause back until the phone runs of #47 and #49 were in, and they have not come. (a) build #57 after the fix step, (b) wait, (c) move #57 to a later stage. Chosen (a). Reversal: none after the build; if a phone run finds a fault, the fix lands in `clock.ts` or `audio-opener.ts`.
- S5-14 (#60) The trap fix changes the module's build, and lane b's plan ruled patch changes out, yet "both replays play to END in the module" cannot hold without it. Chosen: the fix belongs to #60 and lane b, after a planner settles the mechanism. Reversal: none; the other path left the viewer broken for a near Tyranitar.
- S5-15 (#60) Overlay patch 0011 guards the two sites inline; the other computed divisors in `pokemon_animation.c` get a static read; every fixture plays through the module at each lane end that touches the module or a stream rule and at the stage end (about 33 minutes); the baseline stays two streams. Emscripten 7.0.0 and Binaryen 133 offer no switch that gives libgcc's results. Reversal: one patch edit and a rebuild.
- S5-16 (#57) A refused resume or suspend after a Pause or Play press shows no line, and the next press asks again. The first Start keeps its order of building and resuming the audio context. Reversal: one line.
- S5-17 (#57) A visitor clicks Start, then presses Space to pause, and the replay starts over because Start holds the focus. (a) move the focus to Pause once the run begins, (b) leave it, (c) let Space on Start toggle. Chosen (a). Reversal: one line.
- S5-18 (#56) The hostile-input specs held a fixed 1000 ms, which a loaded devbox missed. (a) measure growth in one test (ten times the input under forty times the time, best of three, interleaved), (b) 5000 ms. Chosen (a). Reversal: one spec.
- S5-19 (#60, the review) Transform's fallback rises for a shiny target alone; five lows fixed, two left, effect ids as rule keys accepted as the base's practice; the two pixel differences probed. To the gate: rules for the "no rule yet" kinds, and a per-op frame log in both engines to split END gaps. Reversal: none.
- S5-20 (the tester's findings) Fixed in the lane: a wrong dump's line moves its two SHA1 values under "Details"; the link field's refusals get a visitor line; "Details" never repeats the line word for word; battle log lines count from 1; an example that fails to load gets its own line; Pause is disabled after END; the licence page explains its three developer words. Reversal: one line each.
- S5-21 #56 to #59 each hold a device check on the user's phone, and #59 a check that needs the issue form on `master`. (a) the pull request closes them, (b) it refers to them, and they stay open until the device session, as #47 and #49. Chosen (b). Reversal: one edit of the pull request's text.
- S5-22 The stage end asks for the e2e on a rebuild of the merged tree. Since the module build at c0a51b9, `rom/` and `scripts/` changed in one header comment, a ROM test file and the README. The comment changes no code line, so the ROM of lane b's step 3 (SHA1 above) still matches the tree. (a) rebuild (about 11 minutes), (b) keep lane b's build set. Chosen (b). Reversal: one rebuild.
- S5-23 The preview on devbox showed stage 4's page and build set while the user's device checks for stage 5 wait. (a) a second preview beside it, (b) the one link moves to the merged tree with lane b's build set; stage 4's set stays on devbox. Chosen (b): devbox holds one server for a tester at a time, and stage 5's page still runs the phone runs of #47 and #49. Reversal: one page build from `wave/04-s4` and four files copied back.
- S5-24 (#58, review finding L8) The panel's `overflow-wrap: anywhere` stays as a guard for screens under 360 px; Showdown's longest name fits a 344 px line, so no e2e can go red on it. Reversal: one CSS line.

## Gate

State on 23.11.2026, before the gate:

| Stage | Lane | Issues                       | Pull request | State                                       |
| ----- | ---- | ---------------------------- | ------------ | ------------------------------------------- |
| S1    | a    | #36, #37, #38, #39, #51      | #53          | merged, 1fc328b                             |
| S2    | a    | #15, #16, #19                | #54          | merged, 706241d                             |
| S3    | a    | #17, #18, #20, #25           | #55          | merged, 180bffc                             |
| S3    | b    | #43, part 1                  | #55          | merged, 180bffc                             |
| S4    | a    | #45, #47, #48, #49, #50, #52 | #63          | open; #47 and #49 wait for the phone runs   |
| S4    | b    | #43, #44, #46                | #63          | open                                        |
| S5    | a    | #31, #32, #56, #57, #58, #59 | #64          | open; #56 to #59 wait for the device checks |
| S5    | b    | #30, #60, #61                | #64          | open                                        |

The user's okays and answers during the wave:

- #53 merged at 20b3bd2 on the user's okay (22.11.2026). #54 merged at 22d5b2b on "Feel free to merge #54" (22.11.2026).
- The order after milestone 2 (22.11.2026): "Milestone 3 first and then let's dive into Gen 5. These can actually be worked on in parallel." `docs/plan.md` records it.
- The stage 3 choices page (22.11.2026), "1a 2a 3a 4a 5a": Brendan near and May far as the fallback trainers, back pictures near alone; the outro returns every Pokémon, slides the winner's trainer in, holds and fades; victory music for either side's win; the Battle Frontier background stays, with the note "Later a choosable background would be nice" (R11); the module patch served with brotli and per-asset extraction parked until visitors report slow loading after the deploy.
- The stage 4 review page, opened with #55 on 22.11.2026 and answered on 23.11.2026, "1a 2a 3a 4a 5a", no notes: merge #55; the WebAssembly page moves to `/` and the emulator page to `/emulator.html` as the fallback once #43 is done; the phone runs on the user's phones, with the README naming each browser nobody tried; the five milestone 2 gaps become issue proposals for a stage 5; #30, #31 and #32 leave `parked`, and #26, #27, #28, #29 and #40 move to milestone 3, still parked.
- The repository went public on 23.11.2026 (the user: "I think CI will work when we're public … If yes, feel free to make the repo public"). #55 merged as 180bffc after the fresh-clone check, and CI ran on `master` from then on.
- The stage 5 review page (23.11.2026), "1a 2a 3c 4a 5a 6a 7a": the five proposals approved, with the note "Let's skip the deployment for now, let's focus on building" (#56 to #59 for stage 5, #62 parked, S5-1); Gen 1 and Gen 2 replays join milestone 2 (#60), with the note "Can we reuse the @pkmn libraries logic somehow?"; the address a subdomain of fulllifegames.com; the emulator page ships as the fallback; server rules and a deploy script on the model of ps-dashboard-2's; visitors report through the repository's new-issue form; R20 a small fix in stage 5 (#61). The planner answered the note from the libraries' code: `@pkmn/client` 0.7.4 follows every Gen 1 and Gen 2 line the probe found and keeps no move for Disable, so #60 adds rules and no mechanics of its own.
- The Pokémon XD port (23.11.2026): "Can we add this to the list and milestones?" Roadmap step 10, the glossary's target game line, an amendment to ADR 0003 and the GitHub milestone "M10: 3D (Pokémon XD)" (68db872).

Waiting for the user:

- The okay to merge #63 (stage 4).
- The okay to merge #64 (stage 5), after #63.
- The phone runs for #47 and #49: a replay at 1x and at 2x on each phone, the counts in `src/web/README.md`'s table. The loudness of S4-10 and the reverb of S4-1 wait for the same session.
- The device checks of #56, #57, #58 and #59 on the phone, Pause and Play among them.
- Two real saved files of 994052 for #56: one from Showdown's Download button, one from a desktop browser's "Save Page As".
- #59's report link against the issue form, once the form is on `master`.
- Where milestone 10 (Pokémon XD) sits in the order.
- The gate's review page, with eight questions: the two merges, the seven proposals below, P1's cut, what wave 5 holds, milestone 3's first formats, the Gen 5 spike and Pokémon XD's place. Wave 5's first commit records the answers here.

## Rests

Became an issue:

- R20 (#61, M2, small fix): `MgbaAssert` called `abort()` on a stopping assert, so the page showed "Aborted()". Approved on the stage 5 page (q7 a), built in stage 5.

Settled in the wave:

- R12: at END the status line replaced the running line, so a run without sound lost its reason. #59 shows "It played without sound: …" after END.
- R27: Transform keeps the old sprite. The review corrected it: the sprite turns on both sides, and only a shiny target's colours stay unset (S5-19). The shiny part stays with the Transform proposal below.
- R10 and R13: process records. No red log survives for stage 2 step 1's `-hitcount` rule and phrase specs; B1's specs have no red log, and B3's oracle spec came after its code.
- R23: `GLOSSARY.md` lacked lines for the sound reserve, the dry spell, the audio ring, the latency cap and the tick rule. They came with this booking.
- R43's dashes: three short orange dashes near the near trainer on 994052's END screen in the module. A probe found the same dashes in mGBA on the same frames: they are the particles of the game's own recall. R43's other half, the double click on Start, stays below.

Proposals for the gate, in the order of the notes, the largest first:

- R1 and the 15 "no rule yet" kinds (S5-19): every one is a line Gen 1 to 3 singles log, each drops as `unsupported` and shows in the "Not shown" list. `-sethp` (Pain Split: neither bar moves) and `-prepare` (charge turns lose their line and animation) change whole turns; then `-singlemove` (Destiny Bond, Grudge; R1), `-ohko`, `-copyboost` (Psych Up), `-clearnegativeboost` (White Herb) and `-formechange` (Castform). With them Mud Sport and Water Sport's game lines, once a Gen 3 replay shows whether Showdown logs them as `-start` or `-fieldstart`. None occurs in the 8 fixtures or the 64 probe replays.
- R2: Restart resumes the emulator page's audio inside `act`'s microtask, outside the click; Firefox may refuse it.
- R3: in doubles a second Destiny Bond line would overwrite the held one (milestone 4).
- R4: `scripts/web-server.test.ts` timed out twice at a load of 9.9 and passed alone in 2 s.
- R5: Berry Juice still prints our "used up" line before its heal.
- R6: a Lum Berry cure logged without `-enditem` shows no pop-up; no fixture has it.
- Persim Berry gets a pop-up the expansion does not show (`BattleScript_BerryCureConfusionRet`); #54 names it.
- R7: Gen 4 and later trap start lines (Magma Storm, Infestation, Snap Trap, Thunder Cage) keep our phrase and its fallback.
- R8: no fixture holds a partial trap; the candidate gen3randombattle-2717609379 (Shuckle's Wrap, 36 TRAP_TURN ops) needs a Heal Bell phrase and a fixture rule for random battles.
- R9: White Herb and Quick Claw show the item pop-up in Gen 3, and we write none; no fixture has either.
- The emulator page still says "Running" after the win line (S3-1, U6).
- R11 (the user's note): a background the viewer can choose; milestone 5 holds backgrounds per format.
- R14: the window rule for X1 > X2 rests on GBATEK alone; the oracle saw no such window and no WIN1.
- R15: brightening (BLDCNT mode 2) has no oracle state, and its mGBA model is a guess.
- R16: a frame-level check of the far trainer's slide, which ends 32 px right of the intro's spot over a different field.
- R17: the low-HP beep at a tie, outro tests for an unknown end and for a tie with both Pokémon out, the outro's step guard and hook comment, two small C duplicates; each needs C and a `rom:check`.
- R18: a 5 s pace window can miss its bound when devbox's load passes about 8; below that every window passed. Keep the bounds and rerun a missed window alone once.
- R19: each switch to fast empties the sound ring and counts one underrun, since the worklet does not read the pace.
- The reverb mixes 2 and 1 frames back where the game uses 7 and 6 (S4-1), if the user hears it.
- R21: the page's animation frames pace the worker, so a phone that skips them could hear uneven pace. Move the pace into the worker if the phone runs show it.
- R22: the half-band filter starts from zero history after a pace change and could tick once; carry the history across if the device runs hear one.
- R24: "spike" stays in code names and comments (`SpikeView`, `findSpikeView`, `createSpike`, the test hook `irvWasmSpike`); one commit renames them all, the e2e included. Small fix.
- R25: `wasm:diff` prints nothing for a refused run, since it skips `final.ppm`.
- A player name over 19 glyphs fails the backend; Showdown allows 18 characters, so only an edited file meets it.
- R26: in 993907 Pursuit knocks its target out, so no withdraw line plays; Pursuit in the game's order (the activation says the withdraw line, the switch none) would show it.
- R28: Rage prints its line at its start; the game prints it when a hit raises Attack.
- R29: 20 of the 24 probed Gen 1 replays log `cant … partiallytrapped`, so a later Gen 1 fixture fails the fixture spec on that fallback until a gate allows it or the scene gets a line.
- R30: the Gen 1 shapes of Haze, Bide's name and Disable without its move come from guesses; a real replay of each checks them.
- Doom Desire's start has no line of its own, and Mist as a side condition falls to our phrase; no fixture holds either.
- The "Not shown" list says "no rule for <kind>" for a named-list line; it could give the named list's reason.
- B during playback still leaves the replay to black, as upstream's recorded battle does; one ROM line blocks it from the start.
- R31: developer words stay in older lines of the public tree: `environment.ts` under "Details", `e2e/requests.ts:1` and older README lines name devbox.
- R32: "bytes of instruction stream" and "ROM SHA1" show outside "Details", and `runningLine` and `progressLine` live in `run.ts` where `status.ts` would hold them.
- R33: no spec holds the README's "Gen 1 to 3 singles" to `PLAYED_FORMATS`.
- R34 to R37, trap classes WebAssembly has and the GBA lacks, none covered by 0011: a remainder by zero, `INT_MIN / -1` and the 11 64-bit divisions at sites no fixture reached (R34); a call through a null or mistyped function pointer (R35); memory past the module's 256 MB, and the GBA's mirrored RAM that the module maps one to one (R36); `unreachable` outside the assert path and a call stack past 1 MB (R37).
- With them (S5-15): a rewrite after the link that gives every division in the module libgcc's results (two builder steps; a probe worked on a small file), a stream with one send-out per animation function (about 157 send-outs, 47,000 frames), and `wasm:run` going on after a failed stream.
- A per-op frame log in both engines, to split END gaps such as 993907's 211 frames after mGBA and 995161's 73 before (S5-19).
- R38: a refused resume after Play leaves the picture running without sound and without a line.
- R39: a Start during a pause plays a short tail of the old run's sound, and a Start that then fails leaves the context running under the paused run.
- R40: three animation functions divide by a shared `sAnims` slot; a zero needs four more animations at once, which singles cannot start.
- Transform's shiny colours and personality: nothing sets the transformed copy's personality and shininess, so a shiny target draws in normal colours and a transformed Spinda shows the personality-0 form. No fixture holds Transform, so no log line names the gap.
- Showdown's own text (`@pkmn/view`'s LogFormatter) for scenes the game has no message for (S5-4).
- R41: a failed pick during a run leaves its failure line above the game that plays on.
- R42: the example select shows bare IDs; a label with format and players needs the fixtures' metadata in a generated list.
- R43: a double click on Start during a run starts two runs in a row.
- R44, found by reading while a reviewer checked the proposals, with no run behind it yet: the move instruction plays every animation as turn 0 (`rom/gen3/src/replay_ops_damage.c:40`), and 33 of the game's animation scripts pick their second animation on an odd turn (`Cmd_choosetwoturnanim`). So the hit turn of a two-turn move would show its charge, and a Curse by a non-Ghost would show the Ghost's animation. Bide's release, Brick Break through a screen, Pursuit on a switch and the hit of Future Sight and Doom Desire use the same choice. No fixture's scene holds one; 993907's Pursuit on a switching Exeggutor may be the first case.

A planner cut these rests into seven issue proposals for milestone 2, and a reviewer checked their claims against the code: about 120 held, 11 were wrong and 8 unclear, and the planner reworked the text. The gate's page puts them to the user:

- P1 (feature): moves play their own animation (R44), and charge turns, Pain Split and the other kinds with no rule yet appear as in the game (R1, R9's White Herb, Castform's form change). The stream goes to version 3.
- P2 (larger bug): a division or trap the GBA survives no longer stops the viewer (R34 to R37, the rewrite after the link, a stream that sends out one Pokémon per animation).
- P3 (small fix): item, move and order lines follow the game (R5, R6, Persim, R26, R28, R29, Doom Desire, Mist, the reason in "Not shown").
- P4 (small fix, ROM): Transform's shiny colours, B during playback, and R17's outro cases.
- P5 (small fix, pages): the pages after a failed pick, a second Start or a refused resume (R2, the emulator page's "Running", R32's two lines outside "Details", R38, R39, R41, R42, R43).
- P6 (small fix): code and docs drop the spike and devbox words (R24, R31, R33, and R32's two functions in `run.ts`).
- P7 (feature, tooling): the per-op frame log, `wasm:diff` on a refused run (R25), a fixture with a partial trap (R8) and the slide's frame check (R16).

These stay rests, each with its trigger above: R3, R4, R7, R11, R14, R15, R18, R19, R21, R22, R30, R40, the loudness, the reverb, the long player name, `@pkmn/view`'s text, and R9's Quick Claw, since a Gen 3 log holds no line for it.

## Notes

- Since lane a's step 9 in stage 5, a lane's next step starts once its push's CI run is green. The rule came after CI failed on ae1a228 (`src/web/session.test.ts` expected a summary without `players`) while the next builder had already started; 21910ae fixed the spec.
- Stage 4's lane a merged twice into `wave/04` without a reviewer pass (the clock rule 6e70db8 and the move to `/` 387de62). A second review covered both, and #63's body names it.
- Lane a's fix step 3 changed `src/script/lines.ts`, `errors.ts` and six `src/script/` specs, lane b's files by the cut: the line-number rule must sit in `src/script/` by the import zones.
- Lane b's clean room: the builders of B7, B8a and B8b each record that they opened no borrowed file. In B2 one grep printed a line of a borrowed platform patch (an enum member already named); the ledger records it.
