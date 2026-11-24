#ifndef GUARD_IRV_WASM_DIVIDE_H
#define GUARD_IRV_WASM_DIVIDE_H

// The division helpers (#66): one per WebAssembly division and remainder, numerator first. No C
// code calls them. After the link, scripts/wasm-divide.ts turns each such op outside them into a
// call of its helper, and the host harness of our layer runs them for the specs.

#include <stdint.h>

int32_t IrvWasm_I32DivS(int32_t n, int32_t d);
uint32_t IrvWasm_I32DivU(uint32_t n, uint32_t d);
int32_t IrvWasm_I32RemS(int32_t n, int32_t d);
uint32_t IrvWasm_I32RemU(uint32_t n, uint32_t d);
int64_t IrvWasm_I64DivS(int64_t n, int64_t d);
uint64_t IrvWasm_I64DivU(uint64_t n, uint64_t d);
int64_t IrvWasm_I64RemS(int64_t n, int64_t d);
uint64_t IrvWasm_I64RemU(uint64_t n, uint64_t d);

#endif // GUARD_IRV_WASM_DIVIDE_H
