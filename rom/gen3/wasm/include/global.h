#ifndef GUARD_IRV_WASM_GLOBAL_H
#define GUARD_IRV_WASM_GLOBAL_H

// The WebAssembly build (#35) reaches the expansion's global.h through this shadow, which comes
// first on -iquote. It changes two files of the tree and the platform files, each through a
// define of its own in wasm.json.
#include_next "global.h"

// The platform files: the port's own global.h brings <stdio.h> and DBGPRINTF, which prints
// nothing in its builds without DEBUG.
#ifdef IRV_WASM_PLATFORM
#include <stdio.h>
#define DBGPRINTF(...)
#endif

// src/random.c: Random32 is Thumb assembly in a naked function. wasm.json renames it, and this
// empties its body, so the C version of the glue can take the name.
#ifdef IRV_WASM_NO_ASM
#undef asm
#define asm(...)
#undef NAKED
#define NAKED
#endif

// src/recorded_battle.c: wasm32 aligns a u64 to 8, so struct RecordedBattleSave outgrows its save
// sector. The viewer never writes a save, so the file's size asserts go.
#ifdef IRV_WASM_NO_SAVE_SIZE_ASSERTS
#undef STATIC_ASSERT
#define STATIC_ASSERT(expr, id) typedef char id[1];
#endif

#endif // GUARD_IRV_WASM_GLOBAL_H
