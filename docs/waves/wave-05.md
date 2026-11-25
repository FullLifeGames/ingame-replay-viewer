# Wave 5: milestone 2's cleanup and the Gen 5 spike

Issues #65 to #71 of milestone M2 and #72 of milestone M6. The user set the course at the wave 4 gate (answers "1a 2a 3a 4a 5b 6a 7a 8b", 24.11.2026). On the interim review page of 24.11.2026 the user okayed the merges of stage 1 and the spike, and the answers on the spike's open questions became #75 to #80. Four pull requests to `master`:

- #73 (S1, lane b, merge 0dca220, 24.11.2026, closes #65)
- #74 (lane a, the Gen 5 spike, merge 4e43940, 24.11.2026, closes #72)
- #81 (S2, lane b, open, head f03a9f2, closes #66, #67, #68)
- #82 (S3, lane b, open, head 2250a1c, stacked on #81, closes #70 and #71, builds #69 except the emulator page's line after END)

`wave/05` started from `master` at db7c612 (wave 4 merged) on 24.11.2026. Its first commit (24ed714) records the wave 4 gate in wave 4's booking, the plan and ADR 0003. Lane b, the cleanup, ran three stages on `wave/05-s1b`, `wave/05-s2b` and `wave/05-s3b`; each merged into `wave/05` and froze there as `wave/05-s<k>`. Lane a, the spike, ran beside stages 1 and 2 on `wave/05-s1a` and reached `master` as one squashed commit (W5-43). The working files sit under `.waves/05/` (gitignored); this booking keeps what lasts.

## Goal

Two lanes. Lane b finishes milestone 2's code with the seven issues the wave 4 gate approved (#65 to #71, the proposals P1 to P7). Lane a runs a time-boxed Gen 5 spike (#72) beside it from the start (answers 5b and 7a). Milestone 3 waits for the cleanup; its first formats are Gen 4 OU and Gen 5 OU, then Gen 9 OU with Tera, then Gen 6 to 8 (answer 6a). The order the user gave in wave 4 stands: "Milestone 3 first and then let's dive into Gen 5. These can actually be worked on in parallel."

## Delivered

### S1, lane b: the game's own move animations, charge turns, hidden users and Castform (#65)

- The animation turn: 33 moves have two animations, and the viewer played the first. The stream's MOVE now carries the turn the game's engine passes (`animTurn`), and `src/gen3/translate/anim-turn.ts` picks it: 1 on a two-turn move's hit, on Curse by a Pokémon that is not a Ghost, on Brick Break through a screen and on the hit of Future Sight and Doom Desire; Swallow passes its Stockpile count. 18 tests inside the game's engine (`rom/gen3/test/replay_anim_turns.c`) pin the turn or the order per case. The later hits of Double Slap and Triple Kick, Bide's unleash and Pursuit on a switching target stay at 0, as the engine plays them.
- Charge turns: a two-turn move's first turn plays the set-up animation and the game's line, from `src/gen3/tables/charge-turns.json` (17 moves), generated from the pinned `gMovesInfo` and held equal by a spec. In sun Solar Beam says its line, charges and fires in one turn. Skull Bash plays its animation before its line.
- Hidden users: Fly, Dig, Dive and Bounce hide their user on the charge turn. When the hit turn hits nothing or never starts, the new op SHOW_MON (0x16, `side u8`) shows the user again after the line that says so, as the game does. One module writes it (`src/gen3/translate/hidden.ts`, 18 spec cases). A hit on the hidden Pokémon leaves it hidden. Six engine tests in `rom/gen3/test/replay_hidden.c` play the cases.
- Lines that showed nothing: `-ohko`, `-copyboost`, `-singlemove`, `-notarget` and `|message|` get rules and the game's lines. Pain Split moves both bars and says "The battlers shared their pain!"; White Herb pops up and resets the stages; Mud Sport and Water Sport print their lines. Team Preview lines drop as `preview` and `|custom|` as `format`. The census' group "no rule yet" is empty.
- Castform: the new op FORM_CHANGE (0x15, `side u8, species u16`) plays Forecast as the game does, with the pop-up, the change and "Castform transformed!". A Castform that left in its Sunny form enters in its base form. A team member now takes the species of its switch line, so a log that ends on a changed form no longer puts that form into the team table.
- Stream version 3: MOVE has five bytes. The ROM and the decoder refuse versions 2 and 4, and specs hold both sides' order rules equal. No upstream file and no patch changed.
- Two ladder replays join the test replays, ten in all: `gen3ou-2718507084` (Solar Beam in sun, Curse by Regirock) and `gen2ou-2718267553` (Destiny Bond, Curse by Snorlax).
- `GLOSSARY.md` names the charge turn, the animation turn, the hidden user and the drop reasons `preview` and `format`.
- Two reviews: the first found the hidden sprite after a missed Fly (W5-26), fixed in steps 65-8 to 65-10; the second found four code points, fixed in 65-11 (W5-34).

### S1 and S2, lane a: the Gen 5 spike (#72)

