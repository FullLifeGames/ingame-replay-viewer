#include <stdbool.h>
#include <string.h>
#include "irv_gba.h"
#include "irv_render.h"

#define OBJ_COUNT     128
#define OBJ_TILES     0x10000
#define OBJ_PALETTE   256

// GBATEK "LCD OBJ - Overview": the OBJ rendering cycles of one line.
#define OBJ_CYCLES            1210
#define OBJ_CYCLES_HBLANK_FREE 954

// GBATEK "LCD OBJ - OAM Attributes": width and height by shape (square, horizontal, vertical)
// and size.
static const uint8_t sObjWidth[3][4] = {{8, 16, 32, 64}, {16, 32, 32, 64}, {8, 8, 16, 32}};
static const uint8_t sObjHeight[3][4] = {{8, 16, 32, 64}, {8, 8, 16, 32}, {16, 32, 32, 64}};

struct Obj
{
    uint16_t attr0;
    uint16_t attr1;
    uint16_t attr2;
    int32_t x;
    uint32_t width;
    uint32_t height;
    uint32_t boxWidth;
    uint32_t boxHeight;
    uint32_t row;
    uint32_t mosaicH;
};

struct ObjContext
{
    const uint8_t *vram;
    const uint16_t *palette;
    bool mapping1D;
    bool bitmapMode;
    struct IrvObjLine *out;
};

// GBATEK "LCD OBJ - VRAM Character (Tile) Mapping": with 2D mapping the tiles form a matrix of 32
// per row; with 1D mapping a row of the OBJ follows the one before it. Tile numbers count steps of
// 32 bytes, so an 8 bpp tile takes two. "LCD OBJ - OAM Attributes": in 2D mapping the low bit of
// an 8 bpp tile number is ignored, and in the bitmap modes tiles 0-511 are not displayed.
static uint32_t ObjTexel(const struct ObjContext *context, const struct Obj *obj, uint32_t x, uint32_t y)
{
    bool colors256 = (obj->attr0 & 0x2000) != 0;
    uint32_t unit = colors256 ? 2 : 1;
    uint32_t base = obj->attr2 & 0x3FF;
    uint32_t stride = context->mapping1D ? (obj->width / 8) * unit : 32;
    uint32_t tile;

    if (colors256 && !context->mapping1D)
        base &= ~1u;
    tile = (base + (y >> 3) * stride + (x >> 3) * unit) & 0x3FF;
    if (context->bitmapMode && tile < 512)
        return 0;
    if (colors256)
        return context->vram[OBJ_TILES + tile * 32 + (y & 7) * 8 + (x & 7)];
    return (context->vram[OBJ_TILES + tile * 32 + (y & 7) * 4 + (x & 7) / 2] >> ((x & 1) * 4)) & 0xF;
}

// GBATEK "LCD OBJ - OAM Attributes", Priority: OBJ0 lies above OBJ1-127 whatever their priority
// bits, so the first OBJ in OAM that is opaque at a pixel owns it. An OBJ of mode 2 draws no
// colour; its opaque pixels open the OBJ window.
static void Plot(const struct ObjContext *context, const struct Obj *obj, uint32_t screenX, uint32_t index)
{
    struct IrvObjLine *out = context->out;
    uint32_t mode = (obj->attr0 >> 10) & 3;

    if (index == 0)
        return;
    if (mode == IRV_OBJ_WINDOW)
    {
        out->window[screenX] = 1;
        return;
    }
    if (out->priority[screenX] != IRV_OBJ_PRIORITY_NONE)
        return;
    if (!(obj->attr0 & 0x2000))
        index += (obj->attr2 >> 12) * 16;
    out->colour[screenX] = context->palette[OBJ_PALETTE + index] & IRV_WHITE;
    out->priority[screenX] = (obj->attr2 >> 10) & 3;
    out->semiTransparent[screenX] = mode == IRV_OBJ_SEMI_TRANSPARENT;
}

// The X coordinate is 9 bits and wraps at 512, so X 500 starts 12 pixels left of the screen.
static bool OnScreen(const struct Obj *obj, uint32_t boxX, uint32_t *screenX)
{
    *screenX = (obj->x + boxX) & 0x1FF;
    return *screenX < IRV_SCREEN_WIDTH;
}

// GBATEK "LCD I/O Mosaic Function": under the OBJ mosaic, column i of the OBJ's area shows the
// column at the first pixel of its screen block; none where that pixel lies left of the area.
static bool MosaicColumn(const struct Obj *obj, uint32_t i, uint32_t screenX, uint32_t *column)
{
    uint32_t back;

    if (obj->mosaicH == 0)
    {
        *column = i;
        return true;
    }
    back = screenX - IrvRender_MosaicStart(screenX, obj->mosaicH);
    *column = i - back;
    return back <= i;
}

static void DrawRegular(const struct ObjContext *context, const struct Obj *obj)
{
    uint32_t y = (obj->attr1 & 0x2000) ? obj->height - 1 - obj->row : obj->row;
    uint32_t i, x, column, screenX;

    for (i = 0; i < obj->width; i++)
    {
        if (!OnScreen(obj, i, &screenX) || !MosaicColumn(obj, i, screenX, &column))
            continue;
        x = (obj->attr1 & 0x1000) ? obj->width - 1 - column : column;
        Plot(context, obj, screenX, ObjTexel(context, obj, x, y));
    }
}

