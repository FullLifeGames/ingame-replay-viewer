#ifndef GUARD_IRV_WASM_LIMITS_H
#define GUARD_IRV_WASM_LIMITS_H

// The WebAssembly build (#35): musl's <limits.h> defines PAGE_SIZE, which the expansion's
// pokedex_common.h names as an enum member. This shadow sits first on -I.
#include_next <limits.h>
#undef PAGE_SIZE

#endif // GUARD_IRV_WASM_LIMITS_H
