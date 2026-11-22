#ifndef GUARD_IRV_PSG_H
#define GUARD_IRV_PSG_H

// Our platform layer (#43): the four PSG channels of the GBA's sound controller (two tones, the
// wave channel and the noise), synthesised from the sound registers that the game writes. GBATEK
// "GBA Sound Channel 1 - Tone & Sweep" to "GBA Sound Channel 4 - Noise" and "GBA Sound Control
// Registers".
//
// The output is left and right floats in GBATEK's output units ("Max Output Levels"): one channel
// at full volume spans -0x80..+0x80, so the four together reach +/-0x200 on each side, the range
// of one FIFO. The mixer adds the FIFOs' units, the bias and the clip ("GBA Sound Control
// Registers", SOUNDBIAS).

#include <stdint.h>

// Starts the PSG anew: every channel off, the frame sequencer at its first step, the wave RAM's
// two banks cleared. `rate` is the output's pairs per second (the mixer's rate).
void IrvPsg_Reset(uint32_t rate);

// One frame of the PSG: reads the sound registers once, restarts the channels whose Initial bit
// is set and clears that write-only bit in the register, then writes `count` pairs (left, right)
// to `pairs`. The ON flags of SOUNDCNT_X follow the channels at the end.
void IrvPsg_Frame(float *pairs, uint32_t count);

#endif // GUARD_IRV_PSG_H
