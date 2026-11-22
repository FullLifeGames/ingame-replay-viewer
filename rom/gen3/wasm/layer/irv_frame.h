#ifndef GUARD_IRV_FRAME_H
#define GUARD_IRV_FRAME_H

// Our platform layer (#43): the frame driver. One call runs the display from line 161 of the
// previous frame through line 160 of this one and returns in line 161, inside VBlank, as
// VBlankIntrWait does on a GBA. It draws lines 0-159 into `frame`, 240x160 BGR555.

#include <stdint.h>

void IrvLayer_RunFrame(uint16_t *frame);

#endif // GUARD_IRV_FRAME_H
