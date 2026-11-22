# rom/gen3

This folder holds what we add to pokeemerald-expansion and the changes we make to it, without a fork (ADR 0007).

- `build.json`: the pinned upstream (repository, tag, commit), the SHA1 of the US Emerald dump that the BPS patch starts from, and the cap on make jobs.
- `src/`, `include/`, `test/`: our own C files. The build copies them into the same folders of the upstream tree, where the Makefile's wildcards find them. Their names start with `replay_`. A file that upstream already tracks is an error.
- `patches/series`: the changes to upstream files, one patch per line, applied in order. Each `NNNN-name.patch` is a `git diff` with its reason in a few lines above the first `diff --git`. A patch never adds a file; new files go into `src/`, `include/` or `test/`.
- `shot/replay_shot.c`: the screenshot tool, a host program that `npm run rom:shots` builds against libmgba. The build never copies it into the upstream tree.
- `include/replay_slot.h`: the layout of the replay slot (ADR 0008 for the ROM image, ADR 0009 for the module). `scripts/rom-slot.ts` reads its `REPLAY_SLOT_*` defines, so the header is the one source of the layout.

The build scripts are `scripts/rom-*.ts`. The upstream tree lives in `.cache/rom/expansion/` and the outputs in `build/rom/`. Git ignores both.

## Building

Each command is a heavy check on devbox, so run it alone and in the background.

- `npm run rom:build` clones the pinned tag into `.cache/rom/expansion/` if it is missing, applies `patches/series`, copies our files, runs make and writes the outputs to `build/rom/`: the ROM, the BPS patch against your dump, `replay-slot.json` and `build-info.json`. `npm run rom:build -- --clean` starts from a fresh tree.
- `npm run rom:repro` runs two clean builds, the second in a fresh worktree, and fails unless the ROM, patch and slot description are equal. It takes as long as two builds, about 90 minutes on devbox.
- `npm run rom:clean` empties `build/rom/` and drops the build products from the tree. `npm run rom:clean -- --all` deletes the tree as well, so the next build clones it again.
- `npm run rom:check` runs the expansion's own `make check` with our tests in the tree, filtered to the tests whose names start with `Replay`. `npm run rom:check -- <filter>` takes another filter: a name prefix, `*` and an infix, or a test file such as `test/battle/ability/intimidate.c`. The first run builds the test objects in `build/emerald-test/` of the tree, about 20 minutes on devbox; later runs build only what changed. The log goes to `build/rom/check.log`.

The build reads your US Emerald dump from `~/roms/Pokemon - Emerald Version (USA, Europe).gba`, or from the path in `IRV_BASE_ROM`, and checks its SHA1 against `build.json`. It stops when the ARM toolchain is missing, and prints the `apt-get` line that installs it. It also stops when less than 3 GiB of memory is free.

The build deletes files only inside `.cache/rom/` and `build/rom/`. A script that only reads the pinned tree can take it from `IRV_EXPANSION_TREE` (an absolute path) instead.

## Testing the ROM interpreter

The ROM interpreter (`src/replay_interpreter.c`, `src/replay_setup.c`) plays an instruction stream (`include/replay_stream.h`) in a recorded link battle. Three patches hook it in:

- 0001 hands it the battle main loop.
- 0002 hides the near side's HP numbers while a replay runs.
- 0003 makes the ROM boot straight into it. `src/replay_boot.c` starts the stream in the replay slot with no save file and no button press, and shows a dark red screen when the interpreter refuses the stream.

`src/replay_stream_check.c` checks the whole stream before a battle starts, in two passes: first each instruction alone, then the order rules in the header comment of `include/replay_stream.h` (no MOVE before its user is sent out, no HP for a side whose battler fainted, and the rest). `src/replay_stream.c` reads the stream. The ops share `include/replay_ops.h` with the main loop:

- END, TURN, PRINT, FLUSH_TEXT_BOX, INTRO and SEND_OUT: the main loop, `src/replay_interpreter.c`. FLUSH_TEXT_BOX empties the text box as a battle script's `flushtextbox` does, before each later hit of a multi-hit move; ITEM_POP_UP starts with the same flush.
- MOVE, HIT, HP and FAINT: `src/replay_ops_damage.c`
- WITHDRAW and SWITCH_IN: `src/replay_ops_switch.c`
- STATUS, STAT, ITEM and ITEM_POP_UP: `src/replay_ops_state.c`
- ANIM, with its table of the game's animations, and TRAP_TURN: `src/replay_anims.c`
- WEATHER, VOLATILE and ABILITY: `src/replay_ops_field.c`

`src/replay_setup.c` fills both parties from the stream. A team member that the replay never reveals gets a slot: the empty slots up to the trainer's team size, at most 6, take a copy of the side's first revealed mon, so the intro's ball display shows a ball for each team member.

After a faint the expansion plays its KO animation (`B_ANIMATE_MON_AFTER_KO`). The interpreter waits for it, as the battle script's `waitanimation` does: the faint line that follows FAINT prints while it runs, and every other op waits for its end. FAINT sets the battler's HP to 0 first, as the game's Explosion does for its user, so a later faint on the other side starts no KO animation on a fainted mon.

The tests in `test/replay_*.c` use `include/test/replay_test.h`:

