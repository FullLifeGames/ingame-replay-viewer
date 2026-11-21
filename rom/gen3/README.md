# rom/gen3

This folder holds what we add to pokeemerald-expansion and the changes we make to it, without a fork (ADR 0007).

- `build.json`: the pinned upstream (repository, tag, commit), the SHA1 of the US Emerald dump that the BPS patch starts from, and the cap on make jobs.
- `src/`, `include/`, `test/`: our own C files. The build copies them into the same folders of the upstream tree, where the Makefile's wildcards find them. Their names start with `replay_`. A file that upstream already tracks is an error.
- `patches/series`: the changes to upstream files, one patch per line, applied in order. Each `NNNN-name.patch` is a `git diff` with its reason in a few lines above the first `diff --git`. A patch never adds a file; new files go into `src/`, `include/` or `test/`.
- `shot/replay_shot.c`: the screenshot tool, a host program that `npm run rom:shots` builds against libmgba. The build never copies it into the upstream tree.
- `include/replay_slot.h`: the layout of the replay slot (ADR 0008). `scripts/rom-slot.ts` reads its `REPLAY_SLOT_*` defines, so the header is the one source of the layout.

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

`src/replay_stream_check.c` checks the whole stream before a battle starts, and `src/replay_stream.c` reads it. The ops share `include/replay_ops.h` with the main loop:

- MOVE, HIT, HP and FAINT: `src/replay_ops_damage.c`
- WITHDRAW and SWITCH_IN: `src/replay_ops_switch.c`
- STATUS, STAT and ITEM: `src/replay_ops_state.c`
- ANIM, with its table of the game's animations: `src/replay_anims.c`
- WEATHER, VOLATILE and ABILITY: `src/replay_ops_field.c`

`src/replay_setup.c` fills both parties from the stream. A team member that the replay never reveals gets a slot: the empty slots up to the trainer's team size, at most 6, take a copy of the side's first revealed mon, so the intro's ball display shows a ball for each team member.

After a faint the expansion plays its KO animation (`B_ANIMATE_MON_AFTER_KO`). The interpreter waits for it, as the battle script's `waitanimation` does: the faint line that follows FAINT prints while it runs, and every other op waits for its end. FAINT sets the battler's HP to 0 first, as the game's Explosion does for its user, so a later faint on the other side starts no KO animation on a fainted mon.

The tests in `test/replay_*.c` use `include/test/replay_test.h`:

- `REPLAY_TEST(name)` writes a stream in its `STREAM` block with the `ReplayStream_*` writer (`test/replay_stream_writer.c`), queues the events it expects in `SCENE` with upstream's matchers (`MESSAGE`, `HP_BAR`, `ANIMATION` and the rest), and checks the battle in `THEN`, after END and before the test leaves the battle, so the parties, `gBattleStruct` and the sprites are still there.
- `ReplayTest_KOAnimsAtOpStart(op)` returns the KO animation counter at the start of op `op`, counted from 0, for the first 32 ops of the stream. The interpreter records it through the hook `ReplayTest_AtOpStart`, which exists in test builds (`TESTING`).
- A plain `TEST` whose name starts with `Replay:` checks a refusal with `Replay_Validate`, without a battle.

## Screenshots

`npm run rom:shots` plays streams in the built ROM from boot to END in headless mGBA and checks named scenes in the frames. It needs a ROM from `npm run rom:build` and `sudo apt-get install libmgba-dev`, and builds `shot/replay_shot.c` into `build/rom/shot/` on its first run. It is a heavy check: run it alone.

With no name it plays test replay 994052 through the battle script and the Gen 3 game backend. `npm run rom:shots -- 994086 hand-made` plays the named streams instead: a test replay by its id, or `hand-made`, a short battle written with the stream encoder (the intro, both send-outs, a move, an HP change, a status, a switch, a faint and the win line). Two refusals follow each time. The built ROM's empty slot is refused as `EMPTY`, and the hand-made battle with stream version 2 is refused as `VERSION`.

The tool takes a frame at each scene of `scripts/rom-shot-scenes.ts`, and `scripts/rom-shot-probes.ts` checks it with numbers: two frames differ, the near HP digit area shows only the healthbox background, the far HP bar fills the pixels the engine fills for the logged HP, the text box holds the win line and still shows it 600 frames after END, and each side's ball display in the intro shows one ball per team member, up to 6, with no empty cell between them. The run fails when a scene fails, when an op waits 3600 frames, or when the replay stops short of END. 994052 and `hand-made` must show every scene; for another replay the output and `report.json` list each scene its stream lacks. The tool reads the interpreter's progress at the offsets in `include/replay_progress.h`, which also holds the refusal screen's colour. The frames (PPM), the ROMs with their streams and `report.json` go to `build/rom/shots/`. Git ignores that folder, and the tree spec refuses a frame anywhere in the tree.

## Adding a patch

1. Edit the upstream file in `.cache/rom/expansion/`.
2. Run `git -C .cache/rom/expansion diff -- <files> > rom/gen3/patches/0001-<name>.patch`.
3. Write the reason at the top of the patch, above `diff --git`.
4. Add the file name to `patches/series`.

Keep the patches few and small. New behaviour goes into our own files (AGENTS.md).