- Black 2 (USA) boots in EmulatorJS 4.2.3's melonDS core in headless Chromium, with no BIOS or firmware file. The core falls back to FreeBIOS; the builder read that in its source.
- The page finds the DS's main RAM in the core's heap by content in 3 of 3 runs, and reads and writes the game's memory there.
- An input macro with RAM checks and a fixed clock took the game from New Game into its first battle, Tepig against Hugh's Oshawott, in pieces played from states saved under earlier versions of the macro. From boot the final macro stalls at frame 23,270 (S9, W5-45).
- In that battle the page holds the game's battle server and writes blocks of the game's own server commands into the player's battle adapter. The game plays them: "Tepig used Tackle!", the move's animation, the HP bar falling to the given value, "It's super effective!". Two blocks ran one after the other with no button press. The game decided nothing: one Tackle took Oshawott from 20 HP to 1, and in a second run both Pokémon used moves they do not know.
- `scripts/gen5-bw2.ts` reads pokebw2 at its pinned commit from the gitignored cache into the untracked `build/gen5/bw2.json`. The code reads the game's numbers from that file at run time, and the specs use invented code and numbers (S8).
- SkyEmu v5's native build crashes at start in its HTTP server mode, an open upstream issue. Its web build (MIT) boots the dump to the title screen at about 4.5 frames per second on the build machine (S3b, no commit).
- A built Gen 5 page with a static server, controls for the speed cap and the thread core and a "Copy figures" button, for the user's own speed check (S2b, W5-19).
- `docs/gen5-spike.md` answers #72's five questions and holds seven proposals for the gate. AGENTS.md gains one line in its project list, and `knip.json` one entry.
- The review found copied lines of pokebw2 in a spec's fixtures, a claim about the route that the runs did not show and hand-written offsets; S8 and S9 fixed them (W5-42 to W5-44).

### On `wave/05` between the stages

- 9502b36 and 96c1cab: AGENTS.md makes every gate and every decision put to the user a review page with things to show, with pictures of each question whose subject shows on screen.
- cc39848: the label `area: gen5` joins the issue areas.
- Issues filed in M6 from the interim review's answers: #75 (a lint zone and coverage threshold for `src/gen5/`), #76 (the trainer's hint line), #77 (CI generates pokebw2's numbers at its pin), #78 (a save file before a trainer), #79 (the GPL's notice and a source offer), all approved, and #80 (a clean dump of Black 2), parked with the trigger "before the first ROM built from pokebw2, or before DSi mode".

### S2, lane b: divisions the GBA survives, item and move lines, Transform, B and the outro (#66, #67, #68)

- #67, items: Berry Juice heals with its pop-up and animation and no line. A berry eaten for confusion alone plays no pop-up and prints the game's "snapped it out of its confusion!" with the berry's name; a Lum Berry that cures a status and confusion together names itself there too.
- #67, moves: Pursuit's activation prints the game's "come back" line, and the switch after it prints none. Rage says "X's rage is building!" after its Attack raise, in Gen 1's log shape and in Gen 2's and 3's. Doom Desire's start and hit and Mist's start print the game's lines. A spec pins Brick Break's order: the side's "wore off!" line after the animation and before the hit.
- #67, "Not shown": a dropped line of a kind on the census' named list shows that kind's reason. The test-replay spec holds a named list of allowed phrase fallbacks, and a fallback off the list fails it.
- #68, Transform: the copy takes the transformed mark, the target's personality and its shininess before the animation, as `Cmd_transformdataexecution` sets them under the pinned `B_TRANSFORM_SHINY`. A shiny target's copy draws the shiny colours, and a Spinda copy keeps the target's spots. Five replay tests in `rom/gen3/test/replay_transform.c`.
- #68, B: the interpreter marks the recorded battle's playback as finished when it takes over, so B does nothing from the first frame to END and after it. The shot run `hand-made-b` holds B from the first frame in both engines. A held B does not speed the text, so the run equals `hand-made` frame for frame.
- #68, the outro: END stops the low-HP beep at every outcome. Five outro tests cover a tie and an unknown end with both Pokémon out. The outro's step stays inside its table, its start hook runs once, and WITHDRAW and the outro return a Pokémon through one helper.
- #66, the runner: `wasm:run` plays every stream it is asked for; a trap, a hang or a failed check fails that stream alone, and `--all` plays every test replay. A stream the baseline lacks gets the line "no baseline: frames not compared" (W5-38).
- #66, the rewrite: `scripts/wasm-divide.ts` turns each 32-bit and 64-bit division and remainder outside eight helpers into a call of its helper, through Binaryen's text form. The helpers (`rom/gen3/wasm/src/irv_wasm_divide.c`) return what the ROM's libgcc returns, from traced values (W5-47). `wasm:build -- --link` runs it after the plain link: 2,085 sites become calls in 17 s. The tool refuses a module with a missing helper, a helper of another signature or a division in a shape it does not know.
- #66, the send-out streams: `scripts/wasm-sendouts.ts` reads the pinned tree's animation tables and sends out one species per front animation and one per back set: 135 send-outs in 17 battles (W5-49).
- The review found wording faults alone; one fix step corrected the docs, a spec comment and a test title. A tester then played the changed scenes in a real browser.

### S3, lane b: pages that say what happened, a per-op frame log, a random battle (#69, #70, #71)

