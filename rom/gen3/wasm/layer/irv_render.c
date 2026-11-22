#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "irv_gba.h"
#include "irv_render.h"

#define BG_COUNT 4

#define BG_OFF    0
#define BG_TEXT   1
#define BG_AFFINE 2

// The bitmap modes 3-5 and the prohibited modes 6-7 are not drawn (plan B5, open decision 6).
#define LAST_TILE_MODE 2

struct BgLayer
{
    uint32_t bg;
    uint32_t priority;
    uint32_t kind;
};

// GBATEK "LCD I/O Display Control", the table of BG modes: mode 0 has four text BGs, mode 1 text
// BG0 and BG1 and affine BG2, mode 2 affine BG2 and BG3.
static uint32_t BgKind(uint32_t mode, uint32_t bg)
{
    if (mode == 0 || (mode == 1 && bg < 2))
        return BG_TEXT;
    if ((mode == 1 && bg == 2) || (mode == 2 && bg >= 2))
        return BG_AFFINE;
    return BG_OFF;
}

// The enabled BGs of the mode in front-to-back order. GBATEK "LCD I/O BG Control": a lower priority
// value lies in front, and among equal priorities the lower BG number.
static uint32_t SortBgs(uint16_t dispcnt, struct BgLayer *layers)
{
    uint32_t count = 0, priority, bg, kind;

    for (priority = 0; priority < 4; priority++)
    {
        for (bg = 0; bg < BG_COUNT; bg++)
        {
            kind = BgKind(dispcnt & IRV_DISPCNT_MODE, bg);
            if (!(dispcnt & (IRV_DISPCNT_BG0 << bg)) || kind == BG_OFF)
                continue;
            if ((IRV_IO16(IRV_REG_BG0CNT + 2 * bg) & 3) != priority)
                continue;
            layers[count].bg = bg;
            layers[count].priority = priority;
            layers[count].kind = kind;
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

// One colour on the whole line, and in the harness's trace.
static void FillLine(uint32_t lineNum, uint16_t *row, uint16_t colour)
{
    uint32_t x;

    for (x = 0; x < IRV_SCREEN_WIDTH; x++)
        row[x] = colour;
#ifdef IRV_HOST
    if (gIrvPixelTrace != NULL)
    {
        for (x = 0; x < IRV_SCREEN_WIDTH; x++)
            gIrvPixelTrace[lineNum * IRV_SCREEN_WIDTH + x].top = colour;
    }
#endif
}

static uint16_t Backdrop(void)
{
    return *(const uint16_t *)IRV_PTR(IRV_PRAM) & IRV_WHITE;
}

// No silent drop: the first line in a mode the layer does not draw says so, once per run.
static void BitmapLine(uint32_t lineNum, uint16_t *row, uint32_t mode)
{
    static bool sSaid;

    if (!sSaid)
    {
        printf("irv-layer: BG mode %u is not drawn; its lines show the backdrop\n", (unsigned)mode);
        sSaid = true;
    }
    FillLine(lineNum, row, Backdrop());
}

static void DrawLine(uint32_t lineNum, uint16_t *row)
{
    static struct Line sLine;
    uint16_t dispcnt = IRV_IO16(IRV_REG_DISPCNT);
    uint32_t i, x, bg;

    sLine.count = SortBgs(dispcnt, sLine.layers);
    for (i = 0; i < sLine.count; i++)
    {
        bg = sLine.layers[i].bg;
        if (sLine.layers[i].kind == BG_AFFINE)
            IrvRender_AffineBgLine(bg, sLine.bg[bg]);
        else
            IrvRender_TextBgLine(bg, lineNum, sLine.bg[bg]);
    }
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
    sLine.backdrop = Backdrop();
    sLine.number = lineNum;
    for (x = 0; x < IRV_SCREEN_WIDTH; x++)
        row[x] = ComposePixel(&sLine, x);
}

// GBATEK "LCD I/O Display Control": forced blank shows white lines. The affine reference points
// step after every line, drawn or not.
void IrvRender_Line(uint32_t lineNum, uint16_t *row)
{
    uint16_t dispcnt = IRV_IO16(IRV_REG_DISPCNT);
    uint32_t mode = dispcnt & IRV_DISPCNT_MODE;

    IrvRender_AffineLineStart(lineNum);
    if (dispcnt & IRV_DISPCNT_FORCED_BLANK)
        FillLine(lineNum, row, IRV_WHITE);
    else if (mode > LAST_TILE_MODE)
        BitmapLine(lineNum, row, mode);
    else
        DrawLine(lineNum, row);
    IrvRender_AffineLineEnd();
}
