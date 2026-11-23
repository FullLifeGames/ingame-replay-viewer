#ifndef GUARD_IRV_BIOS_H
#define GUARD_IRV_BIOS_H

// Our platform layer (#43): the BIOS calls the game makes, under the names of the expansion's
// gba/syscall.h, written from GBATEK's descriptions. The game's objects call them as their SWIs.

#include <stdint.h>
#include "irv_bios_types.h"

// GBATEK "BIOS Memory Copy"
#define IRV_CPU_SET_COUNT      0x001FFFFF
#define IRV_CPU_SET_SRC_FIXED  (1 << 24)
#define IRV_CPU_SET_32BIT      (1 << 26)

void CpuSet(const void *src, void *dest, uint32_t control);
void CpuFastSet(const void *src, void *dest, uint32_t control);
void LZ77UnCompWram(const uint32_t *src, void *dest);
void LZ77UnCompVram(const uint32_t *src, void *dest);
uint16_t Sqrt(uint32_t num);
uint16_t ArcTan2(int16_t x, int16_t y);
void BgAffineSet(struct IrvBgAffineSource *src, struct IrvBgAffineDest *dest, int32_t count);
void ObjAffineSet(struct IrvObjAffineSource *src, void *dest, int32_t count, int32_t offset);

#endif // GUARD_IRV_BIOS_H
