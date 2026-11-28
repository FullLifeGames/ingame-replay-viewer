# Wave 6: newer formats on Gen 3, the cleanup's last fixes, and Black 2 playing a replay

Issues of four milestones: M2 (#90, #91, #92, #94, #104), M3 (#26, #86 to #89, #98, #103, #105, #117), M6 (#75 to #79, #93, #97, #106 to #111, #119) and M8 (#118). The user set the course at wave 5's gate and on the one review page of 25.11.2026; later answers on that page added the direct battle start (#97), the Gen 5 backend (#106 to #111), the HP numbers spike (#119) and #118. Sixteen pull requests to `master`, each from one lane's branch:

- #83 (S1, lane a, merge 0449db2, 25.11.2026, closes #75 and #76)
- #84 (S2, lane a, merge 703d099, 25.11.2026, closes #78)
- #96 (S3, lane a, merge 698c728, 25.11.2026, closes #77; part of #79)
- #99 (S4, lane b, merge 0363240, 25.11.2026, closes #86 and #87)
- #100 (S5, lane b, merge 2c9425a, 26.11.2026, closes #90, #91, #92, #94)
- #101 (S6, lane b, merge 7aed658, 26.11.2026, closes #88 and #26)
- #102 (S4, lane a, merge 7338d1c, 26.11.2026, closes #93 and #97; part of #79, which stays open and parked, W6-99)
- #112 (S5, lane a, merge 3d90ee5, 27.11.2026, closes #106)
- #113 (S7, lane b, merge 56ed1f9, 27.11.2026, closes #89)
- #114 (S6, lane a, merge 68ab386, 27.11.2026, closes #107)
- #115 (S8, lane b, merge 378d955, 27.11.2026, closes #98, #103, #104, #105)
- #116 (S7, lane a, merge 3abb3a2, 27.11.2026, closes #108)
- #120 (S9, lane b, merge b252b7f, 27.11.2026, closes #109)
- #121 (S11, lane b, merge bcec9cc, 27.11.2026, closes #117)
- #122 (S10, lane a, merge 93dc61c, 28.11.2026, closes #110 and #119)
- #123 (S12, lane b, merge cc7c440, 28.11.2026, closes #111)

Wave 5's booking reached `master` beside them as #95 (merge 6fe9c9b, 25.11.2026).

`wave/06` started from `master` at 4e43940 (wave 5's stage 1 and the Gen 5 spike merged) on 25.11.2026, before wave 5's gate had its answers (W6-1, W6-2). Lane a, the Gen 5 lane, ran in its own worktree for the whole wave; lane b, the Gen 3 lane, joined in a second worktree from stage 4 on. Each stage branched from `wave/06` as `wave/06-s<k>a` or `wave/06-s<k>b`, with three exceptions: `wave/06-s9b` and `wave/06-s12b` started from lane a's branch, since #109 and #111 build on Gen 5 work that was not yet in `master` (W6-128, W6-146), and lane a's stages 5 to 13 each took a new branch for one backend issue (W6-117). Every stage reached `master` through one pull request whose head was its lane branch, and after each merge `wave/06` took `master` back. The working files sit under `.waves/06/` (gitignored); this booking keeps what lasts.

## Goal

The user's course from wave 5: "I wanna finish Gen 3 though an M2, so let's have a full cleanup, but then focus on the next milestone, specifically heading to the extended dex and Gen 5", and for milestone 3 and Gen 5: "These can actually be worked on in parallel." Lane a builds the approved Gen 5 issues in order: the lint zone and the hint line (#75, #76), pokebw2's numbers in CI (#77), the save before a trainer (#78) and the GPL notice (#79). Lane b opens the newer formats on Gen 3 by generation, Gen 4 OU and Gen 5 OU first (#86, #87), then the batch of small fixes (#90 to #92, #94), then Gen 9 OU (#88, #89). The one review page grew the goal three times: Black 2 starts its battle directly from power-on through a routine of ours (#97, answer `entry-direct` a); the Gen 5 backend plays a whole Gen 5 OU replay in Black 2 and the Gen 5 page plays it by itself (#106 to #111, answer `gen5-cut` a); and the lines Black 2 lacks get printed in its text box (#118, answer `gen5-missing-lines` a).

## Delivered

### S1, lane a: the lint zone, no hint line, pokebw2's numbers generated in CI (#75, #76, #77)

- #75: `src/gen5/` joins the lint zones and refuses the DOM, the emulator and Node; its folder total holds the 90 % coverage threshold like the other three folders.
- #76: the moment's steps end after the last block's answer and send no action selection, so the trainer's hint line and the action menu stay away.
- #77: `scripts/gen5-bw2-source.ts` fetches pokebw2 at its pin partially and sparsely, from one list of the files the code reads (`POKEBW2_FILES`). CI runs the generator with `--quiet` and runs `scripts/gen5-bw2-real.test.ts` on the real numbers, asserting names and booleans alone, since CI's log is public. The single battle's clients and positions, a move's line by its label and the route's places come from pokebw2 at run time; the hand tables left the code.
- The review found the game's setup table in three spec fixtures and list sizes in the quiet report; fix-1 gave the fixtures invented setups and took the sizes out (W6-21, W6-22).

### S2, lane a: a save before a trainer (#78)

- The Gen 5 page loads a save by `?save=<name>` from `/saves/` into an in-memory folder before the game starts, so no save reaches IndexedDB, and hides EmulatorJS's own save buttons. A run fails on a request with a body or one that leaves the machine.
- A macro played from the spike's rival battle to Route 20 and saved two tiles before Youngster Terrell's sight line. The save ships as `src/web/gen5/saves/route-20.sav`, recorded in `docs/gen5-save.md` and held by a spec; the tree spec takes our saves in that folder alone (W6-47).
- The short route continues from the save to the trainer's action menu, pressing A through the battle's opening (W6-48), and `scripts/gen5-moment.ts --save` plays a moment there in one session from boot. The trainer's tile comes from pokebw2 at run time by his name (W6-50).

### S3, lane a: the GPL's notice, a licences page with source archives, pokebw2's values named (#77, #79)

- `scripts/gen5-manifest.ts` lists every file the Gen 5 page serves from EmulatorJS's packages, with its components, licence and source by commit; both servers answer 404 for any other file, and a run fails on a request for one.
- `scripts/gen5-sources.ts` fetches each component's source at its commit and pins its tar by hash; both servers serve the archives under `/source/`. A generated licences page quotes each notice from a file at its pin and carries the GPL's text from melonDS's `LICENSE`. The notice stands above the file input.
- 77-5: `docs/gen5-spike.md` names pokebw2's values instead of quoting them, as the user answered (`bw2-values` a). #96 closed #77.

### S4, lane b: Gen 4 and Gen 5 singles play, with both teams listed (#86, #87)

- #86: Stealth Rock's set, hit and clears, Safeguard's block, Knock Off's user without `[of]` and Roost's turn take the game's lines or a named drop. The gate opens at Gen 4, the census gains the group "newer generation", and two Gen 4 OU test replays join.
- #87: Custap Berry's line and the Air Balloon's two lines print. At `|teampreview|` the script copies both sides' six into `script.preview`, and the viewer lists both teams in two columns under the canvas, far side first (W6-64). The gate opens at Gen 5 and two Gen 5 OU test replays join, the first that lead from a slot other than 0. Illusion stayed out as the parked issue #98 (W6-65).

### S5, lane b: replay labels, three outro faults, developer fixes, the sound skip's diagnosis (#90, #91, #92, #94)

- #90: every status line on both pages names a replay by its label, and the emulator page says "Started {label}.". The counts and the browser's own words sit under "Details". A double click on Start plays one run, and a "Not shown" row keeps its log kind on one line.
- #91: an unknown end clears the text box, a Pokémon still hidden at END shows on END's frame, the low-HP beep starts and stops with its HP op, and a test checks a Spinda copy's spots. Patch 0011 left the series; a module built without it played every frame of 36 streams equal to the baseline.
- #92: the slow specs got named limits and lighter setups, the census holds three groups, the send-out battles print "Go!" from the phrase module, a failed divide rewrite removes the plain link, `wasm:op-frames` joined the scripts, the division helpers run compiled to WebAssembly in CI (W6-89), and 38 lines in 21 files stopped naming the build machine.
- #94: `docs/sound-skip.md` proves the cause of the skipped samples after a run at Fast reaches END, with `wasm:sound-phases` to measure it.
- Beside the stage, an untracked diagnosis proved the frame gap between the engines: VBlanks in mGBA's boot advance the generator before the replay draws the personalities, and the nature picks a near Pokémon's back animation. Its remedy became #103.

### S6, lane b: Gen 9 OU plays, with Terastallization and snow as the game's lines (#88, #26)

- Terastallization prints the expansion's two lines, `[anim]` plays the move it names, an activation's target reaches Trick's swap line, and Neutralizing Gas, snow, Aurora Veil and the type change say the game's words. As One and Embody Aspect are found by display name.
- The gate plays Gen 1 to 5 and Gen 9 and still refuses Gen 6 to 8; two Gen 9 OU test replays join (W6-96). The fix round gave a type change the line its cause picks, named both Pokémon in Attract's and Lock-On's lines and took Switcheroo's two items to Trick's line (W6-101). #26's three items each hold with a spec.

### S4, lane a: Black 2 boots straight into a battle of six against six (#97, #93, #79)

- #79's unpacker: LZMA, LZMA2 and the 7z container in our own code under MIT, run by a worker of ours; EmulatorJS's `extract7z.js`, whose licence nobody could name, left the page and the manifest (the user's U1 answer a). The review's fixes bound every count and size a header names before any array is built.
- #97, the direct start: `rom/gen5/routine.c` (136 bytes, built with the ARM compiler into `build/gen5/routine.json`) holds no number of the game and takes each from its order block at run time. In the game's first frames the page writes the routine and makes the game run it as a proc of its own; it creates the game data and the trainer battle's setup, parks while the page writes both parties, the trainer's name, the style and the music, switches the displays on (W6-79) and hands over to the battle. `src/gen5/pkm-*.ts` seal and open a party Pokémon from a format the generator reads by name. The direct entry is the default; the walk needs `--entry walk`.
- #93: the generator reads the two clients and each side's setup index from pokebw2, and the hand constants left the moment script.
- 79-5: Emscripten 4.0.8 and zlib 1.3.1 join as components with full source archives, so every part of the core names its notice (W6-91).
- The fixtures rule: two fixture modules held real small offsets of pokebw2's layouts. `scripts/gen5-fixtures-real.test.ts` now fails by name on a fixture field at its real place, and the spec texts the generator's readers parse moved under it (W6-85, W6-98, W6-100).

### S5, lane a: a replay's two teams and names go into Black 2 (#106)

- `src/gen5/backend/` turns a battle script into a `Gen5Replay`: species, moves, items and abilities map by @pkmn's dex number to pokebw2's constants, held by a spec under CI; natures map by name; the revealed sets come from the script's events; a name takes the font's characters and the game's room. Each side's party order follows the first switch-ins (W6-113).
- `scripts/gen5-moment.ts --replay <id>` starts a battle from power-on with a replay's teams and trainers, and both Gen 5 OU test replays arrive "6 of 6 as written".

### S7, lane b: Terastallization and snow look as in the game (#89)

- The stream moves to version 4. Snow rides in the weather op with its animation each turn; the new op TERA (0x17) sets the party Pokémon's Tera type and the active gimmick and plays the charge, the tint and the activation between the two lines; the new op MOVE_TYPE (0x18) gives the next move its type, so Ivy Cudgel and Tera Blast take their looks from the `[anim]` hint (89-T, the user's `ivy-cudgel-look` a).
- `types.json` comes from the pinned `enum Type`, and a spec fails on a named fallback that no test replay takes, beside a list of the two named ahead (W6-105). The scene `first-tera` compares the Tera side's health box before and after the op (W6-108).

### S6, lane a: moves, hits and HP play as blocks of server commands (#107)

- The HP rule moved to `src/script/hp-scale.ts`, which both backends import. The generator reads the move lines from two text banks and the damage flow from the server's code.
- `src/gen5/replay-plan.ts` packs a block of named server commands and writes the next once the client answers; each kind copies the server's own sequence and names its function. A move into Protect sends its line alone, as the server removes the target first. `--scene hits` plays three blocks from the fixture's start.

### S8, lane b: Illusion's end, the last Gen 4 and 5 lines, the speed switch, one personality generator (#98, #103, #104, #105)

- #105: Toxic Spikes, Taunt's end, Quick Claw, Focus Sash, a weakening berry and the charges of Shadow Force, Freeze Shock, Ice Burn and Sky Drop print the game's lines where the game says them.
- #98: `|replace|` becomes the event `replace`; the stream withdraws the disguise silently, sends in the real Pokémon and prints "… illusion wore off!". Our interpreter keeps the game's own Illusion off at each switch-in and send-out (W6-121). Two Gen 9 random battle replays join: 19 test replays.
- #104: leaving Fast holds the worker to the new speed before its grant, so the burst of skipped samples after END is gone.
- #103: the ROM draws the replay Pokémon's personalities from a generator of its own, seeded as both engines boot, so mGBA's near entries now play the module's variants and the module keeps every frame of its baseline.

### S7, lane a: switches, drags and faints play (#108)

- A party state follows each send-in; a switch by choice, after U-turn or Volt Switch or by Baton Pass, a drag and a send-in after a faint each send the server's own commands, and a faint sends the line and the faint. `--scene switches` plays seven blocks, and a check reads both parties from RAM after each and compares them with the backend's order (W6-131).

### S9, lane b: status, stat stages, weather, hazards, items, abilities and Substitute play (#109)

- The generator's new key `effects` and 39 effect lines read where the server puts them. Status, stat stages, the field, items, abilities, Substitute and the moves' effects play as sequences of the server's commands; a weather's turn, which Black 2 shows with no command, lists a `line` fallback. `--scene effects` plays 16 blocks after `smogtours-gen5ou-862240`'s start.

### S11, lane b: Gen 5's Frisk and Mummy lines (#117)

- The battle script reads Frisk's holder and Mummy as an ability event that replaces the other ability; both backends play or list them, and a bare Skill Swap activation stays dropped (W6-144).

### S10, lane a: both Gen 5 test replays play whole in Black 2, and the HP numbers spike (#110, #119)

- #110: `replayPlan` plays a replay from the first menu to its last block and holds the last scene. `scripts/gen5-replay.ts` plays a test replay from power-on with its block report, marks file and the comparison of two runs; `docs/gen5-backend.md` records the runs. Solar Beam's charge plays, and kinds no test replay holds list the fallback `unplayed` (W6-132).
- #119: a probe proved one way to hide the HP numbers in the near box (way G: two bit writes once per battle on the numbers' sprite) with every other part of the box intact. `docs/gen5-spike.md` records it, and the question `gen5-hp-hide` puts it to the user.

### S12, lane b: the Gen 5 page plays a test replay by itself (#111)

- A picker before the dump opens on "None: start the game only"; with a replay picked the page boots through the direct entry and plays every block. The list of lines not shown sits beside the game from 56rem and under it on a phone, from a game-neutral module shared with the Gen 3 page (W6-152). Both Gen 5 servers serve the generated file and the routine under `/gen5-build/`, and the page's build output holds neither (W6-109).

### S13, lane a: print the lines Black 2 lacks (#118), in work

- Way C: the page empties the battle window's string buffer, sends one standard message carrying a neutral line of the game, and writes our text into the buffer after the game formats the carrier and before it prints. Steps done: the probe (118-P), the generator's `textBox` key (118-1), the backend's `print` rule for forfeit, win and tie with one block per page (118-2) and the printed block's steps (118-3). 118-4 runs.

## Evidence

The check lines give coverage over all of `src/`; an exit of 0 shows that each of `src/script/`, `src/gen3/`, `src/gen5/` and `src/patch/` stayed at 90 % or more. Every step ran its red specs before its code and its check before its push; CI ran green on every pushed head but one run, which failed on the runner's package source and passed on its rerun. The browser tests and every engine run ran on the build machine alone.

- S1, lane a: the check at 7698645 194 files, 2,840 specs, 1 skipped; `src/gen5/` at 99.74 % of lines and 97.43 % of branches. #77's time rule: the check job's median over five green runs went from 69 s to 71 s with the fetch, the fetch line 0.7 to 1.7 s. Sparse and full checkouts gave the same generated file at 77-1, 77-3 and 77-4, and the long route kept its 533 steps and their hash. Both moment scenes ran at the lane's head with no hint line at the end. Review: 29 Confirmed, 2 Wrong, 4 Unclear.
- S2, lane a: the save took 8 of the 15 runs W6-36 allowed, 61,957 frames from New Game to the save. From the title to the first frame the battle checks hold: 1,861 frames at 78-4, then 1,642 at 78-4b against #78's 1,800 (the route's limits add up to 1,718 at worst). Two runs from boot agree at every mark in frame and main RAM hash. Every run: requests all local, none with a body, no IndexedDB database. The check at 2617bad 204 files, 2,962 passed, 1 skipped. Review: 43 Confirmed, 4 Wrong, 5 Unclear; all nine criteria met.
- S3, lane a: the manifest's 37 entries, 35 served and 2 absent; two emulator runs with no fault. Six source archives, 83 MB, each holding as many files as its commit's tree; a fresh fetch gave byte-equal archives. The licences page fits 360 px, and the six source links answer 200. The check at 4d7756f 214 files, 3,072 passed, 2 skipped. Review: 23 Confirmed, 7 Wrong, 6 Unclear.
- S4, lane b, both engines on the new replays:

  | Replay            | Ops | Frames in mGBA | END in the module |
  | ----------------- | --- | -------------- | ----------------- |
  | gen4ou 690421     | 673 | 53,059         | 52,812            |
  | gen4ou 2719079523 | 286 | 23,499         | 23,302            |

  Both Gen 5 OU replays played every op (437 for smogtours-gen5ou 862240, 339 for gen5ou 2718717830) and passed every scene in both engines, with the right leads.

- S4, lane b, the stage end: `rom:shots` 19 of 19 runs in 23:22 and `wasm:run --all` 19 of 19 streams in 48:47, 217 scene checks per engine; no figure of an older replay moved against wave 5. The op-frame compare: 96 steps above 3 frames, 4 at a send-out and 92 at a switch-in, 44 frames at most. Browser tests 28 in 7.1 minutes; the check 223 files, 3,319 passed, 15 skipped; the build 7,813,295 bytes. With master in: 29 of 30 browser tests, the pace gate failing under load at base and head alike (W6-76). Review: 28 Confirmed, 3 Wrong, 4 Unclear.
- S5, lane b: the diagnosis matched the near entries' steps minus mGBA's overrun frames to the END gap with nothing left on four replays, and 130 of 130 other ops. #92's three checks beside a `rom:shots` loop each passed 3,563 specs, with smallest margins of 3,192, 2,047 and 2,796 ms. Without patch 0011 the module holds 25,979,511 bytes against 25,979,375 with it, and played 36 of 36 streams with 1,192,646 frames compared and 0 different; both engines passed 353 scenes; `rom:check` 194 of 194 after the fix step. #94: a draw held 200 ms skipped 105,258 samples, a quiet machine none. The browser suite passed 32 of 32 at the stage end, the pace gate at 59.09 frames a second (0.989 of the GBA's rate); after the fix round 33 of 34 (W6-93). The check 238 files, 3,583 passed, 30 skipped. CI ran the divide spec's 101 cases with a clang, the `lld` install 18 s. Review: 24 Confirmed, 4 Wrong, 9 Unclear. Tester: 0 broken, 1 wrong text, 1 looks off, 3 questions.
- S6, lane b: smogtours-gen9ou 886489, 629 ops, 46,218 frames in mGBA and END at 45,956 in the module; gen9ou 2719598518, 504 ops, 39,851 and 39,619; 12 scene checks each in each engine; `wasm:diff` 34 scenes, 31 equal. Browser tests 34 in 6.8 minutes; the check after the fix round 243 files, 3,698 passed, 30 skipped, no snapshot moved. Review: 27 Confirmed, 1 Wrong, 14 Unclear. Tester: 0 broken, 0 wrong text, 1 looks off, 4 questions; both Gen 9 replays at 1x and Fast to their win lines.
- S4, lane a, the unpacker: our decoder unpacked the four cores equal to a probe of the planner's, the plain core in 365 ms (median); the page's worker unpacked it in 420 and 629 ms, and the moment's frames came out byte-equal to 78-5's. Before the review's bound a crafted header took 51 s and 1.78 GB. Review of the unpacker: 18 Confirmed, 3 Wrong, 4 Unclear.
- S4, lane a, the direct start: power-on to the action menu in 936 frames (15.6 s at the DS's pace) with the save, against the walk's 4,146 (69.3 s); runs r3 and r4 agree at all 94 marks in frame, main RAM hash and picture. Without a save, six a side: the menu at frame 977; a double drew two a side; R4 equals R2 at 112 marks. #93's reader left both walk scenes (86 and 107 marks) and the direct run (112) equal. 79-5: Emscripten's archive 32.9 MB, zlib's 1.6 MB, a fresh fetch with the same hashes. Fix round A's guard flagged 83 names in the spec texts before their reorder; fix round B's runs agree at 112 and 86 marks with one picture per frame. The check with master in 283 files, 4,121 passed, 6 skipped; lines 96.17 %, branches 94.76 %. Review of #97, #93 and 79-5: 35 Confirmed, 4 Wrong, 7 Unclear.
- S5, lane a: probes R1 (every Pokémon at 100 HP, the bar's floor after a block), R4 (the game's own end for a win and a loss), R5 (a hold before the first menu) and R7 (form 1 draws the Therian formes). 106-4's runs from power-on with both Gen 5 OU replays, 1:07 and 0:58, both parties "6 of 6 as written". The check after the fix round 295 files, 4,225 passed, 8 skipped. CI's fetch with 55 files took 1 s. Review: 20 Confirmed, 4 Wrong, 7 Unclear.
- S7, lane b: `rom:check` 197, then 212, then 213. Version 4 left 16 of 17 streams equal but for the version byte. The stage end: ROM patch 18,393,150 bytes, module 25,979,888 bytes; 38 of 38 streams, 35 against the baseline with 1,192,615 frames and 0 different; 380 scene passes in each engine; `first-tera` 72 and 63 pixels apart in `wasm:diff`. The random battle once ran past the runner's 900 s budget under load and passed alone in 562.7 s. 89-T moved 886489's snapshot alone (7 MOVE_TYPE rows), and both engines played its 638 ops (47,043 frames in mGBA, END 46,779 in the module). Browser tests 34 of 34; the check after the fix rounds 277 files, 4,090 passed. Reviews: 17 Confirmed, 3 Wrong, 15 Unclear, then 21 Confirmed, 1 Wrong, 1 Unclear. Tester: 0 broken, 0 wrong text, 0 looks off, 2 questions.
- S6, lane a: `--scene hits` answered three blocks; the frames show Grass Knot, the bar falling, "It's super effective!", "A critical hit!", the miss line and Leftovers' heal. The check after the fix round 310 files, 4,369 passed, 9 skipped; lines 96.49 %, branches 94.85 %. Review: 25 Confirmed, 3 Wrong, 8 Unclear.
- S8, lane b: `rom:check` 215 after 98-3, 218 after #103. The stage end: 35 streams against the module's baseline with 1,192,615 frames and 0 different; all 40 streams pass, 403 scene passes in each engine; mGBA's END moved on 33 of 38 streams and the module's on none; the op-frame compare found 0 steps above 3 frames on 38 streams (129 at stage 7, up to 48 frames); the send-outs' 25 gender-sign frames differ by 0 pixels. #104 under a load of 8.5 to 11.6: the held gap at Fast 63 frames in the base and 1 with the fix; skipped samples 63,448 to 119,094 in the base and 8,440 to 8,932 with the fix, against 8,558 to 10,266 at 1x (W6-123). The check after the fix round 304 files, 4,336 passed; the browser suite 35 of 35 in one run. Review: 22 Confirmed, 2 Wrong, 14 Unclear. Tester: 0 broken, 0 wrong text, 1 looks off, 1 question.
- S7, lane a: `--scene switches` answered seven blocks in 4:53; after the fix round every block's RAM read of both parties matches the backend's order. The check 319 files, 4,501 passed, 9 skipped; lines 96.6 %, branches 95.02 %. Review: 27 Confirmed, 7 Wrong, 10 Unclear.
- S9, lane b: `--scene effects` answered 16 of 16 blocks in 7:22 with every party line matching. CI's sparse fetch grew by about 547 KB and its step took 3 s. The check after the fix round 335 files, 4,650 passed, 23 skipped; lines 96.78 %, branches 95.23 %. Review: 29 Confirmed, 2 Wrong, 16 Unclear.
- S11, lane b: the check 339 files, 4,666 passed, 23 skipped; three guard specs each shown able to fail. Review: 15 Confirmed, 1 Wrong, 2 Unclear.
- S10, lane a: the smoke run answered 30 of 30 blocks. The three full runs, each on its first try: R1 gen5ou 2718717830, 58 of 58 blocks in 22.6 minutes, the longest 875 of 3,000 frames; R2 the same figures in 23.9 minutes, all 968 marks agreeing with R1 by frame and main RAM hash; R3 smogtours-gen5ou 862240, 76 of 76 blocks in 29.1 minutes. The not-shown lists equal the replay spec's. #119's probe: 4 minutes 20 seconds, 11 of 11 relations true. The check 347 files, 4,743 passed, 11 skipped; lines 96.82 %, branches 95.13 %. Review: 29 Confirmed, 6 Wrong, 9 Unclear.
- S12, lane b: the page played R1's replay on the dev server in 23.6 minutes and from the build in 21.7, 58 of 58 blocks each, every one of 968 marks equal to R1's; the page's 137 rows equal the Node run's. The page's index chunk 2,019.71 kB (gzip 409.99) after the list moved to a game-neutral module, against 2,194.80 kB before. The check 358 files, 4,835 passed, 11 skipped; the import-cycle check found none over 249 modules. Review: 21 Confirmed, 3 Wrong, 13 Unclear; all six criteria met.
- S13, lane a, so far: the probe passed 55 of 55 truth lines; the check at 118-3 363 files, 4,887 passed, 11 skipped.

## Decided without the user

Each entry gives the scene, the options, the choice and what a reversal costs. Plain acceptances of a hand-back sit in one line per stage at the end.

- W6-1 Start #75 to #77 before wave 5's gate. Every cut the gate offered put them first in the Gen 5 lane. (a) start now, (b) wait. Chosen (a). Reversal: one unmerged lane branch.
- W6-2 Where `wave/06` branches. The Gen 5 files existed on `master` alone. (a) `master`, (b) `wave/05` with `master` in. Chosen (a). Reversal: one merge of `master`, which came in either case.
- W6-3 to W6-18 The stage 1 plan's D1 to D18 by recommendation (no D2, no D14):

  | No    | Decision                                                                   | Reversal            |
  | ----- | -------------------------------------------------------------------------- | ------------------- |
  | W6-3  | `src/gen5/` gets the folder-total threshold of 90 %                        | one key             |
  | W6-4  | `commandWrites` stays exported; its spec uses an invented command          | a refactor          |
  | W6-5  | the path list, the reader and the checkout in `scripts/gen5-bw2-source.ts` | a move              |
  | W6-6  | a sparse checkout with exact paths, so the tree equals the list            | one argument list   |
  | W6-7  | `--quiet` in CI; the real spec asserts names and booleans alone            | one flag            |
  | W6-8  | the check runs after a failed fetch, so lint and types still report        | one `if`            |
  | W6-9  | no stored credentials, no terminal prompt, a 3-minute step limit           | three lines         |
  | W6-10 | `--checkout <dir>` for the fresh-fetch proof                               | one flag            |
  | W6-11 | the route's places keyed by the first line each event's script shows       | the rows come back  |
  | W6-12 | only positions that equal an event's place move to the lookup              | per position        |
  | W6-13 | four rules without numbers stay in code, each naming its lookup key        | one reader per rule |
  | W6-14 | the time rule records the job medians and the step's own median            | none                |
  | W6-15 | no npm script for the generator                                            | one line            |
  | W6-16 | #77 in five steps, not three                                               | none                |
  | W6-17 | AGENTS.md keeps "not a game backend" for `src/gen5/` in this stage         | one phrase          |
  | W6-18 | the write-up names CI in its own section, so 77-5 holds or drops alone     | a move              |

- W6-19 The time rule's runs. Five runs with the step needed four reruns or four pushes. (a) rerun one green run four times, (b) measure on the stage's natural pushes. Chosen (b): no run exists only to kick CI. Reversal: none.
- W6-20 The fresh sparse checkout. The path that sets the list again on an existing checkout had never run. (a) keep the folder until 77-3 grows the list, (b) delete it as planned. Chosen (a); 77-3 proved the path. Reversal: none.
- W6-21 The game's real setup table in three spec fixtures. (a) invented tables, which also let the lookup specs fail, (b) rule the table harmless. Chosen (a), with no history rewrite: `master` held the fact before. Reversal: none.
- W6-22 The quiet report printed the sizes of pokebw2's lists into CI's public log, and each size gives away a list's last number. (a) drop them, (b) keep them and reword the rule. Chosen (a). Three CI logs keep the six sizes; the user ruled to leave them (`ci-logs` a). Reversal: two lines.
- W6-23 CI's path for a failed fetch never ran on GitHub. (a) a throwaway branch with a broken pin, (b) say so in the pull request. Chosen (b): a red run sends the user a failure mail for a test. Reversal: one probe push.
- W6-24 Plan #78 before the gate. (a) plan now, (b) wait. Chosen (a), with anything for the user on a page before a builder needs it. Reversal: one unmerged branch.
- W6-25 How the save gets made. (a) a macro from the spike's battle state, (b) the user plays 30 to 40 minutes by hand, (c) a save from online, (d) a save editor, (e) fix the long route first. Chosen (a), with (b) as the fallback after 15 runs: a download saves no step, and the shipped save must be ours. Reversal: none before the fallback.
- W6-26 to W6-44 The stage 2 plan's D1 to D20 by recommendation but D5 (D3 folded into D2):

  | No    | Decision                                                                                   | Reversal      |
  | ----- | ------------------------------------------------------------------------------------------ | ------------- |
  | W6-26 | the shipped save by `?save=<name>` from `/saves/`; the build machine's saves never served  | one fetch     |
  | W6-27 | an in-memory folder at the save folder, written before the game starts                     | one subclass  |
  | W6-28 | EmulatorJS's save buttons hidden and inert                                                 | two settings  |
  | W6-29 | against the recommendation: no hand-out button now; it costs the same 30 lines when needed | 30 lines      |
  | W6-30 | our `/saves/` rule answers before Vite in both servers                                     | one rule      |
  | W6-31 | the trainer is Youngster Terrell on Route 20                                               | one more run  |
  | W6-32 | the save has fast text and battle effects on                                               | one more save |
  | W6-33 | `scripts/gen5-route.ts` takes the new options                                              | a move        |
  | W6-34 | the short walk holds its direction with A every 20 frames (changed by W6-51)               | one place     |
  | W6-35 | over 1,800 frames: a save one tile closer, then the user                                   | none          |
  | W6-36 | the macro way stops after 15 runs or two builder sessions                                  | none          |
  | W6-37 | the file is `route-20.sav`                                                                 | a rename      |
  | W6-38 | the moment starts in one session from boot with the save                                   | one flag      |
  | W6-39 | the small town save stays in `build/gen5/saves/`, never committed                          | none          |
  | W6-40 | AGENTS.md gains one line for `src/web/gen5/saves/`                                         | one line      |
  | W6-41 | a request with a body fails the run                                                        | one branch    |
  | W6-42 | the request watch moves to `scripts/gen5-requests.ts`                                      | a move        |
  | W6-43 | `src/gen5/battle-entry.ts` holds the opening and the battle entry both routes share        | a move        |
  | W6-44 | the page checks that the save is not empty; a spec holds its size against the doc          | one check     |

- W6-45 78-1 as two steps. Three facts of the plan were inferences. (a) one builder, (b) 78-1a with one boot run that settles them, then 78-1b. Chosen (b). Reversal: none.
- W6-46 78-2's runs. (a) two sessions of eight, (b) sessions of six, each ending with a commit, 15 runs in all. Chosen (b); the save stood after 8. Reversal: none.
- W6-47 The tree spec refused every `.sav`, and #78 commits one, which ADR 0002 allows. (a) take a `.sav` in `src/web/gen5/saves/` alone, (b) drop `sav` from the names, (c) another extension. Chosen (a), as narrow as the `.gitignore` line. Reversal: one pattern.
- W6-48 The short route took 1,861 frames against #78's 1,800, and a closer save gains about 16. (a) a step 78-4b that presses A through the battle's opening, (b) the count to the user, (c) a new save first. Chosen (a): 1,642 frames. The risk, an A that opens the move menu unseen, was ruled out by the frames. Reversal: one option of `battleEntry`.
- W6-49 Plan #79 while stage 2 is in review. (a) plan now, (b) wait for the gate, (c) leave #79 for a later wave. Chosen (a). Reversal: one plan file.
- W6-50 Two columns in the code had the values of coordinates in pokebw2's Route 20 events. (a) the trainer's tile from pokebw2 at run time by his name, (b) readings and a question, (c) readings on the decided list. Chosen (a): the routes came out equal on the real numbers, so no emulator run repeated. Reversal: two constants.
- W6-51 78-4's builder changed W6-34's walk to Right with A every 4 frames up to the trainer's column. (a) keep and book it, (b) go back. Chosen (a): the proving runs and the 1,642 frames rest on it. Reversal: one step, and the count goes back over 1,800.
- W6-52 #78's criterion 2 asks for Continue in a frame of the shot script, which presses no button. (a) the route script's frames, (b) a shot script that presses buttons. Chosen (a). Reversal: none.
- W6-53 The stage 3 plan's D1 to D16 by recommendation; U1 (`extract7z.js` has no named licence) to the user. The core's commits are named from strings in its own wasm, so no build of the core; a source pin is a commit and the SHA-256 of `git archive`'s tar; the GPL's text comes from the pin. Reversal: one entry, line or file each.
- W6-54 One waypoint of the trainer route shares a column with a background event. (a) a reading with its comment, (b) a key by names. Chosen (a): no event defines that place. Reversal: one place in the generator.
- W6-55 A core build holds three sources, and no copyright line was at hand. (a) a list of components per file with the build scripts as one, (b) one component per file. Chosen (a): a guessed line would be a false notice. The build scripts' commit is an inference from dates, and the code says so. Reversal: a field per file.
- W6-56 Two lists of commits could disagree. (a) the tar's hash joins the manifest's source, (b) a second list held equal by a spec. Chosen (a), one rule in one module. Reversal: six lines.
- W6-57 No pinned source held Emscripten's or zlib's notice. (a) quote each notice from a file at its pin and list the two as parts without a notice, (b) type them from memory, (c) fetch two more sources now. Chosen (a); (c) followed as 79-5 (W6-91). Reversal: none.
- W6-58 The notice says the parts are "copyright their authors" and links the licences page. (a) keep it, (b) list the holders in the notice. Chosen (a): each notice stands verbatim one link away, and the box stays short on a phone. Reversal: one sentence.
- W6-59 Four review pages held 20 open questions. Choice: one page with 15 questions under word ids, merged where they asked the same. Reversal: none.
- W6-60 The small-fix card's 15 items. The flipping browser test needs no issue (stage 3 replaced it), and the census reason moves into #86. Five issues, #90 to #94. Reversal: a new issue if the test flips again.
- W6-61 Lane b starts as stage 4 with #86 and #87, the small fixes next; #88 and #89 wait as approved. Reversal: branch names.
- W6-62 77-5 rides on stage 3's branch, so #96 closes #77. Reversal: none.
- W6-63 Lane b's plan, D1 to D16, by recommendation: the test replays, the line for Stealth Rock's clear, Knock Off's user from the last mover, Roost's turn as a dropped line, the census group, the refusal "Gen 1 to N", the team list's content, the rests of D14 for the gate. Reversal: local each.
- W6-64 The option text "under the game, beside the panel" read two ways, from the integrator's own words. (a) directly under the canvas, (b) above it after the panel, (c) move the panel. Chosen (a), with its 390 px picture on the page. Reversal: markup and one locator.
- W6-65 No fetched Gen 5 log held `|replace|`, and a log whose disguise ends failed whole. (a) a parked issue that names the failure, (b) a stand-in now. Chosen (a), with the choice on the page; the user's `illusion` a then built it as #98. Reversal: two steps.
- W6-66 The direct start's plan (D1 to D17) holds; the issue waits for the user's `entry-direct`, since a new issue needs approval. Reversal: none, nothing built.
- W6-67, W6-69 79-4a, then 79-4b, ran before `entry-direct` was answered, since every option kept them. Reversal: none.
- W6-68 No public-domain text describes LZMA2's chunk layout; the builder took it from a Wikipedia article's description. (a) name the article in the comment and the doc, (b) keep vague words, (c) read the SDK's decoder and name it. Chosen (a): "our own code" rests on saying what the author read. Reversal: one comment.
- W6-70 The merge rule. The user lifted the merge okay for now. The integrator's conditions: the lane's review and fixes done, the local check and CI green, GitHub mergeable and clean, `--match-head-commit`, and the page says what merged. AGENTS.md's rule stays as written, since the permission is temporary. Reversal: one word from the user.
- W6-71 A 17-letter nickname prints in full in the text and cut to 12 in the health box. (a) leave both, (b) cut the text's name, (c) the species name. Chosen (a). Reversal: one change in the name's path.
- W6-72 The unpacker's review runs beside the direct start, not hours later at the stage end. Reversal: none.
- W6-73 The unpacker's seven findings go into one fix step. Left: on a broken archive the visitor reads EmulatorJS's own error and none of the page's sentences (a rest). Reversal: one channel and a line.
- W6-74 A file's path in pokebw2 counts as its name, as the battle overlay's did; the trainer class is Youngster until a backend picks classes. Reversal: one constant.
- W6-75 Lane b's review: a fix step for the team list's columns, a second pick and the `state` reason; #98 filed as parked; "dropped: preview (14)" stays, since it says what is true. Reversal: a few lines each.
- W6-76 The pace gate failed on the loaded machine, and in an interleaved measure the base failed it too. (a) merge and book a rest, (b) hold for a quiet machine, (c) widen the gate. Chosen (a); (c) would change a gate without a diagnosis. Reversal: none.
- W6-77 The frame-gap diagnosis. (a) a planner, (b) a scout as the plan said, (c) a builder. Chosen (a): the step ends in a cause and a remedy. Reversal: none.
- W6-78 The batch plan's D1 to D18 by recommendation. D8: #92's criterion asks for checks beside a second heavy run; a `rom:shots` loop runs beside them inside one lock slot from 5,000 MB free. D11: lane b edits `package.json` and two configs. D15: an unknown end alone clears the box, a tie keeps its line. Reversal: small each.
- W6-79 The direct start's bottom screen stayed white. (a) the routine calls the game's own function that switches the displays on, (b) a later window after the boot screens, (c) the page writes the display register. Chosen (a): the earliest window, and work through the game's functions. Reversal: one block member and one call.
- W6-80 Two runs differed by six frames after the park, since the script queued the second plan when it saw the first end. (a) one plan to the mark `battle`, the moment at a fixed frame, (b) compare runs by intervals. Chosen (a), which reverses the plan's D8. Reversal: one call.
- W6-81 E-6 gets a planner before its builders: the step holds design choices under "Commit none". Reversal: none.
- W6-82 E-6's nine decisions by the plan: the numbers from a new generator module by name, since "Commit none" bars a table; two pure layers that seal and fill a Pokémon; a real spec under CI; the park writes both parties whole; a double ends at the action menu; a team of twelve by pokebw2's constant names; the game's own create calls not taken; the trainer track by name; experience 0. Reversal: up to about 60 lines of readers.
- W6-83 A sample at check 3's end found no shot tool, between two passes of the load loop. (a) count #92's criterion met from the loop's log, (b) run all three checks again. Chosen (a). Reversal: about 16 minutes.
- W6-84 The send-outs' animation case took 2,953 ms at load 12, 47 ms over the criterion's margin. (a) a named limit in the fix round, (b) leave it, (c) a step now. Chosen (a). Reversal: one constant.
- W6-85 Two fixture modules that claim invented numbers held real small offsets, sizes and bit places; one was pushed. (a) place both anew, add a guard spec that fails by name, fold the unpushed one into its commits and leave the pushed history, (b) as (a) and rewrite about 14 pushed commits, (c) accept small offsets. Chosen (a): a rewrite does not unpublish a push. No rewrite was asked before the stage merged, so the old fixtures are in `master`'s history; the tree holds none. Reversal: (b) before the merge only.
- W6-86 The outro scene expected the win frame's box for an unknown end, which now clears. (a) the box's empty background colour, (b) any one colour, which a black frame passes, (c) drop the scene. Chosen (a). Reversal: one check.
- W6-87 The send-out streams set no gender, so each engine drew its own sign. (a) a rest, (b) fix it now, (c) leave it unrecorded. Chosen (a); #103 later brought those frames to 0 pixels. Reversal: none.
- W6-88 With experience 0 the EXP bar draws empty, and the samples missed the "Go!" line. (a) both stand as rests, (b) write a level's base experience, (c) sample more densely. Chosen (a): a replay carries no experience. Reversal: one field and one run.
- W6-89 The divide spec in WebAssembly skipped in CI. (a) a clang on PATH and `lld` in CI, a missing compiler failing under CI, (b) keep it a build-machine test. Chosen (a); it held on the first try. Reversal: the step and the branch.
- W6-90 Three Unclear findings: a wide first field fixed test first; the send-outs' hand-written intro line a rest (it needs a new baseline); `rowText` stays. Reversal: small.
- W6-91 Emscripten and zlib. (a) two components with full archives pinned by tar hash, (b) notices from pinned blobs, (c) notices alone under the GPL's "System Libraries". Chosen (a), stopped at 60 MB or 2 minutes of fetch. Reversal: about 40 lines.
- W6-92 The stage 5 tester's five findings: the doubled bytes line fixed in the fix round; "The game keeps …" after END, the pick's counts beside a running replay, no line for a refused Play after a pick, and the unmeasured beep as rests. Reversal: an issue proposal each.
- W6-93 The second Start press lost its timing under load while one run started, as #90 asks. (a) a rest, (b) a fix step with a browser run. Chosen (a). Reversal: one step.
- W6-94 #88 as stage 6 alone, #89 as stage 7. (a) two stages, (b) one, (c) wait for open answers. Chosen (a): #88 needs no build. Reversal: one longer pull request.
- W6-95 #88's plan, D1 to D18, by recommendation. D1: the stream cannot name Ivy Cudgel's look, so each look is a named fallback and the user gets the question `ivy-cudgel-look`. D2: a scout searched for a better second replay first. Reversal: one step at most each.
- W6-96 The second Gen 9 replay. The planner's pick was a challenge with 363 custom rules. Chosen `gen9ou-2719598518`, a rated ladder game with snow, Tera on both sides and no chat; 88-3 lost Phantom Force's charge line and gained Aurora Veil's. Reversal: a fixture and four snapshots.
- W6-97 A second mark on one frame could get a later picture. (a) the review reads it and the fix round takes it, (b) a rest. Chosen (a); fix round B took one picture per frame. Reversal: none.
- W6-98 Spec texts handed to the readers listed real members in the real order, so the readers computed real places. (a) reorder them and put them under the guard, (b) a rest, (c) leave them. Chosen (a), the same reading as W6-85. Reversal: none for the reorder.
- W6-99 #79 holds two criteria for a public Gen 5 page that does not exist. (a) "Part of #79", tick seven criteria and park the issue, (b) close it and book a rest. Chosen (a): the GPL's duty for a deployed page stays in sight. Reversal: close by hand.
- W6-100 Lane a's fix rounds. A field breaks the rule at its real offset and bit whatever its size, and at offset 0 only in its real size and width too; the guard takes that rule, the spec texts move into fixture modules, the missing tests join (round A). Round B takes one picture per emulated frame and frames the licences page's core rows. Left: #97's criterion 2 names a party pointer the settled routine does not hold. Reversal: specs and docs alone.
- W6-101 #88's fix round. Color Change and the other causes of a type change take the game's line or the listed stand-in; Attract's and Lock-On's lines name both Pokémon; Neutralizing Gas's end keeps the log's order (a rest); the "Not shown" wording stays until #89. Reversal: one helper and four rows.
- W6-102 The guard leaves a struct's alignment out. (a) accept: it says what "holds a pointer" says, (b) rewrite pointer members of about 20 structs. Chosen (a). Reversal: drop the exemption.
- W6-103 The stage 6 tester's points: Neutralizing Gas's order a rest; the developer words in "Not shown" stay until #89; Ivy Cudgel's look a question; Start after a refused file and the gender sign at 390 px rests. Reversal: none in code.
- W6-104 #89's plan, D1 to D13, by recommendation. D-T: 89-T needs an op for a move's type. (a) MOVE_TYPE lands in version 4 with no writer, (b) a sixth byte in MOVE, (c) nothing now, (d) the ROM derives the type, against ADR 0004. Chosen (a): a later yes costs no version 5 and no second build. D-FG: the frame gap's stream option stays out of version 4. Reversal: one small step before the stage's builds.
- W6-105 A spec fails on a named fallback no test replay takes; two were named ahead. (a) a list `NAMED_AHEAD`, (b) drop both, (c) no case. Chosen (a). Reversal: the list.
- W6-106 #79's board row after its park. (a) Gate, (b) archive, (c) In wave. Chosen (a), so the gate shows its open criteria. Reversal: one edit.
- W6-107 The Gen 5 cut's D1 to D13 by recommendation: a replay of named blocks with a version and a pin; mapping by dex number checked by name; forms at 0 as fallbacks; each kind copies the server's sequence; lines by label; the HP rule moves to `src/script/` after #89. Reversal: one module at most each.
- W6-108 `first-tera`'s planned frame shows the charge, which hides both boxes, and the default runs hold no Tera. (a) compare the box before and after the op and leave the scene out of the default runs, (b) add a Tera to the hand-made stream. Chosen (a): the baseline stays whole. Reversal: one constant and module.
- W6-109 Four rulings on the Gen 5 drafts: both Gen 5 servers serve the two build files and the build output holds neither; the user's own watch is no criterion; the doc is `docs/gen5-backend.md`; the counts are battle script counts. Reversal: an edit of an issue.
- W6-110 #89's first review: no Wrong finding touched the game's side, so the runs went on; a fix step for two tests that passed with the op emptied, a comment and two labels; Bide's named-ahead entry names its trigger. Reversal: one line each.
- W6-111 #106's plan, D1 to D19, by recommendation. D2: natures map by name, since @pkmn numbers them in another order (the issue corrected). D4: the revealed sets live in the backend until a second backend needs them. D8: the generator reads the battle fonts. D19: forms stay at 0. Reversal: one function each.
- W6-112 Stage 8's plan, D1 to D18, by recommendation. D1: the ROM's generator starts from the seed both engines boot with and skips one draw, so the module keeps its baseline (the issue corrected). D4: a new event kind `replace`. D7: two public random battles as test replays. D8: Focus Sash's and the weakening berry's lines after the hit, where the game says them. Reversal: one constant and a baseline run for D1.
- W6-113 Black 2 sends party slot 0 first, and the script keeps Team Preview's order. (a) order each side by first switch-in, (b) slot by member index as planned, which sends the wrong leads. Chosen (a). Reversal: one function.
- W6-114 An unrevealed forme's ability. (a) the forme's first ability, since a forme map comes later, (b) the base form's. Chosen (a). Reversal: one line.
- W6-115 Stage 7's second review: no spec held 89-T's prefix rule, and a README sentence overclaimed; both into one fix round with the tester's findings. Reversal: none.
- W6-116 #106's review: one fix round for ability lines on the holder's own lines, Frisk's and Pickpocket's items, a font fixture that keeps only the characters, and the docs. Reversal: per item.
- W6-117 Lane a's branches. (a) a new branch per backend issue, (b) restart one branch from `master` each time. Chosen (a): a merged head stays frozen. Reversal: a branch name.
- W6-118 Ivy Cudgel's Water club flies yellow-green in the expansion's own palette. (a) keep the expansion's art and show it, (b) a palette of ours, an upstream art change. Chosen (a). Reversal: one palette and a ROM build.
- W6-119 #107's plan, D1 to D16, by recommendation: a hit's commands carry the mon ID as a trailing byte and no critical flag (the issue corrected); until #108 only the leads' events play; an HP change that cannot play moves the bar silently and lists its line. Reversal: per the plan.
- W6-120 Focus Sash's line. The plan said the effectiveness line first; the pinned command prints "hung on" first. (a) the pinned order, (b) the brief's. Chosen (a). Reversal: two stages swapped.
- W6-121 After the swap the game's own Illusion showed the disguise again. (a) our interpreter turns it off at each switch-in and send-out, (b) a rest with #98's criterion unmet, (c) strip Illusion from the ROM's Pokémon. Chosen (a): our files alone, and 103-1 rebuilt both engines anyway. Reversal: one call in two ops.
- W6-122 Events the hits' writer cannot play. (a) the issue that owns the kind builds it, (b) every event of a Pokémon not in place to #108. Chosen (a). Reversal: a table row each.
- W6-123 #104's third criterion. After END with a stall the 1x clock pays its owed frames in a burst, which the issue allows. (a) measure the held gap from END's draw to the first draw after the stall, and count the skips met inside the 1x range, (b) read as printed and fail it, (c) the browser test alone. Chosen (a); the underrun criterion waits for a quiet run. Reversal: none in code.
- W6-124 #107's review: one fix step for Protect, the doc, two copied helpers, error texts that quoted C and a text fixture in plain words; two Unclear findings to the gate. Chosen over (b) W1 to W3 alone: two items touch what CI's log and the tree show of the game. Reversal: small.
- W6-125 The shared C helpers still quote C text in their errors. (a) a rest, since they fire only on a reviewed pin bump, (b) a step now. Chosen (a). Reversal: one step.
- W6-126 Illusion's end on the Gen 5 backend. (a) a row `later #109`, the game's Pokémon staying in place while the real one plays under its ID, (b) `later #108`, (c) a silent swap. Chosen (a): the look belongs with the abilities. Reversal: a row and an alias.
- W6-127 Stage 8's fix round: `master` in with the `replace` row, the send-out figures, a spec on the speed switch's write order, the seed in one header, a proof that the gender test catches a broken redraw, and one green browser run; three points to the gate. Reversal: small.
- W6-128 Lane b's next work. (a) plan #109 from lane a's branch, (b) wait for #108, (c) Gen 3 rests, which need a gate. Chosen (a). Reversal: the branch restarts from `master`.
- W6-129 108-3 found Baton Pass by the switch line's cause, and the replay spec listed only two fallback kinds. (a) keep the rulings and list every kind, (b) leave the spec. Chosen (a): a fallback the spec does not list is a silent drop. Reversal: one filter.
- W6-130 #109's plan, D1 to D18, by recommendation. D14: `replace` lists a `line` fallback, "Black 2 shows <disguise> throughout"; the game's own disguise and break is a rest. D2: a weather's turn is a `line` fallback. Reversal: one step.
- W6-131 #108's fix round. The RAM check replayed the blocks' own arguments, so it could not catch a wrong slot; it now compares each read with the backend's order. A command the review wanted after the faint does not exist at the pin. Reversal: small.
- W6-132 Kinds no test replay holds once #110 closes. (a) a new fallback kind `unplayed`, (b) keep `later #110`, (c) throw. Chosen (a): a closed issue's name would mislead, and a throw stops a real replay. Reversal: one kind.
- W6-133 The Substitute doll sits low, mostly behind the message window. (a) accept: the backend sends the server's own command and the client places the doll, (b) a comparison run, (c) move it ourselves. Chosen (a). Reversal: one probe.
- W6-134 A spec helper both specs import. (a) its own module `src/gen5/plan-writes.ts`, (b) a copy in each, (c) a fixtures module. Chosen (a). Reversal: one file.
- W6-135 Four turns open with an effect and no line, so the menu's line stands while it plays. (a) keep and show a frame at the gate, (b) a hide before every first block, (c) a hide before a first block without a line. Chosen (a): the server puts no hide there. Reversal: one command.
- W6-136 An early smoke run of the run script before #109 merged. (a) run it now, uncommitted, (b) wait for 110-4. Chosen (a); it stopped on a move's label. Reversal: none.
- W6-137 The label rule missed 34 moves by case and 52 by name. (a) find the label by the stripped name without case and name a miss in the log, (b) the message ID by the client's order, (c) a hand list. Chosen (a); (c) breaks the rule on hand-listed names. Reversal: one function.
- W6-138 Where #117 and #119 run. (a) lane a runs the spike now, lane b builds #117 after #109, (b) lane a builds #117 first, (c) both after #110. Chosen (a). Reversal: one stage's order.
- W6-139 #109's fix round takes the two Wrong and four Unclear findings of the code rules' kind; the rest go to #110 and the gate. Reversal: per item.
- W6-140 #119's plan, D1 to D10, by recommendation. D2: the probe burns the near lead through its sealed party word to show the status icon. D7: singles only. Reversal: one probe run.
- W6-144 #117's review. A bare Skill Swap activation started printing through the new hook. (a) keep and book it, (b) drop it again. Chosen (b): #117 did not ask for it, and the stream would print the move twice. Reversal: one line.
- W6-145 A value import made a runtime cycle between two rule modules. (a) accept, nothing loads the leaf first, (b) move the function to a leaf module. Chosen (b); its spec was red, since the index lost its rules silently. Reversal: one function.
- W6-146 Lane b's next stage. (a) plan #111 now and build from lane a's branch, (b) idle, (c) #118 out of order. Chosen (a). Reversal: the plan waits.
- W6-147 110-3's line read as the handler puts it, not as the plan named it. (a) accept, (b) the plan's form. Chosen (a), the stricter check. Reversal: two words.
- W6-148 #111's plan, D1 to D16, by recommendation; two touches outside the lane's list okayed. The four that show go to the page as results: the picker opens on "None", a 600-frame gap at the first menu, the list beside the game from 56rem, the winner in the status line at the end. Reversal: one default, constant, rule or filter each.
- W6-149 110-4 came as two commits where three were allowed, since a split leaves the charge unplayed between them. (a) accept, (b) ask for the split. Chosen (a). Reversal: none.
- W6-150 111-2 refuses a bad `?every=` with a sentence. (a) accept, (b) ignore the value. Chosen (a): the page says why it waits. Reversal: one branch.
- W6-151 110-5's three runs. (a) accept, (b) rerun for the look of one faint. Chosen (a): the frames sample by wall time, and the commands are the same. Reversal: one run.
- W6-152 111-3's first build pulled the Gen 3 tables into the Gen 5 page through one shared module. (a) move the list's rule into a game-neutral module, touching Gen 3 web files, (b) copies. Chosen (a): one rule in one module. Reversal: the move back and a lazy import.
- W6-153 #110's fix round takes W1 to W6, a spec over the run script's exit and one short moment run. Chosen over (b) W1 to W5 alone. Reversal: none.
- W6-154 fix-110 found two stale lines older than the lane. (a) accept and open the pull request, (b) a second round. Chosen (a); the lines are rests. Reversal: a two-line fix.
- W6-155 Lane a takes #118 as stage 13 beside #111's last step. (a) now, (b) idle until #111 merges. Chosen (a). Reversal: none.
- W6-156 #118's plan, way C, D1 to D13, by recommendation. The three looks the plan marked for the page (the printed lines look as the game prints its own, the winner's line prints, weather turns stay on the list) are decided by the recommendation and shown as results. (a) decide and show, (b) put them to the user before 118-2. Chosen (a): the user asked for direction questions and results. Reversal: one rule each.
- W6-159 #111's fix round takes W1 to W3, the cut of the scripts' import cycle with a check, a try around each run-end listener and a failed progress for a refused query. Chosen over (b) W1 to W3 alone: #117's round showed a cycle losing code silently. Reversal: none.
- W6-160 118-1's builder read five files, not six, made one commit, not two, and measured the window by the widest Latin letter. (a) accept, (b) the plan's form. Chosen (a): each follows a rule of the tree. Reversal: none.
- W6-163 118-2's rulings: a fixture page of three lines, the winner's name as the log gives it, and a "?" counted as `character` under `party` (a wording rest). (a) accept, (b) send back. Chosen (a). Reversal: one kind.
- Plain acceptances of a hand-back:
  - S9, lane b: W6-141 (#109's fix round).
  - S10, lane a: W6-142 (#119's probe; the question returns as `gen5-hp-hide`).
  - S11, lane b: W6-143 (117-1).
  - S12, lane b: W6-158 (111-4), W6-161 (#111's fix round), W6-162 (#123 merged under W6-70).
  - S13, lane a: W6-157 (118-P), W6-164 (118-3).

## Gate

State on 28.11.2026, before the gate:

| Stage | Lane | Issues                     | Pull request | State                                                                      |
| ----- | ---- | -------------------------- | ------------ | -------------------------------------------------------------------------- |
| S1    | a    | #75, #76                   | #83          | merged, 0449db2                                                            |
| S2    | a    | #78                        | #84          | merged, 703d099                                                            |
| S3    | a    | #77, #79 (79-1 to 79-3)    | #96          | merged, 698c728                                                            |
| S4    | b    | #86, #87                   | #99          | merged, 0363240                                                            |
| S5    | b    | #90, #91, #92, #94         | #100         | merged, 2c9425a                                                            |
| S6    | b    | #88, #26                   | #101         | merged, 7aed658                                                            |
| S4    | a    | #97, #93, #79 (79-4, 79-5) | #102         | merged, 7338d1c; #79 parked at Gate with its two public-page criteria open |
| S5    | a    | #106                       | #112         | merged, 3d90ee5                                                            |
| S7    | b    | #89                        | #113         | merged, 56ed1f9                                                            |
| S6    | a    | #107                       | #114         | merged, 68ab386                                                            |
| S8    | b    | #105, #98, #104, #103      | #115         | merged, 378d955; #104's underrun criterion waits for a quiet run           |
| S7    | a    | #108                       | #116         | merged, 3abb3a2                                                            |
| S9    | b    | #109                       | #120         | merged, b252b7f                                                            |
| S11   | b    | #117                       | #121         | merged, bcec9cc                                                            |
| S10   | a    | #110, #119                 | #122         | merged, 93dc61c                                                            |
| S12   | b    | #111                       | #123         | merged, cc7c440                                                            |
| S13   | a    | #118                       | (to come)    | in work: 118-P, 118-1, 118-2 and 118-3 done; 118-4 builds                  |

The user's answers during the wave:

- The Gen 5 lane's first page (answered 25.11.2026): merge #83 at 7698645; merged as 0449db2.
- The stage 2 page of lane a (25.11.2026):
  1. a: merge #84 at 2617bad; merged as 703d099. Note: "But I'm wondering if this is a wasted effort. Can't we isolate the code but that either triggers a battle or replay (camera) and use this?" A planner looked into both ways; it led to the question `battle-entry`.
  2. a: the page playing the macro itself and the wait before the first moment join the backend's first issue; the hand-out button becomes the parked issue #85.
  3. a: "Write our own unpacker under MIT and point the emulator at it." Built as 79-4.
- In the chat the user asked for one page: "I don't want to have 4 review pages, give me only one". AGENTS.md carries the rule.
- The one page with 15 questions (25.11.2026; wave 5's booking lists all of them). For this wave: `merge-81-82` a (wave 5's #81 and #82 merged); `battle-entry` b, start the trainer battle directly through a small injected routine, with the note "I mean, this trainer approach and going isn't practical in any way shape or form. It should be exactly like in Gen 3, just starting the battle. What about save states or injecting it?"; `bw2-values` a (77-5); `patch-0011` a and `outro-no-winner` a (#91); `emulator-end` a (#90); `frame-gap` a (the diagnosis); `formats-width` a and `team-preview` a (#86, #87); `m3-proposals` b (#86 to #89); `lane-b-order` a; `small-fixes` a (#90 to #94).
- Three answers of 25.11.2026: `entry-direct` a, "File the issue and build it next in the Gen 5 lane. The rest of #79's unpacker follows it." (#97); `merge-96` a (merged as 698c728); `merge-95` a (merged as 6fe9c9b). With them the user wrote: "As this is right now more dynamic, feel free to autonomously merge PRs for now. Let's just only get my input on questions on how to move forward or to show me results". Every later stage pull request merged under that ruling and the integrator's conditions (W6-70).
- Six answers of 26.11.2026, each the recommendation: `gen5-cut` a (#106 to #111 filed and built in order); `ivy-cudgel-look` a (89-T); `frame-gap-remedy` a (#103); `illusion` a (#98 approved and built); `m3-rests` a (#105); `sound-skip-fix` a (#104).
- Four answers of 27.11.2026: `gen5-battle-end` a, the game holds the last scene and the page says who won (not the recommended c, so no issue for the game's own end); `gen5-missing-lines` a, the first milestone lists the lines under the game and printing them becomes #118; `frisk-mummy-lines` a (#117); `gen5-hp-numbers` with no choice and the note: "I feel like c is the cleanest option, having 100 as percentage, but stating HP is very confusing. Guessing HP is also not very good though, so just hide it similar to Showdown is probably the best option, or the other option would be to HP => % and then have the 100/100. A spike is probably warrented for this to be pushed to my gate." Filed as the spike #119.

Open on the page: `gen5-hp-hide` (since 27.11.2026, with #119's pictures): a keep 54/100, b hide the numbers (recommended; it approves the build as a new issue), c hide them with a switch on the page. Every Pokémon keeps 100 HP until the answer.

Still waiting for the user from waves 4 and 5: the phone runs for #47 and #49, the device checks of #56 to #59, two saved files for #56, #59's report link, and the speed figures for the Gen 5 page.

## The next wave

For the integrator to complete at the gate. #118 closes with 118-4 and its stage pull request. The answer to `gen5-hp-hide` decides whether the HP build follows as an issue. The Gen 5 cut keeps proposals behind its first milestone (forms, Gen 1 to 4 formats on Gen 5, the EXP bar, the walk's removal, sound, the visitor's page, a double's moment, the trainer's class), and the rests below can each start a proposal.

## Rests

Proposals for the gate, grouped. Each line can start an issue proposal.

The viewer's pages:

- The pace gate of `e2e/wasm-play.spec.ts` fails on a loaded machine at base and head alike; it should tell a loaded machine from a slow page (W6-76).
- The second Start press in `e2e/wasm-play.spec.ts` loses its timing under load, since the build ends before the press; the step could hold the build open (W6-93, failed again at S8's end).
- After a replay's end, a failed pick on the emulator page says "The game keeps …" over the black screen (W6-92).
- After a new pick during a run, "Details" shows the pick's counts beside the running replay's progress (W6-92).
- After a refused Play that follows a pick, no line says the running game is silent (W6-92).
- Start after a refused file plays the select's example with no line that says so (W6-103).
- The "Not shown" list speaks in developer words such as "fallback: mechanic"; its form in plain words (W6-103).
- At 390 px the team list puts the gender sign of "Ogerpon-Wellspring" on a line of its own; one no-break space (W6-103).
- At 390 px "Example replay" cuts the replay's number. Wave 5's gate kept the labels as built (`labels` a); stage 8's tester named it again.
- #104's underruns: each switch into or out of Fast counts one, no quiet run measured the criterion, and after a Fast run's end the skips climbed to 68,290 while full-page screenshots held the page (W6-123).
- The low-HP beep was never measured in the page's sound; a phone run with the user hears it (W6-92).
- `rowText` is read by specs alone (W6-90).

The Gen 3 backend and ROM:

- Quick Claw prints its line with no pop-up and no held-item animation, and Focus Sash plays neither its pop-up nor its hang-on animation (#105, W6-120).
- Sky Drop hides its user alone where the game lifts the target too, and a Sky Drop charge with no target keeps its fallback (W6-120, W6-127).
- Toxic Spikes cleared by Defog would say "blew away", and a Toxic Spikes end with neither `[from]` nor `[of]` has no rule; no log holds either (W6-112).
- Illusion's morph as the game plays it stays under "Not shown" (W6-112).
- Neutralizing Gas's end comes in the log's order; the game says "come back" first on a switch and the gas line first on a faint (W6-101, W6-103).
- Snatch, Guard Split, Power Split, Speed Swap and an Attract without `[of]` keep the listed stand-in; Mimicry has a line of its own in the tree and stays on the stand-in; Attract's hearts do not play; the added third type's line prints whatever its cause (W6-101).
- Quark Drive's end shows under "Not shown"; no test replay holds one (W6-101).
- No test replay holds a Stellar Tera, a Tera that changes a form, a Terastallized Pokémon that Transforms, two Teras in one turn, snow replaced by another weather, snow and hail in one format or Rockruff-Dusk (W6-101, W6-110).
- The first Tera line keeps PRINT's long wait, 64 frames the game does not wait (W6-104).
- The Tera outro test's THEN holds without a Tera, so its SCENE alone proves the op ran (stage 7's fix-1).
- `first-tera`'s red run needs a tracked way to shoot a stream a lane makes (89-5).
- Each ability pop-up slides off before its line ends, by the expansion's own timer (stage 6, W6-118).
- Gen 3 neither prints nor lists the game's "acquired Mummy" line, as with Trace (W6-144).
- The send-out streams and `scripts/rom-shot-stream.ts` write "… would like to battle!" by hand; the phrase module's line changes the intro frames and needs a new baseline (W6-90).
- Bide's first turn stays in `NAMED_AHEAD` until a test replay holds Bide (W6-110).
- Stage 8's review: 2719812975's 0-HP switch-in ends 10 frames sooner after 98-3; no before frames of the back animations #103 changed; the item looks; no module frame of the Illusion swap (W6-127).
- On hand-made's op 4 the near party's ball bar slides out one pixel apart between the engines (the frame-gap strip).
- After #103 the module still ends up to 106 frames before mGBA, counted from op 0; mGBA's overrun frames are the inferred cause, and which boot code takes mGBA's 13 to 20 frames before the parties appear is unknown (the diagnosis, S8's end).

The Gen 5 backend and page:

- A broken core archive shows EmulatorJS's own "Error loading EmulatorJS runtime" and none of the page's sentences (W6-73); the unpacker does not refuse the coder flag's reserved bit 6.
- A first mark's picture still comes a little after its frame; exact pictures need the core held for the capture (W6-100). The licences shot's archive frames start at the link.
- The EXP bar draws empty (W6-88).
- Forms stay at 0: the Therian formes show their base forms although form 1 draws them, and an unrevealed forme gets the forme's ability (W6-114, the probe R7).
- Names cut to the game's room, such as "isolatedstar" to "isolate", show in the run's log alone (W6-111).
- The opponent is always a Youngster, from the direct entry (W6-74).
- Moves whose bank label differs from @pkmn's name by more than case (Follow Me, the far side's Will-O-Wisp and about a dozen more) show "no line label" in the run's log (W6-137).
- Illusion's end lists a `line` fallback; Black 2's own disguise and break would need the game's disguise to be the log's (W6-130).
- The `unplayed` causes: a hit count, a called move, a spent charge, a look alone, a release that misses, OHKO, no target, set HP, Transform, a forme change, Terastallization, a sand hit that faints, a stat line with a context and effects with no sequence (W6-132).
- U-turn's and Volt Switch's own "went back" line, the Baton Pass op and each drag's own look (W6-126).
- "fainted" shows before the Pokémon falls, as the server queues it, and Roar's animation takes the target off before the drag's recall (#108's review).
- The faint's two clearing ops are left out, since nothing the writer sets depends on a Pokémon; send them once something does (W6-131).
- The bar's rise falls between two 30-frame samples; a sprite's tint fades across the next block; the Substitute doll sits low; a quadruple or quarter hit on a doll goes as double or half; Iron Barbs, Protect's block, Focus Punch and a drain are unseen in a run (#107's and #109's reviews, W6-133).
- Three turns open with an effect and no line, so the menu's line stands while it plays (W6-135).
- A move into an absorbing ability, Sticky Hold or Telepathy still plays its animation (#107's fix round).
- The shared C helpers in `scripts/gen5-bw2-c.ts` quote C text in their errors, and one error shows an offset (W6-125).
- The revealed sets belong in the battle script's `TeamMember` once a second backend needs them (W6-111).
- #111's review: pokebw2's GPL notice before any public page (with #79); 1-based rows against 0-based run logs; the bundle's size on phones; `scripts/gen5-replay.ts` through `replay-run.ts`; EmulatorJS's "Fast-Forward." note while the cap is off, the heading "Gen 5 spike" and the end line shown twice; the list's double numbering on both pages (W6-159).
- Two stale lines older than #110: `src/gen5/backend/switches.ts:6` still says "wait for #109", and `docs/gen5-spike.md:166` and `:344` say no frame shows the "Go!" line (W6-154).
- The near boxes of a double draw their HP numbers too; #119 proved singles alone (W6-140).
- Layouts that specs write inline under invented names sit outside the fixtures' guard (W6-102).
- CI's failed-fetch path never ran on GitHub, and `checkout()`'s git paths have no unit spec (W6-23).

Tooling and docs:

- The module runner's 900 s budget per stream leaves the longest stream too little room under load; a budget by the stream's length or a progress check would tell a hang from a slow run (89-5).
- `src/gen3/translate/type-change.test.ts` passed vitest's 5 s limit under load once (89-3).
- Files near the ceiling: `scripts/rom-shot-scenes.test.ts` near 295 lines, `scripts/rom-shot.ts` near 282, `scripts/gen5-bw2-flow.fixtures.ts` at 297 (W6-110).
- No spec compares the type range across the stream's two sides (W6-110).
- CI fetches no expansion tree, so no pinned string renders there; the words rest on the unit specs' literals and the snapshots (W6-101).

Wave 5's rests that stayed keep their triggers in `wave-05.md`; #90 to #94 took the ones the gate approved.

## Notes

- 23 rests the timeline named were dropped as settled: the frame gap's remedy and the send-outs' gender sign (#103); Illusion's failure and Illusion in Gen 9 (#98); the six Gen 4 and 5 stand-in lines (#105); the sound skip's fix (#104); Frisk's and Mummy's lines (#117); the two clients' hand constants (#93); four specs near their time limit (92-1) and the routine spec's limit (106-1); the worker's report line (E-5); the frame hook at its ceiling (E-5b's split); the "Go!" line's frame (110-5's runs); the licences shot's core rows and two marks on one frame (fix round B); the spec texts in the real order (fix round A); the leads' own switch-in abilities, the miss line during Leftovers and the status a Pokémon comes back with (#109); the win line's name and the game's own end (`gen5-battle-end` a); the page playing the walk itself and the wait before the first moment (#97, #111); a type change to two types (W6-101's fix round).
- The heavy-check lock is shared with another project on the build machine, which held most of its memory at times. earlyoom ended two Gen 5 emulator runs on 25.11.2026; since then a wrapper waits for 3,300 MB before a check and 4,700 MB before an emulator run. Several checks lost one spec to vitest's 5 s limit under that load and passed on the rerun; #92 named the limits.
- On 26.11.2026 at about 16:50 every running agent stopped on the account's spend limit, and the machine restarted at 01:17 on 27.11. Nothing ran in between; 89-5's module run had lost one stream to its time budget under load, and it passed alone.
- Thirteen stage pull requests merged without a question under W6-70; #83, #84, #95 and #96 merged on the user's answers. AGENTS.md still says a merge into `master` needs the user's okay, since the user gave the ruling "for now".
- The fixture rule tightened four times (W6-85, W6-98, W6-100, W6-102). The earlier fixture commits with real small offsets are in `master`'s history since #102; the tree holds none, and `scripts/gen5-fixtures-real.test.ts` fails on a new one.
- The integrator scanned each hand-back before its push: home paths and host names, skip markers, every added number above 255 against `build/gen5/bw2.json`, and the fixture fields against the generated layouts. Pictures that showed part of the dump's file name were covered before they left the machine; every picture went to the private review page and none into the tree.
- A builder ran `git stash` in one worktree and popped the other lane's stash there. The builder stored it back at once, and no commit took a file of the other lane. Briefs forbid `git stash` since: every worktree shares the stash list.
- After a merge that changes the generator, `build/gen5/bw2.json` needs a regeneration before the check: one check failed eight real specs on a stale file.
- CI failed once in the step that installs clang, on the runner's package source, before any check ran; the rerun passed. GitHub's API limit ran out once with other sessions sharing it, and the CI watch polls every 30 s since.
