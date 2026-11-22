#include <stdbool.h>
#include "irv_gba.h"
#include "irv_render.h"

// GBATEK "LCD VRAM Overview": in the tile modes, BG map and tile data share the first 64 KB.
#define BG_VRAM_SIZE 0x10000

struct TextBg
{
    const uint8_t *vram;
    const uint16_t *palette;
    uint32_t charBase;
    uint32_t screenBase;
    uint32_t width;
    bool colors256;
};

static uint8_t VramByte(const struct TextBg *bg, uint32_t offset)
{
    // GBATEK does not let BG data reach into the OBJ tiles; such a read is taken as colour 0.
    return offset < BG_VRAM_SIZE ? bg->vram[offset] : 0;
}

// GBATEK "LCD I/O BG Control": a text BG is one, two or four 32x32 screen blocks of 2 KB, SC0 at
// the screen base, SC1 at +2K, SC2 at +4K, SC3 at +6K; two of them stand side by side when the
// map is 512 pixels wide, else one above the other. "LCD VRAM BG Screen Data Format (BG Map)":
// one 16-bit entry per tile.
static uint16_t MapEntry(const struct TextBg *bg, uint32_t x, uint32_t y)
{
    uint32_t block = (x >> 8) + (y >> 8) * (bg->width >> 8);
    uint32_t offset = bg->screenBase + block * 0x800 + ((y >> 3) & 31) * 64 + ((x >> 3) & 31) * 2;

    return VramByte(bg, offset) | (VramByte(bg, offset + 1) << 8);
}

// GBATEK "LCD VRAM Character Data": 4 bpp tiles of 32 bytes, the low nibble the left pixel, with
// the entry's palette bank; 8 bpp tiles of 64 bytes from the whole BG palette. "LCD Color
// Palettes": colour 0 is transparent.
static uint16_t TilePixel(const struct TextBg *bg, uint16_t entry, uint32_t x, uint32_t y)
{
    uint32_t tile = entry & 0x3FF;
    uint32_t index;

    if (entry & 0x400)
        x = 7 - x;
    if (entry & 0x800)
        y = 7 - y;
    if (bg->colors256)
    {
        index = VramByte(bg, bg->charBase + tile * 64 + y * 8 + x);
    }
    else
    {
        index = (VramByte(bg, bg->charBase + tile * 32 + y * 4 + x / 2) >> ((x & 1) * 4)) & 0xF;
        if (index != 0)
            index += (entry >> 12) * 16;
    }
    return index == 0 ? IRV_PIXEL_NONE : bg->palette[index] & IRV_WHITE;
}

// GBATEK "LCD I/O BG Control", "LCD I/O BG Scrolling": the offsets are 9 bits, and the map wraps
// around at its own width and height.
void IrvRender_TextBgLine(uint32_t bgNum, uint32_t line, uint16_t *out)
{
    uint16_t control = IRV_IO16(IRV_REG_BG0CNT + 2 * bgNum);
    uint32_t hofs = IRV_IO16(IRV_REG_BG0HOFS + 4 * bgNum) & 0x1FF;
    uint32_t vofs = IRV_IO16(IRV_REG_BG0VOFS + 4 * bgNum) & 0x1FF;
    uint32_t height = (control & 0x8000) ? 512 : 256;
    struct TextBg bg;
    uint32_t x, y, mapX;
    uint16_t entry = 0;

    bg.vram = IRV_PTR(IRV_VRAM);
    bg.palette = IRV_PTR(IRV_PRAM);
    bg.charBase = ((control >> 2) & 3) * 0x4000;
    bg.screenBase = ((control >> 8) & 0x1F) * 0x800;
    bg.width = (control & 0x4000) ? 512 : 256;
    bg.colors256 = (control & 0x80) != 0;
    y = (line + vofs) & (height - 1);
    for (x = 0; x < IRV_SCREEN_WIDTH; x++)
    {
        mapX = (x + hofs) & (bg.width - 1);
        if (x == 0 || (mapX & 7) == 0)
            entry = MapEntry(&bg, mapX, y);
        out[x] = TilePixel(&bg, entry, mapX & 7, y & 7);
    }
}
