#ifndef GUARD_IRV_DMA_H
#define GUARD_IRV_DMA_H

// Our platform layer (#43): the four DMA channels, written from GBATEK's "GBA DMA Transfers".
// The game reaches DmaSet through the shadow gba/macro.h; the frame calls RunDMAs at each HBlank
// and at VBlank.

#include <stdint.h>

// DMAxCNT_H, bits 12-13: the start timing, the argument of RunDMAs.
#define IRV_DMA_TIMING_NOW     0
#define IRV_DMA_TIMING_VBLANK  1
#define IRV_DMA_TIMING_HBLANK  2
#define IRV_DMA_TIMING_SPECIAL 3

#define IRV_DMA_DEST_SHIFT   5
#define IRV_DMA_SRC_SHIFT    7
#define IRV_DMA_REPEAT       0x0200
#define IRV_DMA_32BIT        0x0400
#define IRV_DMA_TIMING_SHIFT 12
#define IRV_DMA_IRQ          0x4000
#define IRV_DMA_ENABLE       0x8000

// The address controls of bits 5-6 and 7-8.
#define IRV_DMA_INCREMENT 0
#define IRV_DMA_DECREMENT 1
#define IRV_DMA_FIXED     2
#define IRV_DMA_RELOAD    3

// The parentheses keep the shadow gba/macro.h's DmaSet macro off the name, so the glue can
// include this header after global.h.
void (DmaSet)(int dmaNum, const void *src, void *dest, uint32_t control);
void RunDMAs(uint32_t timing);

#endif // GUARD_IRV_DMA_H
