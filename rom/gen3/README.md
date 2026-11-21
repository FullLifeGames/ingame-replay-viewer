# rom/gen3

What we add to pokeemerald-expansion and what we change in it, without a fork (ADR 0007).

- `build.json`: the pinned upstream (repository, tag, commit), the SHA1 of the US Emerald dump that the BPS patch starts from, and the cap on make jobs.
- `src/`, `include/`, `test/`: our own C files. The build copies them into the same folders of the upstream tree, where the Makefile's wildcards find them. Their names start with `replay_`. A file that upstream already tracks is an error.
- `patches/series`: the changes to upstream files, one patch per line, applied in order. Each `NNNN-name.patch` is a `git diff` with its reason in a few lines above the first `diff --git`. A patch never adds a file; new files go into `src/`, `include/` or `test/`.
- `include/replay_slot.h`: the layout of the replay slot (ADR 0008). `scripts/rom-slot.ts` reads its `REPLAY_SLOT_*` defines, so the header is the one source of the layout.

The build scripts are `scripts/rom-*.ts`. The upstream tree lives in `.cache/rom/expansion/` and the outputs in `build/rom/`. Git ignores both.

## Building

Each command is a heavy check on devbox, so run it alone and in the background.

- `npm run rom:build` clones the pinned tag into `.cache/rom/expansion/` if it is missing, applies `patches/series`, copies our files, runs make and writes the outputs to `build/rom/`: the ROM, the BPS patch against your dump, `replay-slot.json` and `build-info.json`. `npm run rom:build -- --clean` starts from a fresh tree.
- `npm run rom:repro` runs two clean builds, the second in a fresh worktree, and fails unless the ROM, patch and slot description are equal. It takes as long as two builds, about 90 minutes on devbox.
- `npm run rom:clean` empties `build/rom/` and drops the build products from the tree. `npm run rom:clean -- --all` deletes the tree as well, so the next build clones it again.

The build reads your US Emerald dump from `~/roms/Pokemon - Emerald Version (USA, Europe).gba`, or from the path in `IRV_BASE_ROM`, and checks its SHA1 against `build.json`. It stops when the ARM toolchain is missing, and prints the `apt-get` line that installs it. It also stops when less than 3 GiB of memory is free.

The build deletes files only inside `.cache/rom/` and `build/rom/`. A script that only reads the pinned tree can take it from `IRV_EXPANSION_TREE` (an absolute path) instead.

## Adding a patch

1. Edit the upstream file in `.cache/rom/expansion/`.
2. Run `git -C .cache/rom/expansion diff -- <files> > rom/gen3/patches/0001-<name>.patch`.
3. Write the reason at the top of the patch, above `diff --git`.
4. Add the file name to `patches/series`.

Keep the patches few and small. New behaviour goes into our own files (AGENTS.md).
