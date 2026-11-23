#ifndef GUARD_IRV_WASM_GLOBAL_H
#define GUARD_IRV_WASM_GLOBAL_H

// The WebAssembly build (#35) reaches the expansion's global.h through this shadow, which comes
// first on -iquote. It changes one file of the tree, through a define of its own in wasm.json.
#include_next "global.h"

// src/recorded_battle.c: wasm32 aligns a u64 to 8, so struct RecordedBattleSave outgrows its save
// sector. The viewer never writes a save, so the file's size asserts go.
#ifdef IRV_WASM_NO_SAVE_SIZE_ASSERTS
#undef STATIC_ASSERT
#define STATIC_ASSERT(expr, id) typedef char id[1];
#endif

#endif // GUARD_IRV_WASM_GLOBAL_H
