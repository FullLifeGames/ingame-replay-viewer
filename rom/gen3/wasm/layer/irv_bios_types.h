#ifndef GUARD_IRV_BIOS_TYPES_H
#define GUARD_IRV_BIOS_TYPES_H

// Our platform layer (#43): the data fields of the BIOS's rotation and scaling calls, in the
// layout GBATEK gives ("BIOS Rotation/Scaling Functions"). The game's own structs
// (gba/types.h) are held against these in rom/gen3/wasm/src/irv_wasm_layer_layout.c.

#include <stdint.h>

struct IrvBgAffineSource
{
    int32_t textureX; // 8 fractional bits
    int32_t textureY;
    int16_t screenX;
    int16_t screenY;
    int16_t scaleX;   // 8 fractional bits
    int16_t scaleY;
    uint16_t angle;   // a full turn is 0x10000; only the upper 8 bits count
};

struct IrvBgAffineDest
{
    int16_t pa;
    int16_t pb;
    int16_t pc;
    int16_t pd;
    int32_t startX;
    int32_t startY;
};

struct IrvObjAffineSource
{
    int16_t scaleX;
    int16_t scaleY;
    uint16_t angle;
};

#endif // GUARD_IRV_BIOS_TYPES_H
