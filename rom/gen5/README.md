# rom/gen5: the direct entry's routine

`routine.c` is a small routine of our own for Black 2's direct battle start (#97). The page writes it into the game's memory while the game runs and queues it as one of the game's procs, in place of the boot screens (`docs/gen5-spike.md`, "Into a battle"). It has three functions, which the game's proc manager calls through a table:

- init sets its stage to started, calls `GameData_Create` and `BtlSetup_Create` on the heap the block names, resets the field status in the block's room with `ResetBtlFieldStatus`, and builds a one-on-one trainer battle with no trainer of the game's own list through `BtlSetup_SetTrainer1v1Single`. It leaves the game data and the setup in the block and sets its stage to parked. A create call that gives no pointer sets the stage to no game data or no setup instead.
- main waits frame after frame until the stage is parked and the page has set the go word. Then it calls `GFL_BGSysEnableEngines`, which switches both displays on, reads the setup's track at `fieldSituation.bgm` and starts it with `GFL_SndBGMPlay`, replaces itself by the battle's proc through `GCTX_ProcMgrReplaceProc`, and sets its stage to gone. On a normal boot the boot screens switch the displays on, and the battle never does; the routine runs in their place, so it makes that call of the game's own.
- exit frees nothing, since the battle keeps the game data and the setup.

## The order block

The page writes the order block beside the code and hands it to each function as the proc's param. It holds 17 words, in this order:

| Members                                                                                                               | Who writes them | What they hold                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `stage`                                                                                                               | the routine     | none, started, parked, gone, no game data or no setup                                 |
| `go`                                                                                                                  | the page        | nonzero once every write of the park is done                                          |
| `gameData`, `setup`                                                                                                   | the routine     | what the two create calls gave back, for the page's writes                            |
| `gameDataCreate`, `setupCreate`, `resetFieldStatus`, `setTrainer1v1Single`, `enableEngines`, `bgmPlay`, `replaceProc` | the page        | the seven functions' addresses, each with the Thumb bit                               |
| `heapId`, `battleOverlayId`, `battleProcFunctions`, `channelMask`                                                     | the page        | `HEAPID_USER`, `OVERLAY_BATTLE_MAIN`, `BATTLE_PROC_FUNCTIONS`, `SND_CHANNEL_MASK_ALL` |
| `bgmOffset`, `fieldStatus`                                                                                            | the page        | the place of `fieldSituation.bgm` in `BtlSetup`, and room for one `BtlFieldStatus`    |

`src/gen5/routine-order.ts` lists the same members in the same order, and `scripts/gen5-routine-source.test.ts` holds the two lists equal, the stages equal to `ROUTINE_STAGES`, and the file free of any `#include`.

## What it never holds

The file holds no address, offset, size or constant of the game, and it includes no header of pokebw2. Every one of those values reaches the routine at run time through the order block, which the page fills from `build/gen5/bw2.json`. The spec fails on any number in the C file at or above a small bound. The build refuses a relocation, so the routine holds no global and no address of its own, and it refuses an undefined symbol and a call into the compiler's library, so every call goes through a word of the block.

## The build

`node scripts/gen5-routine.ts` compiles the file with `arm-none-eabi-gcc` for the DS's main CPU (`-mcpu=arm946e-s`) in Thumb, as the game's own procs are, with `-Os`, freestanding with no header (`-ffreestanding -nostdinc`) and position-independent (`-fPIC`). It compiles twice and refuses a build whose two runs differ. It writes `build/gen5/routine.json`: the code's bytes, its size, each proc function's offset, the order list, the compiler's version and flags, and a hash of the bytes. The code came to 136 bytes. The page adds the Thumb bit to each function's address when it writes the proc table.

CI has no ARM compiler and builds nothing; its specs check the C file and the tools' output as text.

The built bytes stay in `build/gen5/`, out of the tracked tree. ADR 0007 keeps the game unmodified, with our code in the emulator's memory alone; ADR 0002 keeps everything built from the game out of the repository.