- #69, Start is disabled from its click until the run begins or fails, so a second press during the build starts nothing.
- #69, a failed pick during a run ends with the replay the game holds: the viewer says "The game plays on with {replay}." until END, and the emulator page says "The game keeps {replay}." (W5-54, W5-57). `pickFailureLine` in `src/web/visitor.ts` holds the rule.
- #69, the example select shows labels such as "Gen 3 OU: A Welcome Guest vs xXEricXx (994052)". `node scripts/web-examples.ts` copies each test replay's format and players into `src/web/example-replays.json`, and a spec holds the file to the replays.
- #69, the stream's byte count and the patched ROM's SHA1 left the status line for "Details".
- #69, sound: when the browser refuses to resume the sound on Play, the game plays on and the line says "It plays without sound: the audio did not resume: {the browser's words}."; a later Play that resumes gives "Running {id}." back. A Start during a pause takes the paused run's sound off the speakers first. Restart on the emulator page resumes the sound inside the click (`src/web/emulator-presses.ts`).
- #69, not built: the emulator page's line after END. mGBA's package offers the page no memory read, and the ROM marks END in its RAM alone (W5-56).
- #70: `SpikeView`, `findSpikeView`, `createSpike`, `irvWasmSpike` and `e2e/wasm-spike.spec.ts` became `WasmView`, `findWasmView`, `createViewer`, `irvWasmViewer` and `e2e/wasm-play.spec.ts`. The line for a page outside a secure context names no machine. `runningLine` and `progressLine` moved into `src/web/status.ts`, and a spec holds the README's quoted line to `PLAYED_FORMATS`.
- #71, the per-op frame log: both engines write the frame on which each op starts (`LogOps` in `rom/gen3/shot/replay_shot.c`, `OpClock` in `scripts/op-frames.ts`). `node scripts/op-frames.ts <stream>` names the first op whose start parts by more than 3 frames, counted from op 0. No ROM source changed.
- #71, `wasm:diff` compares a refused run's refusal screen as the scene `final`.
- #71, the far outro scene holds the trainer at the end of its slide with the probe `placed` (`scripts/rom-shot-placed.ts`), from the end position in the pinned tree.
- #71, the test-replay rule admits Gen 1 to 3 random battles (`TEST_REPLAY_ID`), and `gen3randombattle-2717609379` joins with 36 TRAP_TURN ops from Wrap: eleven test replays.
- The review found one rare bug in new code (a paused run stayed muted after two presses that began no run) and the missing stage-end run of every replay. Fix step A took the bug and a browser test of the emulator page's failed Load; fix step B took the tester's two wrong texts.

## Evidence

The check lines give coverage over all of `src/`; an exit of 0 shows that each of `src/script/`, `src/gen3/` and `src/patch/` stayed at 90 % or more.

- S1 at 65-10 (0ef3429): ROM SHA1 `35fe716ee0026fc8ad0a868cd35c777d152bded1`, patch 18,392,347 bytes (14,488,033 with brotli). Module 25,974,028 bytes; module patch 20,970,811 raw, 15,597,567 gzip, 14,159,126 brotli; the viewer fetches 14,161,963 bytes with brotli. hand-made, 994052 and both refusals equal wave 4's baseline on every frame (END 2916 and 40981, refusals at frame 31).
- S1, all ten test replays reach END in both engines, every scene passed:

  | Replay     | END in mGBA | END in the module | Scenes |
  | ---------- | ----------- | ----------------- | ------ |
  | hand-made  | 2923        | 2916              | 13     |
  | 994052     | 40974       | 40981             | 13     |
  | 995161     | 32784       | 32711             | 12     |
  | 993907     | 132991      | 133202            | 12     |
  | 2717564545 | 25677       | 25643             | 12     |
  | 994086     | 95592       | 95326             | 13     |
  | 994128     | 91965       | 91992             | 13     |
  | 994141     | 99086       | 98969             | 13     |
  | 994176     | 158763      | 158491            | 13     |
  | 2718507084 | 41434       | 41327             | 12     |
  | 2718267553 | 40223       | 40217             | 12     |

  A replay with 12 scenes holds no weather that an ability starts.

