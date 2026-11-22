#include <stdbool.h>
#include "irv_gba.h"
#include "irv_render.h"

#define AFFINE_BG_FIRST 2
#define AFFINE_BG_COUNT 2

// GBATEK "LCD I/O BG Rotation/Scaling", Internal Reference Point Registers: the origin of the
// line being drawn, 8.8 fixed point. The layer keeps the register values it saw last, so that a
// write between lines restarts the internal point there. A write of the value already held does
// not restart it.
struct ReferencePoint
{
    int32_t x;
    int32_t y;
    uint32_t seenX;
    uint32_t seenY;
    // The point at the first line of the current vertical mosaic block.
    int32_t blockX;
    int32_t blockY;
};

static struct ReferencePoint sPoints[AFFINE_BG_COUNT];

static uint32_t Register(uint32_t index, uint32_t offset)
{
    return IRV_REG_BG2PA + index * IRV_AFFINE_STRIDE + offset;
}

// GBATEK: the reference point is 28 bits, bit 27 its sign; the bits above are ignored.
static int32_t Signed28(uint32_t value)
{
    return (int32_t)(value << 4) >> 4;
}

static void Reload(struct ReferencePoint *point, uint32_t index, bool always)
{
    uint32_t x = IRV_IO32(Register(index, IRV_AFFINE_X));
    uint32_t y = IRV_IO32(Register(index, IRV_AFFINE_Y));

    if (always || x != point->seenX)
        point->x = Signed28(x);
    if (always || y != point->seenY)
        point->y = Signed28(y);
    point->seenX = x;
    point->seenY = y;
}

// GBATEK: the reference points are copied to the internal registers during each VBlank.
void IrvRender_FrameStart(void)
{
    uint32_t i;

    for (i = 0; i < AFFINE_BG_COUNT; i++)
        Reload(&sPoints[i], i, true);
}

// GBATEK: a write outside VBlank copies the new value at once, so it gives the origin of the line
// the game wrote it before. "LCD I/O Mosaic Function": a line of a vertical block shows the
// block's first line, so the point of that line is kept.
void IrvRender_AffineLineStart(uint32_t line)
{
    uint32_t sizeMinus1 = (IRV_IO16(IRV_REG_MOSAIC) >> 4) & 0xF;
    uint32_t i;

    for (i = 0; i < AFFINE_BG_COUNT; i++)
    {
        Reload(&sPoints[i], i, false);
        if (IrvRender_MosaicStart(line, sizeMinus1) == line)
        {
            sPoints[i].blockX = sPoints[i].x;
            sPoints[i].blockY = sPoints[i].y;
        }
    }
}

// GBATEK: the internal registers step by PB (dmx) and PD (dmy) after each line.
void IrvRender_AffineLineEnd(void)
{
    uint32_t i;

    for (i = 0; i < AFFINE_BG_COUNT; i++)
    {
        sPoints[i].x += (int16_t)IRV_IO16(Register(i, IRV_AFFINE_PB));
        sPoints[i].y += (int16_t)IRV_IO16(Register(i, IRV_AFFINE_PD));
    }
}

struct AffineBg
{
    const uint16_t *palette;
    uint32_t charBase;
    uint32_t screenBase;
    uint32_t size;
    bool wrap;
};

// GBATEK "LCD I/O BG Control": a map of 128 << size pixels square, which wraps around with bit 13
// and else ends transparent. "LCD VRAM BG Screen Data Format (BG Map)": one byte per tile, rows of
// size / 8 tiles; "LCD VRAM Character Data": 256-colour tiles of 64 bytes, colour 0 transparent.
static uint16_t AffinePixel(const struct AffineBg *bg, int32_t texX, int32_t texY)
{
    uint32_t x, y, tile, index;

    if (bg->wrap)
    {
        texX &= bg->size - 1;
        texY &= bg->size - 1;
    }
    else if (texX < 0 || texY < 0 || texX >= (int32_t)bg->size || texY >= (int32_t)bg->size)
    {
        return IRV_PIXEL_NONE;
    }
    x = texX;
    y = texY;
    tile = IrvRender_BgVram(bg->screenBase + (y >> 3) * (bg->size >> 3) + (x >> 3));
    index = IrvRender_BgVram(bg->charBase + tile * 64 + (y & 7) * 8 + (x & 7));
    return index == 0 ? IRV_PIXEL_NONE : bg->palette[index] & IRV_WHITE;
}

// GBATEK "LCD I/O BG Rotation/Scaling": the pixel at x of a line lies at the line's origin plus x
// times PA (dx) and PC (dy). BGCNT bit 6 turns the mosaic on, as for a text BG.
void IrvRender_AffineBgLine(uint32_t bgNum, uint16_t *out)
{
    uint32_t index = bgNum - AFFINE_BG_FIRST;
    uint16_t control = IRV_IO16(IRV_REG_BG0CNT + 2 * bgNum);
    bool mosaic = (control & 0x40) != 0;
    int32_t pa = (int16_t)IRV_IO16(Register(index, 0));
    int32_t pc = (int16_t)IRV_IO16(Register(index, IRV_AFFINE_PC));
    int32_t texX = mosaic ? sPoints[index].blockX : sPoints[index].x;
    int32_t texY = mosaic ? sPoints[index].blockY : sPoints[index].y;
    struct AffineBg bg;
    uint32_t x;

    bg.palette = IRV_PTR(IRV_PRAM);
    bg.charBase = ((control >> 2) & 3) * 0x4000;
    bg.screenBase = ((control >> 8) & 0x1F) * 0x800;
    bg.size = 128 << (control >> 14);
    bg.wrap = (control & 0x2000) != 0;
    for (x = 0; x < IRV_SCREEN_WIDTH; x++)
    {
        out[x] = AffinePixel(&bg, texX >> 8, texY >> 8);
        texX += pa;
        texY += pc;
    }
    if (mosaic)
        IrvRender_MosaicRow(out, IRV_IO16(IRV_REG_MOSAIC) & 0xF);
}
