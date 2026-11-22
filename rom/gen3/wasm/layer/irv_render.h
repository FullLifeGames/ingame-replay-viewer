#ifndef GUARD_IRV_RENDER_H
#define GUARD_IRV_RENDER_H

// Our platform layer (#43): the scanline renderer. It draws one line at a time from IO, palette
// RAM, VRAM and OAM as they are when the frame driver reaches the line, so a register written
// between lines (by an HBlank DMA or a line interrupt) moves only the lines after it.

#include <stdbool.h>
#include <stdint.h>

#define IRV_SCREEN_WIDTH  240
#define IRV_SCREEN_HEIGHT 160

// GBATEK "LCD Color Palettes": BGR555 in bits 0-14. A layer's line buffer marks a transparent
// pixel with bit 15.
#define IRV_PIXEL_NONE 0x8000
#define IRV_WHITE      0x7FFF

// GBATEK "LCD I/O Display Control"
#define IRV_DISPCNT_MODE         0x0007
#define IRV_DISPCNT_HBLANK_FREE  0x0020
#define IRV_DISPCNT_OBJ_1D       0x0040
#define IRV_DISPCNT_FORCED_BLANK 0x0080
#define IRV_DISPCNT_BG0          0x0100
#define IRV_DISPCNT_OBJ          0x1000

#define IRV_OBJ_PRIORITY_NONE 4

// GBATEK "LCD OBJ - OAM Attributes", OBJ Mode
#define IRV_OBJ_SEMI_TRANSPARENT 1
#define IRV_OBJ_WINDOW           2

// The OBJ layer of one line: the colour and priority of the OBJ in front at each pixel, its mode
// bits, and the OBJ window's mask (drawn by OBJs of mode 2, which show no colour).
struct IrvObjLine
{
    uint16_t colour[IRV_SCREEN_WIDTH];
    uint8_t priority[IRV_SCREEN_WIDTH];
    uint8_t semiTransparent[IRV_SCREEN_WIDTH];
    uint8_t window[IRV_SCREEN_WIDTH];
};

// irv_render.c: one visible line into `row`, BGR555.
void IrvRender_Line(uint32_t line, uint16_t *row);

// irv_render_bg.c: one line of a text background.
void IrvRender_TextBgLine(uint32_t bg, uint32_t line, uint16_t *out);

// irv_render_obj.c: the OBJ layer of one line.
void IrvRender_ObjLine(uint32_t line, struct IrvObjLine *out);

#endif // GUARD_IRV_RENDER_H