- S1, hand-written streams through the module: Fly 95 of 95 ops and Dig 40 of 40, END 7091 and 3195, 37 shots equal to mGBA's to the pixel. Castform's stream reaches its end in both engines (3300 in mGBA, 3306 in the module); 24 pixels differ, the gender symbol of a Castform whose log names no gender.
- S1 at the head (7aa5bb2): `rom:check` 175 of 175; e2e 23 of 23 in 6.4 minutes; `npm run check` 160 files, 2621 tests, 99.79 % of lines, 97.22 % of branches. CI green.
- S1 limits, as #73 states them: no test replay holds a form change, Pain Split, White Herb, a one-hit KO, Psych Up, Brick Break through a screen, Future Sight, Doom Desire, Swallow, Fly, Dig, Dive or Bounce; specs, engine tests and the hand-written streams hold them. Chromium played hand-made and 994052; the other replays ran through the module in Node.
- S1 reviews: 33 confirmed, 6 wrong, 4 unclear on the first pass; 39 confirmed, 10 wrong, 2 unclear on the second, nothing blocking.
- Lane a, speed on the build machine (frames per second; the DS runs 59.83): the title screen 7.3 to 9.7 at 1x and 11.1 to 12.6 uncapped (S2); with vsync off 9.9 and 10.7 (S2b). One headless run through the user's page with no other heavy run beside it played the opening at 30 to 35, against 11 to 19 under another session's load. The notes read that as the load halving the earlier figures.
- Lane a, memory: Chromium's processes hold about 1.9 to 2.0 GB on the title screen, peak 2475 MB while loading. Download: the Gen 5 page fetches 1,378,307 bytes with brotli. A block of server commands took 271 to 486 frames.
- Lane a, the route: two runs from boot agree at all 179 marks both reached; two runs from a state are identical. A run from boot needs about 24 minutes on the build machine.
- Lane a checks: `npm run check` on 07a8534 183 files, 2654 tests; CI green on the squashed branch. Review: 24 confirmed, 15 wrong, 5 unclear.
- S2, ROM: SHA1 `83f1855f5b41bb415b0d91c3e629f8f396e7f123`, `rom:check` 186 of 186; `rom:shots` passes hand-made, hand-made-b, the ten test replays and the 17 send-out battles on every scene their streams hold.
- S2, the module: 25,979,168 bytes; its patch 20,976,006 raw, 15,600,456 gzip, 14,207,653 brotli; a visitor fetches 14,210,551 bytes with brotli. Every frame of hand-made, 994052 and both refusals equals stage 1's baseline. `wasm:run -- --all` 14 of 14. 993907 ends in the module at 133298 since the Pursuit line (133202 before), in mGBA at 133200.
- S2, the rewrite: 613 and 585 32-bit divisions, 394 and 480 remainders, 13 64-bit divisions. Native specs run the eight helpers on 100 traced cases (red 80 of 100 against stubs; green 111 of 111). Stage 2's whole module is 5,140 bytes larger than stage 1's and played 994052 about 1.5 % slower in two interleaved pairs, inside the spread of single runs.
- S2, the send-out battles reach END in both engines: 42,771 frames in the module, 42,618 in mGBA, each battle within 24 frames, no trap. A scratch build without patch 0011 plays 995161 to END 32711 with every frame equal, and the rebuilt module's SHA-256 equals the build before.
- S2 checks: `npm run check` 165 files, 2790 tests, 99.79 % / 97.32 %. e2e 23 of 23 in 6.1 minutes at 0347789; on the head 22 of 23, the Start-twice test counting two runs, then 3 of 3 for that test. CI green.
- S2 limits, as #81 states them: CI builds neither the ROM nor the module; #68's third criterion is met in part (`hand-made-b` equals `hand-made` in each engine and keeps hand-made's gap between them, END 2916 against 2923); mGBA's drift on 993907 has a likely cause that no run proves.
- S2 review: 42 confirmed, 14 wrong, 1 unclear. Tester, headless Chromium on a production build: nothing broken, no wrong text, one layout fault, four questions; both long replays reached END on the ledger's frames.
- S3 stage end at 0c957ca (the later commits changed no script logic, ROM source or module source): mGBA 15 of 15 runs, the module 15 of 15 streams. Module END frames as in stage 2 (994052 40981, 993907 133298, 995161 32711, 2717564545 25643, 994086 95326, 994128 91992, 994141 98969, 994176 158491, 2718507084 41327, 2718267553 40217); the random battle at 244,606 in mGBA and 244,573 in the module.
- S3, `wasm:diff` over every stream: 237 scene frames, 205 equal; the outro equal in all 13 playing streams; both refusal screens differ in 0 pixels. The far outro probe passes in both engines on the seven replays the far side wins.
- S3, the op-frame compare over the twelve playing streams: every step of the gap above 3 frames sits at a send-out or a switch-in, 44 frames at most; a move steps it by 3 frames at most, a stat change or an animation by 1. At END, counted from op 0, the module stands between 248 frames earlier (994176) and 120 frames later (993907). On 993907 each of Raikou's 16 entries takes the module 19 frames longer and each of Gengar's 4 takes it 40 frames shorter. A nature drawn differently in each engine fits this; no run read a nature, so the cause stays an inference. A second candidate: mGBA counts a frame whose work overruns as two.
- S3 checks at 75d2817: the whole browser suite 27 of 27, none skipped; `npm run check` 174 files, 2,899 tests, 99.66 % / 97.21 %. CI green on 976d22b and on #82.
- S3 review: 40 confirmed, 16 wrong, 6 unclear. Tester in a real browser on a production build: 0 broken, 2 wrong texts, 1 that looks off, 3 questions. Not tried: hearing the sound (an analyser measured it), Firefox, a phone and real Showdown.
- The browser tests run on the build machine alone, never in CI: about half need the dump and a ROM build.

## Decided without the user

Each entry gives the scene where one was weighed, the options, the choice and what a reversal costs.

