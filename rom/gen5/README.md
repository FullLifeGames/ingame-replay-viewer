# rom/gen5: the direct entry's routine

`routine.c` is a small routine of our own for Black 2's direct battle start (#97). The page writes it into the game's memory while the game runs and queues it as one of the game's procs, in place of the boot screens. It has three functions, which the game's proc manager calls through a table:

- init builds the game data, the battle setup and a one-on-one trainer battle with no trainer of the game's own list, then sets its stage to parked;
- main waits frame after frame until the page sets the go word, then switches both displays on, starts the setup's music and replaces itself by the battle's proc. On a normal boot the boot screens switch the displays on, and the battle never does; the routine runs in their place, so it makes that call of the game's own;
- exit frees nothing, since the battle keeps the game data and the setup.

The file holds no address, offset, size or constant of the game, and it includes no header of pokebw2. Every one of those values reaches the routine at run time through the order block, which the page fills from `build/gen5/bw2.json` and hands to each function as the proc's param. The block's members are words alone. `src/gen5/routine-order.ts` lists the same members in the same order, and a spec holds the two lists equal and fails on any number in the C file at or above a small bound.

`scripts/gen5-routine.ts` compiles the file with `arm-none-eabi-gcc` for the DS's main CPU in Thumb, freestanding and position-independent. It writes `build/gen5/routine.json`: the code's bytes, its size, each proc function's offset, the order list, the compiler's version and flags, and a hash of the bytes. It refuses a build with a relocation, an undefined symbol or a call into the compiler's library, and a build whose two runs differ. CI has no ARM compiler and builds nothing; its specs check the C file and the tools' output as text.

The built bytes stay in `build/gen5/`, out of the tracked tree. ADR 0007 keeps the game unmodified, with our code in the emulator's memory alone; ADR 0002 keeps everything built from the game out of the repository.
