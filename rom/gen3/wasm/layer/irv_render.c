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

// The layers of the line being drawn.
struct Line
{
    struct BgLayer layers[BG_COUNT];
    uint32_t count;
    uint16_t bg[BG_COUNT][IRV_SCREEN_WIDTH];
    struct IrvObjLine obj;
    uint8_t enable[IRV_SCREEN_WIDTH];
    struct IrvEffect effect;
    uint16_t backdrop;
    uint32_t number;
};

static uint32_t Push(struct IrvPixel *pixels, uint32_t count, uint16_t colour, uint8_t layer)
{
    pixels[count].colour = colour;
    pixels[count].layer = layer;
    return count + 1;
}

// The top two opaque pixels at x among the layers the window enables. GBATEK "LCD OBJ - OAM
// Attributes", Priority: the OBJ lies in front of a BG of the same priority. "LCD Color
// Palettes": the backdrop (BG colour 0) lies below every layer. "LCD I/O Color Special Effects",
// "The OBJ Layer": only the OBJ in front takes part.
static void TopTwo(const struct Line *line, uint32_t x, struct IrvPixel *pixels)
{
    uint8_t enable = line->enable[x];
    uint8_t objPriority = line->obj.priority[x];
    bool obj = objPriority != IRV_OBJ_PRIORITY_NONE && (enable & IRV_WINDOW_OBJ);
    uint32_t count = 0, i, bg;

    for (i = 0; i < line->count && count < 2; i++)
    {
        bg = line->layers[i].bg;
        if (obj && objPriority <= line->layers[i].priority)
        {
            count = Push(pixels, count, line->obj.colour[x], IRV_LAYER_OBJ);
            obj = false;
        }
        if (count < 2 && (enable & (1 << bg)) && line->bg[bg][x] != IRV_PIXEL_NONE)
            count = Push(pixels, count, line->bg[bg][x], bg);
    }
    if (count < 2 && obj)
        count = Push(pixels, count, line->obj.colour[x], IRV_LAYER_OBJ);
    if (count < 2)
        count = Push(pixels, count, line->backdrop, IRV_LAYER_BACKDROP);
    if (count < 2)
        Push(pixels, count, 0, IRV_LAYER_NONE);
}

#ifdef IRV_HOST
static void Trace(const struct Line *line, uint32_t x, const struct IrvPixel *pixels, uint32_t kind)
{
    struct IrvPixelTrace *trace;

    if (gIrvPixelTrace == NULL)
        return;
    trace = &gIrvPixelTrace[line->number * IRV_SCREEN_WIDTH + x];
    trace->top = pixels[0].colour;
    trace->below = pixels[1].colour;
    trace->effect = kind;
    trace->eva = line->effect.eva;
    trace->evb = line->effect.evb;
    trace->evy = line->effect.evy;
}
#endif

// GBATEK "LCD I/O Window Feature": a pixel's window bit 5 enables the colour special effects.
static uint16_t ComposePixel(const struct Line *line, uint32_t x)
{
    struct IrvPixel pixels[2];
    uint32_t kind = IRV_EFFECT_NONE;

    TopTwo(line, x, pixels);
    if (line->enable[x] & IRV_WINDOW_EFFECT)
        kind = IrvRender_EffectOf(&line->effect, &pixels[0], &pixels[1],
                                  pixels[0].layer == IRV_LAYER_OBJ && line->obj.semiTransparent[x]);
#ifdef IRV_HOST
    Trace(line, x, pixels, kind);
#endif
    return IrvRender_ApplyEffect(&line->effect, kind, pixels[0].colour, pixels[1].colour);
}

// GBATEK "LCD I/O Display Control": forced blank shows white lines.
void IrvRender_Line(uint32_t lineNum, uint16_t *row)
{
    static struct Line sLine;
    uint16_t dispcnt = IRV_IO16(IRV_REG_DISPCNT);
    uint32_t i, x;

    if (dispcnt & IRV_DISPCNT_FORCED_BLANK)
    {
        for (x = 0; x < IRV_SCREEN_WIDTH; x++)
            row[x] = IRV_WHITE;
#ifdef IRV_HOST
        if (gIrvPixelTrace != NULL)
        {
            for (x = 0; x < IRV_SCREEN_WIDTH; x++)
                gIrvPixelTrace[lineNum * IRV_SCREEN_WIDTH + x].top = IRV_WHITE;
        }
#endif
        return;
    }
    sLine.count = SortBgs(dispcnt, sLine.layers);
    for (i = 0; i < sLine.count; i++)
        IrvRender_TextBgLine(sLine.layers[i].bg, lineNum, sLine.bg[sLine.layers[i].bg]);
    if (dispcnt & IRV_DISPCNT_OBJ)
    {
        IrvRender_ObjLine(lineNum, &sLine.obj);
    }
    else
    {
        memset(sLine.obj.priority, IRV_OBJ_PRIORITY_NONE, sizeof(sLine.obj.priority));
        memset(sLine.obj.window, 0, sizeof(sLine.obj.window));
    }
    IrvRender_WindowLine(lineNum, &sLine.obj, sLine.enable);
    IrvRender_EffectLine(&sLine.effect);
    sLine.backdrop = *(const uint16_t *)IRV_PTR(IRV_PRAM) & IRV_WHITE;
    sLine.number = lineNum;
    for (x = 0; x < IRV_SCREEN_WIDTH; x++)
        row[x] = ComposePixel(&sLine, x);
}
