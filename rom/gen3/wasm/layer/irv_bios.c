#include <math.h>
#include <string.h>
#include "irv_bios.h"
#include "irv_sine.h"

#define IRV_PI 3.14159265358979323846

// Our platform layer (#43): the BIOS calls of the game, from GBATEK's descriptions. In the module
// the GBA addresses are linear memory, so a call works on its pointers as given. Units are read
// and written through memcpy: wasm32 aligns some of the game's structs to 2 where the GBA build
// aligns them to 4, and the BIOS's own masking of the low address bits would then move a copy.

// GBATEK "BIOS Memory Copy", CpuSet: bits 0-20 count halfwords or words (bit 26), bit 24 fills
// from the first source unit. The copy runs upwards one unit at a time.
void CpuSet(const void *src, void *dest, uint32_t control)
{
    const uint8_t *from = src;
    uint8_t *to = dest;
    uint32_t count = control & IRV_CPU_SET_COUNT;
    uint32_t unit = (control & IRV_CPU_SET_32BIT) ? 4 : 2;
    uint32_t step = (control & IRV_CPU_SET_SRC_FIXED) ? 0 : unit;
    uint32_t i;

    for (i = 0; i < count; i++)
    {
        uint32_t value;

        memcpy(&value, from + i * step, unit);
        memcpy(to + i * unit, &value, unit);
    }
}

// GBATEK "BIOS Memory Copy", CpuFastSet: words only, the count rounded up to a multiple of 8.
void CpuFastSet(const void *src, void *dest, uint32_t control)
{
    uint32_t count = ((control & IRV_CPU_SET_COUNT) + 7) & ~7u;

    CpuSet(src, dest, count | IRV_CPU_SET_32BIT | (control & IRV_CPU_SET_SRC_FIXED));
}

// The output of an LZ77 stream: bytes, or halfwords as the Vram call writes them.
struct IrvLz77Out
{
    uint8_t *dest;
    uint32_t written;
    uint32_t size;
    int halfwords;
    uint8_t pending; // the even byte of a halfword not yet written
};

static void IrvLz77_Put(struct IrvLz77Out *out, uint8_t byte)
{
    if (!out->halfwords)
    {
        out->dest[out->written] = byte;
    }
    else if (out->written & 1)
    {
        out->dest[out->written - 1] = out->pending;
        out->dest[out->written] = byte;
    }
    else
    {
        out->pending = byte;
    }
    out->written++;
}

// GBATEK "BIOS Decompression Functions", LZ77UnComp: a header word (type in bits 4-7, the size in
// bits 8-31), then flag bytes, each for the next eight blocks, most significant bit first. A block
// is a byte to copy (flag 0) or two bytes (flag 1): length - 3 in bits 4-7 of the first, a
// distance - 1 in its bits 0-3 and the second. Nothing is written past the size. The Vram call
// writes halfwords, so a copy from one byte back reads what the destination held (GBATEK's
// caution on disp 0); an odd size writes its last byte with the byte after it as found.
static void IrvLz77_Run(const uint8_t *src, struct IrvLz77Out *out)
{
    while (out->written < out->size)
    {
        uint8_t flags = *src++;
        int block;

        for (block = 0; block < 8 && out->written < out->size; block++, flags <<= 1)
        {
            uint32_t length, distance;

            if (!(flags & 0x80))
            {
                IrvLz77_Put(out, *src++);
                continue;
            }
            length = (src[0] >> 4) + 3;
            distance = (((src[0] & 0xF) << 8) | src[1]) + 1;
            src += 2;
            while (length-- > 0 && out->written < out->size)
                IrvLz77_Put(out, out->dest[out->written - distance]);
        }
    }
    if (out->halfwords && (out->written & 1))
        out->dest[out->written - 1] = out->pending;
}

static void IrvLz77_UnComp(const uint32_t *src, void *dest, int halfwords)
{
    const uint8_t *bytes = (const uint8_t *)src;
    struct IrvLz77Out out = {0};

    out.dest = dest;
    out.size = bytes[1] | (bytes[2] << 8) | ((uint32_t)bytes[3] << 16);
    out.halfwords = halfwords;
    IrvLz77_Run(bytes + 4, &out);
}

void LZ77UnCompWram(const uint32_t *src, void *dest)
{
    IrvLz77_UnComp(src, dest, 0);
}

void LZ77UnCompVram(const uint32_t *src, void *dest)
{
    IrvLz77_UnComp(src, dest, 1);
}

// GBATEK "BIOS Arithmetic Functions", Sqrt: the integer square root, rounded down.
uint16_t Sqrt(uint32_t num)
{
    uint32_t root = 0;
    uint32_t bit = 1u << 30;

    while (bit > num)
        bit >>= 2;
    while (bit != 0)
    {
        if (num >= root + bit)
        {
            num -= root + bit;
            root = (root >> 1) + bit;
        }
        else
        {
            root >>= 1;
        }
        bit >>= 2;
    }
    return root;
}

// GBATEK "BIOS Arithmetic Functions", ArcTan2: the angle of (x, y), 0-0xFFFF for 0 <= theta < 2 pi.
// GBATEK names no method, so ours is the mathematics, rounded to the nearest step.
uint16_t ArcTan2(int16_t x, int16_t y)
{
    double turns = atan2(y, x) / (2 * IRV_PI);

    if (turns < 0)
        turns += 1;
    return (uint16_t)lround(turns * 0x10000);
}

// GBATEK "BIOS Rotation/Scaling Functions": from the ratios and the angle's upper 8 bits,
// pa = sx cos, pb = -sx sin, pc = sy sin, pd = sy cos, 8 fractional bits as the ratios have.
static void IrvAffine_Matrix(int16_t scaleX, int16_t scaleY, uint16_t angle, int16_t *matrix)
{
    int32_t sine = IrvSine(angle >> 8);
    int32_t cosine = IrvCosine(angle >> 8);

    matrix[0] = (scaleX * cosine) >> 14;
    matrix[1] = -((scaleX * sine) >> 14);
    matrix[2] = (scaleY * sine) >> 14;
    matrix[3] = (scaleY * cosine) >> 14;
}

// The start point puts the texture's centre on the screen's: start = texture - matrix * screen.
void BgAffineSet(struct IrvBgAffineSource *src, struct IrvBgAffineDest *dest, int32_t count)
{
    for (; count > 0; count--, src++, dest++)
    {
        int16_t m[4];

        IrvAffine_Matrix(src->scaleX, src->scaleY, src->angle, m);
        dest->pa = m[0];
        dest->pb = m[1];
        dest->pc = m[2];
        dest->pd = m[3];
        dest->startX = src->textureX - (m[0] * src->screenX + m[1] * src->screenY);
        dest->startY = src->textureY - (m[2] * src->screenX + m[3] * src->screenY);
    }
}

// The four values go every `offset` bytes from dest (2 together, 8 into OAM), the next matrix
// 4 * offset bytes on.
void ObjAffineSet(struct IrvObjAffineSource *src, void *dest, int32_t count, int32_t offset)
{
    uint8_t *to = dest;

    for (; count > 0; count--, src++, to += 4 * offset)
    {
        int16_t m[4];
        int i;

        IrvAffine_Matrix(src->scaleX, src->scaleY, src->angle, m);
        for (i = 0; i < 4; i++)
            memcpy(to + i * offset, &m[i], sizeof(m[i]));
    }
}
