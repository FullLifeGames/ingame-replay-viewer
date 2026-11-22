#include <stdbool.h>
#include "irv_dma.h"
#include "irv_frame.h"
#include "irv_gba.h"
#include "irv_irq.h"
#include "irv_render.h"

// GBATEK "LCD Dimensions and Timings": 228 lines, of which 0-159 are drawn.
#define LINE_COUNT      228
#define LINE_VBLANK     IRV_SCREEN_HEIGHT
#define LINE_LAST_FLAG  226
#define LINE_RETURN     (LINE_VBLANK + 1)

// GBATEK "LCD I/O Interrupts and Status": VCOUNT holds the line, the VBlank flag is set in lines
// 160-226, and the V-Counter flag while VCOUNT equals DISPSTAT's LYC (bits 8-15), when the
// V-Counter IRQ is requested.
static void EnterLine(uint32_t line, bool raise)
{
    uint16_t dispstat = IRV_IO16(IRV_REG_DISPSTAT);
    bool match = (dispstat >> 8) == line;

    dispstat &= ~(IRV_DISPSTAT_VBLANK | IRV_DISPSTAT_HBLANK | IRV_DISPSTAT_VCOUNT);
    if (line >= LINE_VBLANK && line <= LINE_LAST_FLAG)
        dispstat |= IRV_DISPSTAT_VBLANK;
    if (match)
        dispstat |= IRV_DISPSTAT_VCOUNT;
    IRV_IO16(IRV_REG_VCOUNT) = line;
    IRV_IO16(IRV_REG_DISPSTAT) = dispstat;
    if (raise && match && (dispstat & IRV_DISPSTAT_VCOUNT_IRQ))
        IrvLayer_RaiseIrq(IRV_INTR_VCOUNT);
}

// The HBlank flag toggles in every line, and its IRQ with it. "GBA DMA Transfers": HBlank DMA
// runs in the visible lines only.
static void HBlank(uint32_t line)
{
    IRV_IO16(IRV_REG_DISPSTAT) |= IRV_DISPSTAT_HBLANK;
    if (line < LINE_VBLANK)
        RunDMAs(IRV_DMA_TIMING_HBLANK);
    if (IRV_IO16(IRV_REG_DISPSTAT) & IRV_DISPSTAT_HBLANK_IRQ)
        IrvLayer_RaiseIrq(IRV_INTR_HBLANK);
}

// "LCD I/O Interrupts and Status": VBlank DMA and the VBlank IRQ start with line 160. "LCD I/O BG
// Rotation/Scaling": the affine reference points reload in VBlank, before the game's handler.
static void VBlank(void)
{
    IrvRender_FrameStart();
    RunDMAs(IRV_DMA_TIMING_VBLANK);
    if (IRV_IO16(IRV_REG_DISPSTAT) & IRV_DISPSTAT_VBLANK_IRQ)
        IrvLayer_RaiseIrq(IRV_INTR_VBLANK);
}

// GBATEK "BIOS Halt Functions": VBlankIntrWait sets IME to 1 and waits for VBlank. The call runs
// the rest of the previous frame's VBlank lines, draws lines 0-159, starts VBlank at line 160
// and returns in line 161, where the game's main loop runs on a GBA.
void IrvLayer_RunFrame(uint16_t *frame)
{
    uint32_t line;

    IRV_IO16(IRV_REG_IME) = 1;
    for (line = LINE_RETURN; line < LINE_COUNT; line++)
    {
        EnterLine(line, true);
        HBlank(line);
    }
    for (line = 0; line < LINE_VBLANK; line++)
    {
        EnterLine(line, true);
        IrvRender_Line(line, frame + line * IRV_SCREEN_WIDTH);
        HBlank(line);
    }
    EnterLine(LINE_VBLANK, true);
    VBlank();
    HBlank(LINE_VBLANK);
    EnterLine(LINE_RETURN, false);
}
