#include <stdbool.h>
#include <string.h>
#include "irv_gba.h"
#include "irv_render.h"

#define WINDOW_COUNT 2

// GBATEK "LCD I/O Window Feature": X2 and Y2 are the right and bottom edges plus 1, and values of
// X2>240 or X1>X2 read as X2=240, of Y2>160 or Y1>Y2 as Y2=160.
static uint32_t FarEdge(uint32_t nearEdge, uint32_t farEdge, uint32_t limit)
{
    return (farEdge > limit || nearEdge > farEdge) ? limit : farEdge;
}

// Paints window n's WININ bits over the pixels it covers on the line. WIN0H, WIN1H, WIN0V and
// WIN1V hold the far edge in bits 0-7 and the near edge in bits 8-15.
static void PaintWindow(uint32_t n, uint32_t line, uint8_t *enable)
{
    uint16_t h = IRV_IO16(IRV_REG_WIN0H + 2 * n);
    uint16_t v = IRV_IO16(IRV_REG_WIN0V + 2 * n);
    uint32_t x1 = h >> 8, x2 = FarEdge(x1, h & 0xFF, IRV_SCREEN_WIDTH);
    uint32_t y1 = v >> 8, y2 = FarEdge(y1, v & 0xFF, IRV_SCREEN_HEIGHT);

    if (line < y1 || line >= y2 || x1 >= x2)
        return;
    memset(enable + x1, (IRV_IO16(IRV_REG_WININ) >> (8 * n)) & IRV_WINDOW_ALL, x2 - x1);
}

// "Window Priority": window 0 lies above window 1, window 1 above the OBJ window, and every pixel
// outside them takes WINOUT's bits 0-5. With no window on, every layer and the effects show.
// "The OBJ Window": its region needs DISPCNT bits 12 and 15, and takes WINOUT's bits 8-13 where
// an OBJ of mode 2 is opaque.
void IrvRender_WindowLine(uint32_t line, const struct IrvObjLine *obj, uint8_t *enable)
{
    uint16_t dispcnt = IRV_IO16(IRV_REG_DISPCNT);
    uint16_t winout = IRV_IO16(IRV_REG_WINOUT);
    uint32_t x, n;

    if (!(dispcnt & IRV_DISPCNT_WINDOWS))
    {
        memset(enable, IRV_WINDOW_ALL, IRV_SCREEN_WIDTH);
        return;
    }
    memset(enable, winout & IRV_WINDOW_ALL, IRV_SCREEN_WIDTH);
    if ((dispcnt & IRV_DISPCNT_OBJ_WINDOW) && (dispcnt & IRV_DISPCNT_OBJ))
    {
        for (x = 0; x < IRV_SCREEN_WIDTH; x++)
        {
            if (obj->window[x])
                enable[x] = (winout >> 8) & IRV_WINDOW_ALL;
        }
    }
    for (n = WINDOW_COUNT; n-- > 0;)
    {
        if (dispcnt & (IRV_DISPCNT_WIN0 << n))
            PaintWindow(n, line, enable);
    }
}
