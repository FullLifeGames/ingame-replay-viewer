# rom/gen3

What we add to pokeemerald-expansion and what we change in it, without a fork (ADR 0007).

- `build.json`: the pinned upstream (repository, tag, commit) and the SHA1 of the US Emerald dump that the BPS patch starts from.
- `src/`, `include/`, `test/`: our own C files. The build copies them into the same folders of the upstream tree, where the Makefile's wildcards find them. Their names start with `replay_`. A file that upstream already tracks is an error.
- `patches/series`: the changes to upstream files, one patch per line, applied in order. Each `NNNN-name.patch` is a `git diff` with its reason in a few lines above the first `diff --git`. A patch never adds a file; new files go into `src/`, `include/` or `test/`.
- `include/replay_slot.h`: the layout of the replay slot (ADR 0008). `scripts/rom-slot.ts` reads its `REPLAY_SLOT_*` defines, so the header is the one source of the layout.

The build scripts are `scripts/rom-*.ts`. The upstream tree lives in `.cache/rom/expansion/` and the outputs in `build/rom/`. Git ignores both.

## Adding a patch

1. Edit the upstream file in `.cache/rom/expansion/`.
2. Run `git -C .cache/rom/expansion diff -- <files> > rom/gen3/patches/0001-<name>.patch`.
3. Write the reason at the top of the patch, above `diff --git`.
4. Add the file name to `patches/series`.

Keep the patches few and small. New behaviour goes into our own files (AGENTS.md).