- W5-1 The worktrees. The cleanup needs the ROM, the module and the object cache that worktree wb holds; the spike needs none. (a) cleanup in wa, rebuilding there, (b) cleanup in wb as lane b, the spike in wa as lane a. Chosen (b). Reversal: one ROM and one module build, about 45 minutes.
- W5-2 The spike's labels. (a) add `area: gen5` now, (b) file #72 under web, tooling and docs and add the label once the milestone goes on. Chosen (b). The interim review's answers then brought the label (cc39848). Reversal: one label.
- W5-3 #72's text: the integrator wrote it from the plan's open questions for milestone 6 and #35's form. Reversal: an edit of the issue.
- W5-4 Fixture runs per step. (a) every fixture after each step that changes a stream rule, about 7 hours of lock time, (b) every fixture after each module build and at stage ends, and a TypeScript step plays the fixtures whose snapshot moved. Chosen (b): an unmoved snapshot is the same stream bytes. Reversal: add runs at any step.
- W5-5 Stage cuts. (a) S1 #65, S2 #67, #68, #66, S3 #71, #70, #69, (b) four stages with #66 alone. Chosen (a): one module build and one run of every fixture cover #68 and #66. The cut held. Reversal: one more build and pull request.
- W5-6 Swallow and Triple Kick join #65's turn rule and engine tests. (a) include, (b) a rest. Chosen (a): the same rule and operand. Reversal: two rule cases.
- W5-7 #66's rewrite route. (a) `wasm-dis` and `wasm-as` with a line rewrite, (b) the `binaryen` npm package, (c) our own rewriter. Chosen (a) if it measured under about 4 GB and 5 minutes; 66-2 measured 256 MB at peak. Reversal: the tool's inside; its specs stay.
- W5-8 `hand-made-b` in the module. (a) `wasm:run` holds B by writing the key register each frame, (b) check B in mGBA alone. Chosen (a). Reversal: a few lines.
- W5-9 A fixture with Curse or a two-turn move. (a) a scout searches beside 65-1, (b) 65-5's builder searches. Chosen (a). Reversal: none.
- W5-10 The emulator to start with. (a) EmulatorJS's melonDS, (b) SkyEmu's web build, (c) desmume-wasm. Chosen (a): prebuilt, with states, and Black 2 battles run in it. Reversal: the page loads another core.
- W5-11 How the emulator's files arrive. (a) a fetch script into `.cache/gen5/` with pinned integrity, (b) npm dependencies. Chosen (a): a GPL package among the dependencies is the milestone's call. Reversal: two lines in `package.json`.
- W5-12 knip and the spike. (a) one `entry` line in `knip.json`, (b) scripts and a Vite input that ships the page. Chosen (a). Reversal: one line.
- W5-13 pokebw2's numbers. (a) generated at run time into `build/gen5/`, nothing committed, (b) a committed table with a spec. Chosen (a); the interim answer 6a confirmed it. Reversal: the gate's question on the backend.
- W5-14 The route into a battle. (a) an input macro from New Game, (b) a save file, (c) a state the user makes for the build machine. Chosen (a). The interim answer 4a replaced it for a real page: a save file before a trainer and a short macro, with the long route kept as a development tool (#78).
- W5-15 A lint zone and coverage for `src/gen5/`. (a) with the milestone, (b) now. Chosen (a), a rest for the gate; it became #75. Reversal: two shared files.
- W5-16 Which of the user's two dumps the spike runs. (a) one in DS mode, (b) the other. Chosen (a): its DS code matched the retail code at every point checked. Reversal: one environment variable.
- W5-17 Which scouted replays join at 65-5. (a) the Gen 3 replay alone, (b) both. Chosen (b): together they hold real lines of three of the fifteen kinds and a non-Ghost Curse in Gen 2 and Gen 3. Reversal: one fixture and its snapshot leave.
- W5-18 The gap between 1x and uncapped. (a) one boxed run with the core's pacing switched off, (b) leave it to the user's devices. Chosen (a). The run found vsync on by default; turning it off gained about one frame per second. Reversal: none; a measurement.
- W5-19 A step S2b for the user's speed check. The dev server reloads after a phone's file picker, and an `accept` filter greyed the dump out on Android Firefox before. (a) a built page with a static server, visible controls and "Copy figures", (b) the dev page and the PC's figures alone, (c) leave it to the gate. Chosen (a): the phone decides whether a browser route exists. Reversal: none.
- W5-20 Engine tests for 65-5. (a) pin Solar Beam in sun and Doom Desire's hit before the TypeScript, (b) the reading stands. Chosen (a): the snapshot rows would rest on a reading. Reversal: none.
- W5-21 Frames of the new animations. (a) 65-5 shoots the Solar Beam and Curse turns and the builder looks at them, (b) wait for #71's frame log. Chosen (a): the issue named a fault read from the code with no run. Reversal: none.
- W5-22 The SkyEmu scripts after S3's crash. (a) keep them as a record, (b) S7 removes them, and the write-up keeps the finding. Chosen (b): a scene that never ran proves nothing. Reversal: `git revert`.
- W5-23 SkyEmu's web build with Black 2. (a) a step now, (b) one boxed step after S6, (c) leave it to the gate. Chosen (b): S4 to S6 answer the spike's main question first. Reversal: none.
- W5-24 The adapter's layout. (a) the script works the offsets out from pokebw2's struct into `build/gen5/bw2.json`, (b) named constants in `src/gen5/adapter.ts`. Chosen (a). Reversal: one module's inputs.
- W5-25 The stage end's e2e. (a) the whole e2e in 65-7, (b) the two module specs. Chosen (a): the stage goes to `master` and the example select grew. Reversal: none.
- W5-26 The hidden sprite. Stage 1's own change left a Pokémon invisible after a missed or blocked Fly. (a) fix it in stage 1 while version 3 is off `master`, (b) name it and fix it in stage 2 on version 4, (c) take the charge animation back. Chosen (a): Protect against Fly or Dig is common, and (b) costs a version. Reversal: the fix's own commits.
- W5-27 How the stream shows the sprite again. (a) a new op SHOW_MON, (b) a new volatile, which bends VOLATILE's contract, (c) a rule inside the ROM, against ADR 0004. Chosen (a). Reversal: one op in TypeScript and C and a module build.
- W5-28 SHOW_MON's operands. (a) `side` alone, (b) `side` and a visibility flag. Chosen (a): the game hides without an animation only when animations are off. Reversal: a new version once on `master`.
- W5-29 Gen 1's full paralysis during Fly or Dig, where the log keeps the user out of reach. (a) show it at the `cant` line with a `mechanic` fallback, (b) keep it hidden, (c) show it with no note. Chosen (a), as the Gen 3 game does. Reversal: one branch.
- W5-30 A future attack whose user's side is empty. (a) a `mechanic` fallback at that line if the engine test shows the animation, (b) a comment and a rest, (c) relax the order rule. Chosen (a). Reversal: small.
- W5-31 Yawn's sleep on a hidden Pokémon. (a) a comment, (b) code the case. Chosen (a). The second review corrected the reason: between the game's "fell asleep!" and the viewer's show lie the rest of the turn's end, the turn line and, when the foe is faster, the foe's whole move. The choice stands. Reversal: about an hour.
- W5-32 The e2e at the stage end runs again after the fix, 7 minutes. Reversal: none.
- W5-33 The fix runs as 65-8 (the op in the format and the ROM, engine tests), 65-9 (the backend's rule, frames, glossary) and 65-10 (the stage end). The integrator added a guard: a hidden Pokémon that plays another MOVE gets SHOW_MON first. Reversal: none.
- W5-34 The second review's code findings. (a) fix them in 65-11 before the pull request, (b) name them as limits. Chosen (a): about half an hour, and no ROM or module source changes. Reversal: its own commits.
- W5-35 #67's Lum Berry rule for a cure logged without `-enditem`. Showdown's simulator logs no such shape. (a) write no rule and say so, (b) write one. Chosen (a). Reversal: one rule.
- W5-36 Rules for log shapes today's Showdown never writes (`-curestatus … [from] item`, `-start|<mon>|Rage`). (a) keep them, since an older log could hold them, (b) drop them. Chosen (a). Reversal: two rules and their specs.
- W5-37 Step S3b's code. (a) tracked scripts with specs, (b) lane scripts, no commit, findings in the write-up. Chosen (b): the step is a measurement. Reversal: write the script into `scripts/` if SkyEmu stays.
- W5-38 A stream the baseline lacks. `--against-baseline` refused a run that named `hand-made-b`. (a) save a new baseline from stage 1's module, whose run stalls, (b) report such a stream as "no baseline" and fail only on a difference or a failed stream, (c) a flag that drops `hand-made-b`. Chosen (b): nothing drops in silence. Reversal: one branch in the runner.
- W5-39 The user's dumps in the public write-up. The builder's draft named the hashes of both files. (a) publish as written, (b) describe the working dump without a hash and leave the other out, (c) the working dump's hash alone. Chosen (b), done in the unpushed commit, so no pushed history holds the hashes. This booking follows the same rule. Reversal: one paragraph.
- W5-40 A Pokémon still hidden when its side wins leaves the outro with the ball's sparkle alone. (a) a guarded show step of about 12 lines now, (b) a proposal for the gate. Chosen (b): new behaviour outside #68 that costs a ROM build. Reversal: none.
- W5-41 The low-HP beep starts one HP op late. (a) fix it in 66-3, (b) a proposal for the gate. Chosen (b): it is in no issue's text. Reversal: none.
- W5-42 Lane a's review fixes. (a) one step, (b) S8 for code and specs, S9 for one run of the route and the write-up. Chosen (b): the run settles the route's claim with evidence. Reversal: none.
- W5-43 The copied pokebw2 lines in the pushed lane history. (a) fix forward and merge, (b) open the pull request from one squashed commit on the same base and delete the old remote lane branch, (c) rewrite twenty commits. Chosen (b): no reachable commit then holds the lines. GitHub serves the old commits by hash until it collects them. Reversal: push the old branch again.
- W5-44 The lane review's unclear points: the route's waypoints join the proposal on pokebw2's numbers, S8 rewrites the spec struct, the licence table gains the development tools, S9 rewords two sentences. Reversal: none.
- W5-45 The route's stall from boot. (a) one more step that fixes the macro and reruns, about an hour of the queue, (b) say what is shown and put the fix into the proposal on the opening. Chosen (b): #72's four boxes are met, and the gate may choose a save file. Reversal: one builder step.
- W5-46 The sanitized link. (a) the rewrite on the plain link alone, (b) on the sanitized link too. Chosen (a): a trap there is the sanitizer's finding. A census run through it is a rest. Reversal: one call.
- W5-47 The 64-bit remainders. The ROM links no 64-bit remainder helper to copy values from. (a) take `__moddi3` and `__umoddi3`'s values from the libgcc archive the ROM's map names, (b) compute them over our own division helpers, which differs by zero, (c) drop them from the contract. Chosen (a): the ROM would link those two, and the pushed tool stays. Reversal: two helper bodies and their specs.
- W5-48 A save game from online, the user's note on interim answer 4. (a) use one on the build machine for speed and ship a save we make, (b) ship the downloaded one, (c) make our own from the start. Chosen (a): what the page ships has a clear origin. Reversal: one file.
- W5-49 One send-out stream or several battles. A team holds six Pokémon. (a) several battles at version 3, (b) a nature field or a party-slot op at a new version, which reaches all 78 back variants. Chosen (a). Reversal: (b) as its own issue.
- W5-50 pokebw2's numbers in `docs/gen5-spike.md`, which is on `master`. (a) keep them as the spike's record, (b) #77 replaces each by its name, (c) edit the write-up in this wave. Chosen (b): the ruling covers documents as it covers code. No history is rewritten. Reversal: put each value back.
- W5-51 The M6 drafts' design choices, each open to move when its lane plans: #79 keeps the pinned fetch, serves the source archives from the page's host, names the core's commits first or builds the core, and puts the notice above the file input; #78 keeps the save in `src/web/gen5/saves/` with its record in `docs/gen5-save.md`, picks the trainer by rules and caps the macro at 1,800 frames; #80 is a small fix without White 2; #77 fetches sparse at depth 1 with no cache, sets thresholds for "blocks", puts the real-number spec in `scripts/` and moves the client positions and trigger rows into the generator; #76 never writes the action-selection command; #75's zone refuses Node too. Reversal: one or two lines each.
- W5-52 Proving the nature draw behind the END gaps. (a) leave the inference and propose a personality fixed by the stream at the gate, (b) read each near Pokémon's personality in both engines, which needs a module change. Chosen (a): #71's criterion is met, and the remedy changes the ROM's behaviour, the user's call. Reversal: a later step reads them.
- W5-53 The machine's name in #70. (a) the issue's three places, (b) every mention outside the rules, roles, plan and bookings, about 30 lines. Chosen (a): the issue's list is what the user approved. Reversal: a later step swaps the word.
- W5-54 The emulator page's failed pick. (a) 69-2 wires the "plays on" line there too, (b) leave it. Chosen (a). W5-57 replaced its words after END. Reversal: one argument.
- W5-55 The replay summary's bytes. (a) leave the summary and propose it at the gate, (b) rewrite it in 69-2. Chosen (a): the issue names the status line. Reversal: none.
- W5-56 The emulator page's END line. It needs a signal from the ROM. (a) leave it out of stage 3 and ask on the stage's page, (b) build the ROM change now. Chosen (a): the stage changed no ROM source, and a new signal out of the game is a design choice. Reversal: none; the page asks.
- W5-57 The emulator page's failed pick after END, which W5-54's words got wrong. (a) "The game keeps {replay}.", true before and after END, (b) take the ending off, (c) leave it. Chosen (a). Reversal: one line and its spec.

## Gate

State on 25.11.2026, before the gate:

| Stage  | Lane | Issues        | Pull request | State                                                     |
| ------ | ---- | ------------- | ------------ | --------------------------------------------------------- |
| S1     | b    | #65           | #73          | merged, 0dca220                                           |
| S1, S2 | a    | #72           | #74          | merged, 4e43940                                           |
| S2     | b    | #66, #67, #68 | #81          | open; #68's third criterion met in part                   |
| S3     | b    | #69, #70, #71 | #82          | open, stacked on #81; #69 built except the line after END |

The user's answers during the wave:

- The interim review page (24.11.2026), "1a 2a 3a 4a 5a 6a 7a 8b 9a":
  1. a: merge #73 at 7aa5bb2; merged as 0dca220.
  2. a: merge #74 at 1a19db5; merged as 4e43940.
  3. a: EmulatorJS's melonDS, with a GPL notice and a source offer on the Gen 5 page (#79).
  4. a: a save file before a trainer and a short macro into the battle; the long route stays a development tool (#78). Note: "You might want to get a save game from online" (W5-48).
  5. a: go on with this dump; the clean dump becomes a parked issue (#80).
  6. a: commit none of pokebw2's numbers; CI fetches pokebw2 at its pin and runs the specs on the real numbers (#77). Note: "If this otherwise block us, commit though".
  7. a: the trainer's hint line (#76) and the lint zone and coverage for `src/gen5/` (#75).
  8. b: the speed figures come later; the next steps start without them.
  9. a: delete the spike's savestates except eight.
- Asked which reading of a request for review pages they meant, the user answered "A standing rule". AGENTS.md carries it.

Asked on review pages, open:

- The stage 2 page (24.11.2026), six questions: the merge of #81; #68's third criterion; patch 0011; pokebw2's numbers in the write-up (W5-50); three small fixes found in the stage (the Start-twice test, the "Not shown" row at phone width, "the backend" in a census reason); the outro of a replay without a winner.
- The stage 3 page (25.11.2026), five questions: the merge of #82; the emulator page's line after a replay's end; the labels in the example list; four wording points for one small fix; a written diagnosis of the frame gap between the engines.

Still waiting for the user: the phone runs for #47 and #49, the device checks of #56 to #59, two saved files for #56, #59's report link against the issue form, and the speed figures for the Gen 5 page (answer 8b).

## The next wave

A planner has cut wave 6 for the gate: the first newer format on Gen 3, the Gen 5 issues #75 to #79, and a batch of small fixes. The gate decides the cut, and its answers go into this booking.

## Rests

Proposals for the gate, grouped. Each line can start an issue proposal.

The viewer's pages:

- The emulator page still says "Running {id}." after the win, over a black screen (#69's item, W5-56).
- The replay summary above "Not shown" keeps "bytes of instruction stream" (W5-55), and the status lines name a replay by its id while the select shows its label.
- One example label carries a ladder player's name with a rude word, and at 390 px the closed select cuts the longest labels before their number.
- At 390 px a "Not shown" row breaks inside its log line after "|-", and a census reason tells a visitor that "the backend refuses those battles".
- The "plays without sound" line carries the browser's own message after two colons.
- A sound line that follows a pick during a pause replaces the pick's line.
- A double click on Start during a run restarts the run twice and leaves one live run.
- Sound samples skip right after a run at Fast reaches END; the random battle at Fast skipped 763,088.

The script and the backend:

- The census type still holds the empty group "no rule yet", and the glossary's "Named list" still names it.
- In Gen 1 a confused hidden Pokémon behind a Substitute logs no damage for its self-hit, so the viewer shows it about a turn late.
- Yawn's sleep on a hidden Pokémon shows it later than the game (W5-31).
- A hit turn whose result starts with an ability pop-up over a `fail` would show the Pokémon before the pop-up goes; no Gen 1 to 3 log shape found does this.
- The charge MOVE names its user as the target where the game passes the foe; nothing differs on screen today.
- A future attack that hits while its user's side is empty plays no animation; the game plays it from the empty position.
- Haze prints its line and the ROM keeps the old stat stages, so a later White Herb raises them from a stale value; nothing on screen differs.
- A log that names no gender, every Gen 1 log among them, gets a random gender symbol, which can differ between the engines.
- No engine test pins Power Herb, the other two-turn and multi-hit moves or a snatched Swallow.

The ROM:

- A Pokémon still hidden when its side wins leaves with the ball's sparkle alone (W5-40).
- The low-HP beep starts one HP op late after a drop into the red and stops one op late after a heal (W5-41).
- The outro of a log without a winner keeps the last battle line in the box.
- No test checks a Spinda copy's spots after a substitute reload.
- A personality fixed by the stream would prove the nature inference and close the END gap between the engines (W5-52); a nature field would also reach every back variant (W5-49).
- The far outro check reads the shot 150 frames after END and holds while the returns take under about 99 frames; no run measured them.

The WebAssembly build and its checks:

- Patch 0011: the rewrite alone covers its trap; keep it as the sites' record or drop it.
- A census of every division site through the sanitized build (W5-46).
- No spec runs the real helpers compiled to WebAssembly on their values; the text stand-ins prove the routing.
- A rewrite that throws leaves an unrewritten module on disk for a later patch-only build.
- A live trap through the runner's two child processes has not run.
- A probe link to tell whether a stack overflow traps; the mirrored RAM has no guard.
- The send-out streams write their own "Go!" lines beside the phrase module, and the send-out spec and `rom:shots` can read different trees when the tree's override is set.
- The op-frame compare has no npm script.

Gen 5:

- Whether the working dump's hash goes into the write-up (W5-39).
- The final macro stalls from boot at frame 23,270 (W5-45); #78 may replace the route.
- `GLOSSARY.md`'s "Base ROM" assumes a patch, and Gen 5 runs unpatched; `docs/plan.md`'s roadmap step 6 still lists the emulator and the save file as open.
- FreeBIOS stands confirmed from the core's source alone, and the gap between 1x and uncapped stays unexplained after S2b.
- SkyEmu's web build: which of the two RAM bases is live is open, and no battle, write or state ran in it.
- The watch logs only while an until step waits.
- The local branch `wave/05-s1a` with the spike's step history: keep or delete after the merge.

Tooling and docs:

- About 30 lines of developer comments and docs, among them older sentences in `docs/wasm-spike.md`, still name the build machine (W5-53).
- `scripts/rom-tree.test.ts` timed out once at a load of 8.6 and passed alone.

Wave 4's rests that stayed keep their triggers in `wave-04.md`.

## Notes

- The heavy-check lock is shared with another project on the build machine, which can hold it for hours. It held it from about 06:28 to 08:45 on 24.11.2026; the Gen 5 page build waited 1 h 37 min, one `rom:check` timed out after 7000 s and passed on the rerun, stage 1's end waited 80 minutes, and S5 took about seven hours with the queue. W5-4 and W5-45 each turned on that cost.
- The stage 3 reviewer found the stage-end run of every test replay through both engines missing: the stage built no ROM and no module, and the run was left out. It ran before the pull request, with the frame diff and the op-frame compare over every stream, and the brief's rule asks for it at every stage end.
- Since the interim review every gate and decision put to the user comes as a review page with pictures and things to open on the user's devices (AGENTS.md, 9502b36 and 96c1cab). The stage 2 page carried 13 pictures, the stage 3 page twelve.
- The testers needed a production build with the stage's game files and a preview of their own, so a lane's build could not move files under them; hand-written logs for scenes no test replay holds; and pictures saved for the review page. They could not hear the sound or press B in the viewer, which sends no keys.
- The integrator scanned each hand-back for leaks before its push. Twice it rewrote unpushed commits: 66-4's spec titles and messages named the build machine, and the write-up's first dump section named the dumps' hashes (W5-39).
- Lane b's clean room from wave 4 bound every agent that touched `rom/gen3/wasm/`. The 64-bit trace ran the ROM's own helper bytes in a CPU emulator library in a scratch environment, with no emulator source opened.
