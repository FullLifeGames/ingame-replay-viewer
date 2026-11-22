#include <stdbool.h>
#include "irv_gba.h"
#include "irv_render.h"

// GBATEK "LCD I/O Color Special Effects", BLDCNT bits 6-7.
#define EFFECT_NONE  0
#define EFFECT_ALPHA 1
#define EFFECT_UP    2
#define EFFECT_DOWN  3

#define CHANNEL_MAX 31

// BLDALPHA and BLDY: coefficients of 0..16 sixteenths, and 17..31 read as 16/16.
static uint32_t Coefficient(uint32_t value)
{
    value &= 0x1F;
    return value > 16 ? 16 : value;
}

void IrvRender_EffectLine(struct IrvEffect *effect)
{
    uint16_t alpha = IRV_IO16(IRV_REG_BLDALPHA);

    effect->control = IRV_IO16(IRV_REG_BLDCNT) & 0x3FFF;
    effect->eva = Coefficient(alpha);
    effect->evb = Coefficient(alpha >> 8);
    effect->evy = Coefficient(IRV_IO16(IRV_REG_BLDY));
}

// I = MIN(31, I1st*EVA + I2nd*EVB) for each of R, G and B; each product counts sixteenths, and the
// sum is rounded down.
static uint16_t Alpha(const struct IrvEffect *effect, uint16_t first, uint16_t second)
{
    uint32_t shift, intensity;
    uint16_t out = 0;

    for (shift = 0; shift < 15; shift += 5)
    {
        intensity = (((first >> shift) & CHANNEL_MAX) * effect->eva
                   + ((second >> shift) & CHANNEL_MAX) * effect->evb) >> 4;
        out |= (intensity > CHANNEL_MAX ? CHANNEL_MAX : intensity) << shift;
    }
    return out;
}

// I = I1st + (31-I1st)*EVY toward white, I = I1st - I1st*EVY toward black; the product counts
// sixteenths and is rounded down.
static uint16_t Brightness(const struct IrvEffect *effect, uint16_t colour, bool up)
{
    uint32_t shift, intensity;
    uint16_t out = 0;

    for (shift = 0; shift < 15; shift += 5)
    {
        intensity = (colour >> shift) & CHANNEL_MAX;
        if (up)
            intensity += ((CHANNEL_MAX - intensity) * effect->evy) >> 4;
        else
            intensity -= (intensity * effect->evy) >> 4;
        out |= intensity << shift;
    }
    return out;
}

// Alpha blending mixes the top pixel only when it is a 1st target and the next pixel down a 2nd
// one. "Semi-Transparent OBJs": such an OBJ is always a 1st target and always blends; where it
// overlaps a 2nd target, the brightness effect does not take place.
uint16_t IrvRender_Effect(const struct IrvEffect *effect, const struct IrvPixel *top,
                          const struct IrvPixel *below, bool semiTransparent)
{
    uint32_t mode = (effect->control >> 6) & 3;
    bool firstTarget = semiTransparent || ((effect->control >> top->layer) & 1);
    bool secondTarget = below->layer != IRV_LAYER_NONE && ((effect->control >> (8 + below->layer)) & 1);

    if (semiTransparent && secondTarget)
        return Alpha(effect, top->colour, below->colour);
    if (!firstTarget || mode == EFFECT_NONE)
        return top->colour;
    if (mode == EFFECT_ALPHA)
        return secondTarget ? Alpha(effect, top->colour, below->colour) : top->colour;
    return Brightness(effect, top->colour, mode == EFFECT_UP);
}
