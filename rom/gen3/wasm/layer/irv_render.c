#include <stdbool.h>
#include <string.h>
#include "irv_gba.h"
#include "irv_render.h"

#define BG_COUNT 4

struct BgLayer
{
    uint32_t bg;
    uint32_t priority;
};

// GBATEK "LCD I/O Display Control": BG0-BG3 are text BGs in mode 0, BG0 and BG1 in mode 1. The
// affine BGs of modes 1 and 2 and the bitmap modes 3-5 are not drawn yet.
static bool IsTextBg(uint32_t mode, uint32_t bg)
{
    return mode == 0 || (mode == 1 && bg < 2);
}

// The enabled text BGs in front-to-back order. GBATEK "LCD I/O BG Control": a lower priority
// value lies in front, and among equal priorities the lower BG number.
static uint32_t SortBgs(uint16_t dispcnt, struct BgLayer *layers)
{
    uint32_t count = 0, priority, bg;

    for (priority = 0; priority < 4; priority++)
    {
        for (bg = 0; bg < BG_COUNT; bg++)
        {
            if (!(dispcnt & (IRV_DISPCNT_BG0 << bg)) || !IsTextBg(dispcnt & IRV_DISPCNT_MODE, bg))
                continue;
            if ((IRV_IO16(IRV_REG_BG0CNT + 2 * bg) & 3) != priority)
                continue;
            layers[count].bg = bg;
            layers[count].priority = priority;
            count++;
        }
    }
    return count;
}

// GBATEK "LCD OBJ - OAM Attributes", Priority: an OBJ lies in front of a BG of the same priority.
// "LCD Color Palettes": where no layer is opaque, the backdrop (BG colour 0) shows.
static uint16_t FrontPixel(uint32_t x, const struct BgLayer *layers, uint32_t count,
                           uint16_t bgLines[BG_COUNT][IRV_SCREEN_WIDTH], const struct IrvObjLine *obj,
                           uint16_t backdrop)
{
    uint32_t i;
    uint16_t colour;

    for (i = 0; i < count; i++)
    {
        colour = bgLines[layers[i].bg][x];
        if (colour == IRV_PIXEL_NONE)
            continue;
        if (obj->priority[x] <= layers[i].priority)
            return obj->colour[x];
        return colour;
    }
    if (obj->priority[x] != IRV_OBJ_PRIORITY_NONE)
        return obj->colour[x];
    return backdrop;
}

// GBATEK "LCD I/O Display Control": forced blank shows white lines.
void IrvRender_Line(uint32_t line, uint16_t *row)
{
    static uint16_t sBgLines[BG_COUNT][IRV_SCREEN_WIDTH];
    static struct IrvObjLine sObj;
    uint16_t dispcnt = IRV_IO16(IRV_REG_DISPCNT);
    struct BgLayer layers[BG_COUNT];
    uint32_t count, i, x;
    uint16_t backdrop;

    if (dispcnt & IRV_DISPCNT_FORCED_BLANK)
    {
        for (x = 0; x < IRV_SCREEN_WIDTH; x++)
            row[x] = IRV_WHITE;
        return;
    }
    count = SortBgs(dispcnt, layers);
    for (i = 0; i < count; i++)
        IrvRender_TextBgLine(layers[i].bg, line, sBgLines[layers[i].bg]);
    if (dispcnt & IRV_DISPCNT_OBJ)
        IrvRender_ObjLine(line, &sObj);
    else
        memset(sObj.priority, IRV_OBJ_PRIORITY_NONE, sizeof(sObj.priority));
    backdrop = *(const uint16_t *)IRV_PTR(IRV_PRAM) & IRV_WHITE;
    for (x = 0; x < IRV_SCREEN_WIDTH; x++)
        row[x] = FrontPixel(x, layers, count, sBgLines, &sObj, backdrop);
}