- `REPLAY_TEST(name)` writes a stream in its `STREAM` block with the `ReplayStream_*` writer (`test/replay_stream_writer.c`), queues the events it expects in `SCENE` with upstream's matchers (`MESSAGE`, `HP_BAR`, `ANIMATION` and the rest), and checks the battle in `THEN`, after END and before the test leaves the battle, so the parties, `gBattleStruct` and the sprites are still there.
- `ReplayTest_KOAnimsAtOpStart(op)` returns the KO animation counter at the start of op `op`, counted from 0, for the first 32 ops of the stream. The interpreter records it through the hook `ReplayTest_AtOpStart`, which exists in test builds (`TESTING`).
- A plain `TEST` whose name starts with `Replay:` checks a refusal with `Replay_Validate`, without a battle. The order cases in `test/replay_refuse_order.c` start with `Replay: order:`. `src/gen3/stream/order.test.ts` holds the same cases with the same ops and verdicts, and fails when a case is on one side only.

## Screenshots

`npm run rom:shots` plays streams in the built ROM from boot to END in headless mGBA and checks named scenes in the frames. It needs a ROM from `npm run rom:build` and `sudo apt-get install libmgba-dev`, and builds `shot/replay_shot.c` into `build/rom/shot/` on its first run. It is a heavy check: run it alone.

With no name it plays test replay 994052 through the battle script and the Gen 3 game backend. `npm run rom:shots -- 994086 hand-made` plays the named streams instead: a test replay by its id, or `hand-made`, a short battle written with the stream encoder (the intro, both send-outs, a move, an HP change, a status, a switch, a faint and the win line). Two refusals follow each time. The built ROM's empty slot is refused as `EMPTY`, and the hand-made battle with the first unknown stream version, 3, is refused as `VERSION`.

The tool takes a frame at each scene of `scripts/rom-shot-scenes.ts`, and `scripts/rom-shot-probes.ts` checks it with numbers: two frames differ, the near HP digit area shows only the healthbox background, the far HP bar fills the pixels the engine fills for the logged HP, the text box holds the win line and still shows it 600 frames after END, and each side's ball display in the intro shows one ball per team member, up to 6, with no empty cell between them. The run fails when a scene fails, when an op waits 3600 frames, or when the replay stops short of END. 994052 and `hand-made` must show every scene; for another replay the output and `report.json` list each scene its stream lacks. The tool reads the interpreter's progress at the offsets in `include/replay_progress.h`, which also holds the refusal screen's colour. The frames (PPM), the ROMs with their streams and `report.json` go to `build/rom/shots/`. Git ignores that folder, and the tree spec refuses a frame anywhere in the tree.

## The WebAssembly build

The WebAssembly spike (#35) compiles the expansion with our C files to a WebAssembly module that runs in the browser without an emulator. `docs/wasm-spike.md` holds the results. The build lives in `wasm/` and reads the tree that `npm run rom:build` leaves; the ROM build never sees any of it.

- `wasm/wasm.json`: the pinned Emscripten release, the pinned platform layer (repository, commit, files), the tree files the module leaves out, and per-file defines and compiler flags.
- `wasm/src/`: the glue, our C files for the module only. It blocks in `VBlankIntrWait`, draws the frame through the platform's renderer, raises the interrupts, hands frames and sound to JavaScript, and stubs flash, the clock, the link cable and multiboot.
- `wasm/include/`: shadow headers. Each one shares a name with an upstream header, comes first on the include path, includes upstream's with `#include_next`, and then adds to it. Most add defines; `global.h` also gives the platform files `<stdio.h>`, `<stdint.h>` and the port's fast integer types. `irv_wasm_sound.h` is our own.
- `wasm/patches/series`: overlay patches. The build copies an upstream file into `build/wasm/overlay/`, applies its patch there, and compiles the copy. Each change sits under `#ifdef IRV_WASM`, and each patch carries its reason above `diff --git`, as the ROM's patches do.
- `wasm/platform-patches/series`: patches against copies of the platform files in `build/wasm/platform/`, in the same form.

The platform layer comes from pokeemerald-multiplatform at the commit in `wasm.json`. `npm run wasm:build` clones it into `.cache/wasm/platform/` and refuses a checkout at another commit or with changes. The layer has no licence that lets us ship it, so its files never enter git and never land in `rom/gen3/wasm/`. The same holds for the module, its patch, the frames and anything else built from your dump.

Each command is a heavy check on devbox, so run it alone and in the background:

1. `npm run wasm:build -- --compile` compiles the kept tree files, the overlay copies and the platform files at `-O2` into `build/wasm/obj/` (about 5 minutes).
2. `npm run wasm:convert` turns the 544 ARM data objects of the ROM build (battle, animation and event scripts, songs) into WebAssembly objects in `build/wasm/asm/`. It is needed again only when the data changes.
3. `npm run wasm:build -- --link` compiles the glue and links `build/wasm/irv-emerald.js` and `irv-emerald.wasm`, then writes the module patch `irv-emerald-wasm.bps` from your dump. `--patch` writes the patch alone.
4. `npm run wasm:run -- hand-made 994052` plays streams in the module in Node and checks the scenes of `rom:shots`. It writes its frames and `report.json` to `build/wasm/run/`.

`npm run wasm:census` compiles every tree file once at `-O0` and sorts the failures by class; the spike used it to find what the build had to change. It applies no overlay patch, so a file that one fixes, `random.c` among them, still fails there. Emscripten installs outside the repository, under `~/tools/emsdk`; `EMSDK` names another place.

## Adding a patch

1. Edit the upstream file in `.cache/rom/expansion/`.
2. Run `git -C .cache/rom/expansion diff -- <files> > rom/gen3/patches/0001-<name>.patch`.
3. Write the reason at the top of the patch, above `diff --git`.
4. Add the file name to `patches/series`.

Keep the patches few and small. New behaviour goes into our own files (AGENTS.md).
