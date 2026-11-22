#ifndef GUARD_IRV_GBA_H
#define GUARD_IRV_GBA_H

// Our platform layer (#43): the GBA's memory map and the registers the layer reads and writes,
// from GBATEK ("GBA Memory Map", "GBA I/O Map"). In the module the GBA addresses are linear
// memory, so an address is its own pointer. The host harness defines IRV_HOST and keeps the
// address space 0x02000000-0x07FFFFFF in a block of its own.

#include <stdint.h>

#define IRV_EWRAM   0x02000000
#define IRV_IO      0x04000000
#define IRV_PRAM    0x05000000
#define IRV_VRAM    0x06000000
#define IRV_OAM     0x07000000
#define IRV_MAP_END 0x08000000

#ifdef IRV_HOST
extern uint8_t *gIrvHostMemory;
#define IRV_PTR(address)     ((void *)(gIrvHostMemory + ((uint32_t)(address) - IRV_EWRAM)))
#define IRV_ADDRESS(pointer) ((uint32_t)((const uint8_t *)(pointer) - gIrvHostMemory) + IRV_EWRAM)
#else
#define IRV_PTR(address)     ((void *)(uintptr_t)(address))
#define IRV_ADDRESS(pointer) ((uint32_t)(uintptr_t)(pointer))
#endif

#define IRV_IO16(offset) (*(volatile uint16_t *)IRV_PTR(IRV_IO + (offset)))
#define IRV_IO32(offset) (*(volatile uint32_t *)IRV_PTR(IRV_IO + (offset)))

// GBATEK "LCD I/O Display Control", "LCD I/O Interrupts and Status", "LCD I/O BG Control",
// "LCD I/O BG Scrolling".
#define IRV_REG_DISPCNT  0x00
#define IRV_REG_DISPSTAT 0x04
#define IRV_REG_VCOUNT   0x06
#define IRV_REG_BG0CNT   0x08
#define IRV_REG_BG0HOFS  0x10
#define IRV_REG_BG0VOFS  0x12

#define IRV_DISPSTAT_VBLANK      (1 << 0)
#define IRV_DISPSTAT_HBLANK      (1 << 1)
#define IRV_DISPSTAT_VCOUNT      (1 << 2)
#define IRV_DISPSTAT_VBLANK_IRQ  (1 << 3)
#define IRV_DISPSTAT_HBLANK_IRQ  (1 << 4)
#define IRV_DISPSTAT_VCOUNT_IRQ  (1 << 5)

// GBATEK "GBA DMA Transfers": four channels of 12 bytes from 0x040000B0.
#define IRV_REG_DMA0    0xB0
#define IRV_DMA_STRIDE  12
#define IRV_DMA_SAD     0
#define IRV_DMA_DAD     4
#define IRV_DMA_CNT_L   8
#define IRV_DMA_CNT_H   10

// GBATEK "GBA Interrupt Control"
#define IRV_REG_IE  0x200
#define IRV_REG_IF  0x202
#define IRV_REG_IME 0x208

#define IRV_INTR_VBLANK (1 << 0)
#define IRV_INTR_HBLANK (1 << 1)
#define IRV_INTR_VCOUNT (1 << 2)
#define IRV_INTR_DMA0   (1 << 8)

#endif // GUARD_IRV_GBA_H