// GBATEK "LCD OBJ - OAM Rotation/Scaling Parameters": group n's PA, PB, PC and PD sit at OAM
// bytes 32n+6, +14, +22 and +30, signed 8.8. The matrix maps a screen pixel's distance from the
// centre of the OBJ's area (twice its size with Double-Size) to a texel's distance from the
// OBJ's centre; texels outside the OBJ are transparent.
static void DrawAffine(const struct ObjContext *context, const struct Obj *obj)
{
    const int16_t *params = (const int16_t *)IRV_PTR(IRV_OAM) + ((obj->attr1 >> 9) & 0x1F) * 16;
    int32_t pa = params[3], pb = params[7], pc = params[11], pd = params[15];
    int32_t dy = (int32_t)obj->row - (int32_t)(obj->boxHeight / 2);
    int32_t dx, tx, ty;
    uint32_t i, column, screenX;

    for (i = 0; i < obj->boxWidth; i++)
    {
        if (!OnScreen(obj, i, &screenX) || !MosaicColumn(obj, i, screenX, &column))
            continue;
        dx = (int32_t)column - (int32_t)(obj->boxWidth / 2);
        tx = ((pa * dx + pb * dy) >> 8) + (int32_t)(obj->width / 2);
        ty = ((pc * dx + pd * dy) >> 8) + (int32_t)(obj->height / 2);
        if (tx < 0 || ty < 0 || tx >= (int32_t)obj->width || ty >= (int32_t)obj->height)
            continue;
        Plot(context, obj, screenX, ObjTexel(context, obj, tx, ty));
    }
}

// GBATEK "LCD I/O Mosaic Function": attribute 0 bit 12 turns the mosaic on, MOSAIC bits 8-11 and
// 12-15 size the OBJ blocks. The line shows the OBJ's row at the first line of its block, which
// may lie above the OBJ: then the row is past the area, and nothing is drawn.
static void MosaicObj(struct Obj *obj, uint32_t line)
{
    uint16_t mosaic = IRV_IO16(IRV_REG_MOSAIC);

    obj->mosaicH = (mosaic >> 8) & 0xF;
    obj->row = (IrvRender_MosaicStart(line, mosaic >> 12) - (obj->attr0 & 0xFF)) & 0xFF;
}

// Reads OBJ n and tells whether it covers the line. "LCD OBJ - OAM Attributes": bit 9 of
// attribute 0 hides a regular OBJ and doubles an affine one's area; shape 3 and mode 3 are
// prohibited. A Y of 0-255 wraps, so an OBJ near the bottom reaches the top lines.
static bool ReadObj(const uint16_t *oam, uint32_t n, uint32_t line, struct Obj *obj)
{
    uint32_t shape, size;
    bool affine;

    obj->attr0 = oam[n * 4];
    obj->attr1 = oam[n * 4 + 1];
    obj->attr2 = oam[n * 4 + 2];
    affine = (obj->attr0 & 0x100) != 0;
    shape = obj->attr0 >> 14;
    if ((!affine && (obj->attr0 & 0x200)) || shape == 3 || ((obj->attr0 >> 10) & 3) == 3)
        return false;
    size = obj->attr1 >> 14;
    obj->width = sObjWidth[shape][size];
    obj->height = sObjHeight[shape][size];
    obj->boxWidth = (affine && (obj->attr0 & 0x200)) ? obj->width * 2 : obj->width;
    obj->boxHeight = (affine && (obj->attr0 & 0x200)) ? obj->height * 2 : obj->height;
    obj->x = obj->attr1 & 0x1FF;
    obj->row = (line - (obj->attr0 & 0xFF)) & 0xFF;
    obj->mosaicH = 0;
    if (obj->row >= obj->boxHeight)
        return false;
    if (obj->attr0 & 0x1000)
        MosaicObj(obj, line);
    return true;
}

// GBATEK "LCD OBJ - Overview": a regular OBJ costs one cycle per pixel of its width, an affine
// one 10 plus two per pixel of its area's width, whether on screen or not. The OBJs are taken in
// OAM order; the first that no longer fits ends the line.
void IrvRender_ObjLine(uint32_t line, struct IrvObjLine *out)
{
    const uint16_t *oam = IRV_PTR(IRV_OAM);
    uint16_t dispcnt = IRV_IO16(IRV_REG_DISPCNT);
    uint32_t cycles = (dispcnt & IRV_DISPCNT_HBLANK_FREE) ? OBJ_CYCLES_HBLANK_FREE : OBJ_CYCLES;
    struct ObjContext context;
    struct Obj obj;
    uint32_t n, cost;

    context.vram = IRV_PTR(IRV_VRAM);
    context.palette = IRV_PTR(IRV_PRAM);
    context.mapping1D = (dispcnt & IRV_DISPCNT_OBJ_1D) != 0;
    context.bitmapMode = (dispcnt & IRV_DISPCNT_MODE) >= 3;
    context.out = out;
    memset(out->priority, IRV_OBJ_PRIORITY_NONE, sizeof(out->priority));
    memset(out->window, 0, sizeof(out->window));
    for (n = 0; n < OBJ_COUNT; n++)
    {
        if (!ReadObj(oam, n, line, &obj))
            continue;
        cost = (obj.attr0 & 0x100) ? 10 + obj.boxWidth * 2 : obj.width;
        if (cost > cycles)
            break;
        cycles -= cost;
        if (obj.row >= obj.boxHeight)
            continue;
        if (obj.attr0 & 0x100)
            DrawAffine(&context, &obj);
        else
            DrawRegular(&context, &obj);
    }
}
