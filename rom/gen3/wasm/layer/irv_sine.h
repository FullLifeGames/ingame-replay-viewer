#ifndef GUARD_IRV_SINE_H
#define GUARD_IRV_SINE_H

// Our platform layer (#43): the sine of the BIOS's rotation calls. GBATEK ("BIOS Rotation/Scaling
// Functions") gives angles as 0-0xFFFF for a full turn, of which the BIOS takes the upper 8 bits,
// and names no table, so ours comes from the mathematics: sin(i * pi / 128) for the steps of the
// first quarter, with 1.0 as 0x4000.

#include <stdint.h>

#define IRV_SINE_ONE      0x4000
#define IRV_SINE_QUARTER  64

extern const int16_t gIrvSineQuarter[IRV_SINE_QUARTER + 1];

// The sine and cosine of a step of a 256-step turn.
int32_t IrvSine(uint8_t step);
int32_t IrvCosine(uint8_t step);

#endif // GUARD_IRV_SINE_H
