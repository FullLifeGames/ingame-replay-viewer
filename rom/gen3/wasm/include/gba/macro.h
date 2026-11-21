#ifndef GUARD_IRV_WASM_GBA_MACRO_H
#define GUARD_IRV_WASM_GBA_MACRO_H

// The WebAssembly build (#35): DmaSet becomes a call of the platform's DmaSet (platform/dma.c),
// which copies at once or keeps the transfer for HBlank or VBlank. The copy and fill macros lose
// their alignment asserts, as CpuSet does in the shadow gba/syscall.h.
#include_next "gba/macro.h"

#undef DmaSet
void DmaSet(int dmaNum, const void *src, void *dest, u32 control);

#undef CPU_FILL
#define CPU_FILL(value, dest, size, bit) CPU_FILL_UNCHECKED(value, dest, size, bit)
#undef CPU_COPY
#define CPU_COPY(src, dest, size, bit) CPU_COPY_UNCHECKED(src, dest, size, bit)
#undef DMA_FILL
#define DMA_FILL(dmaNum, value, dest, size, bit) DMA_FILL_UNCHECKED(dmaNum, value, dest, size, bit)
#undef DMA_CLEAR
#define DMA_CLEAR(dmaNum, dest, size, bit) DMA_CLEAR_UNCHECKED(dmaNum, dest, size, bit)
#undef DMA_COPY
#define DMA_COPY(dmaNum, src, dest, size, bit) DMA_COPY_UNCHECKED(dmaNum, src, dest, size, bit)

#endif // GUARD_IRV_WASM_GBA_MACRO_H
