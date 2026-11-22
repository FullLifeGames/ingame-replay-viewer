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
#define IRV_DISPCNT_WIN0         0x2000
#define IRV_DISPCNT_OBJ_WINDOW   0x8000
#define IRV_DISPCNT_WINDOWS      0xE000

// GBATEK "LCD I/O Window Feature", "LCD I/O Color Special Effects": the layers in the order of
// the WININ, WINOUT and BLDCNT bits. IRV_LAYER_NONE stands below the backdrop and is no target.
#define IRV_LAYER_OBJ      4
#define IRV_LAYER_BACKDROP 5
#define IRV_LAYER_NONE     6
#define IRV_WINDOW_OBJ     (1 << IRV_LAYER_OBJ)
#define IRV_WINDOW_EFFECT  (1 << 5)
#define IRV_WINDOW_ALL     0x3F

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

// A layer's pixel where it is opaque: its colour and its layer.
struct IrvPixel
{
    uint16_t colour;
    uint8_t layer;
};

// GBATEK "LCD I/O Color Special Effects": BLDCNT and the coefficients, read once per line.
struct IrvEffect
{
    uint16_t control;
    uint32_t eva;
    uint32_t evb;
    uint32_t evy;
};

// GBATEK "LCD I/O Color Special Effects", BLDCNT bits 6-7: the effect a pixel gets.
#define IRV_EFFECT_NONE  0
#define IRV_EFFECT_ALPHA 1
#define IRV_EFFECT_UP    2
#define IRV_EFFECT_DOWN  3

// GBATEK "LCD I/O Mosaic Function": the first position of the mosaic block that holds `position`,
// for a size field that holds the block's size minus 1. Blocks count from the screen's edge.
static inline uint32_t IrvRender_MosaicStart(uint32_t position, uint32_t sizeMinus1)
{
    return position - position % (sizeMinus1 + 1);
}

// irv_render.c: one visible line into `row`, BGR555.
void IrvRender_Line(uint32_t line, uint16_t *row);

// irv_render_bg.c: one line of a text background.
void IrvRender_TextBgLine(uint32_t bg, uint32_t line, uint16_t *out);

// irv_render_obj.c: the OBJ layer of one line.
void IrvRender_ObjLine(uint32_t line, struct IrvObjLine *out);

// irv_render_window.c: the WININ or WINOUT bits that hold at each pixel of the line.
void IrvRender_WindowLine(uint32_t line, const struct IrvObjLine *obj, uint8_t *enable);

// irv_render_blend.c: the line's effect settings; the effect a pixel gets whose top two layers are
// `top` and `below` (`semiTransparent` tells whether `top` is a semi-transparent OBJ); and the
// colour that effect gives.
void IrvRender_EffectLine(struct IrvEffect *effect);
uint32_t IrvRender_EffectOf(const struct IrvEffect *effect, const struct IrvPixel *top,
                            const struct IrvPixel *below, bool semiTransparent);
uint16_t IrvRender_ApplyEffect(const struct IrvEffect *effect, uint32_t kind, uint16_t top,
                               uint16_t below);

#ifdef IRV_HOST
// The host harness's trace of a frame, never in the module: for each pixel the colours of its top
// two layers, the effect it got and the coefficients, so that the mGBA oracle can tell our
// choice of layers and effect apart from the arithmetic of mGBA's frame.
struct IrvPixelTrace
{
    uint16_t top;
    uint16_t below;
    uint8_t effect;
    uint8_t eva;
    uint8_t evb;
    uint8_t evy;
};

extern struct IrvPixelTrace *gIrvPixelTrace;
#endif

#endif // GUARD_IRV_RENDER_H
