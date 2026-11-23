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

#define IRV_IO8(offset)  (*(volatile uint8_t *)IRV_PTR(IRV_IO + (offset)))
#define IRV_IO16(offset) (*(volatile uint16_t *)IRV_PTR(IRV_IO + (offset)))
#define IRV_IO32(offset) (*(volatile uint32_t *)IRV_PTR(IRV_IO + (offset)))

// GBATEK "LCD I/O Display Control", "LCD I/O Interrupts and Status", "LCD I/O BG Control",
// "LCD I/O BG Scrolling", "LCD I/O BG Rotation/Scaling", "LCD I/O Window Feature", "LCD I/O Mosaic Function", "LCD I/O Color
// Special Effects".
#define IRV_REG_DISPCNT  0x00
#define IRV_REG_DISPSTAT 0x04
#define IRV_REG_VCOUNT   0x06
#define IRV_REG_BG0CNT   0x08
#define IRV_REG_BG0HOFS  0x10
#define IRV_REG_BG0VOFS  0x12
#define IRV_REG_BG2PA    0x20
#define IRV_REG_WIN0H    0x40
#define IRV_REG_WIN0V    0x44
#define IRV_REG_WININ    0x48
#define IRV_REG_WINOUT   0x4A
#define IRV_REG_MOSAIC   0x4C
#define IRV_REG_BLDCNT   0x50
#define IRV_REG_BLDALPHA 0x52
#define IRV_REG_BLDY     0x54

// GBATEK "LCD I/O BG Rotation/Scaling": PA, PB, PC and PD, then the reference point X and Y, for
// BG2 from 0x04000020 and for BG3 16 bytes on.
#define IRV_AFFINE_STRIDE 0x10
#define IRV_AFFINE_PB     0x02
#define IRV_AFFINE_PC     0x04
#define IRV_AFFINE_PD     0x06
#define IRV_AFFINE_X      0x08
#define IRV_AFFINE_Y      0x0C

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

// GBATEK "GBA Sound Channel 1 - Tone & Sweep" to "GBA Sound Channel 4 - Noise", "GBA Sound
// Control Registers": the PSG's registers by their 8-bit names, from 0x04000060.
#define IRV_REG_NR10       0x60
#define IRV_REG_NR11       0x62
#define IRV_REG_NR12       0x63
#define IRV_REG_NR13       0x64
#define IRV_REG_NR14       0x65
#define IRV_REG_NR21       0x68
#define IRV_REG_NR22       0x69
#define IRV_REG_NR23       0x6C
#define IRV_REG_NR24       0x6D
#define IRV_REG_NR30       0x70
#define IRV_REG_NR31       0x72
#define IRV_REG_NR32       0x73
#define IRV_REG_NR33       0x74
#define IRV_REG_NR34       0x75
#define IRV_REG_NR41       0x78
#define IRV_REG_NR42       0x79
#define IRV_REG_NR43       0x7C
#define IRV_REG_NR44       0x7D
#define IRV_REG_NR50       0x80
#define IRV_REG_NR51       0x81
#define IRV_REG_SOUNDCNT_H 0x82
#define IRV_REG_SOUNDCNT_X 0x84
#define IRV_REG_WAVE_RAM   0x90

// GBATEK "GBA Interrupt Control"
#define IRV_REG_IE  0x200
#define IRV_REG_IF  0x202
#define IRV_REG_IME 0x208

#define IRV_INTR_VBLANK (1 << 0)
#define IRV_INTR_HBLANK (1 << 1)
#define IRV_INTR_VCOUNT (1 << 2)
#define IRV_INTR_DMA0   (1 << 8)

#endif // GUARD_IRV_GBA_H
