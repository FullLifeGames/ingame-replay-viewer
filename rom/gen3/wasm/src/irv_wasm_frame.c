#include "global.h"
#include "main.h"
#include "irv_dma.h"
#include "irv_irq.h"
#include <emscripten/em_js.h>

// The WebAssembly build (#35): the end of each frame. On the GBA, AgbMainLoop waits in the BIOS
// call VBlankIntrWait while the display draws, and the VBlank interrupt runs at line 160. Here the
// same call draws the frame through the platform's renderer, which raises the VCount and HBlank
// interrupts line by line and runs the HBlank DMAs, then raises VBlank as the port's sdl2.c does,
// and hands the frame to the host. Our platform layer (#43) runs the DMAs and raises the
// interrupts it owns through the dispatch below.

// The port's VDraw leaves VCOUNT here, inside the VBlank lines, so SetGpuReg in the main loop
// writes the registers at once, as on a GBA whose frame work ends before line 226.
#define VCOUNT_IN_VBLANK (DISPLAY_HEIGHT + 1)

// gba_easy_draw.c: draws lines 0 to 159 as BGR555, one u16 per pixel.
void DrawFrame(u16 *pixels);

static u16 sFrame[DISPLAY_WIDTH * DISPLAY_HEIGHT];

// The order in which IntrMain (crt0.s) tests IE & IF, which is the order of gIntrTable
// (gIntrTableTemplate in main.c).
static const u16 sIntrOrder[] = {
    INTR_FLAG_VCOUNT, INTR_FLAG_SERIAL, INTR_FLAG_TIMER3, INTR_FLAG_HBLANK, INTR_FLAG_VBLANK,
    INTR_FLAG_TIMER0, INTR_FLAG_TIMER1, INTR_FLAG_TIMER2, INTR_FLAG_DMA0, INTR_FLAG_DMA1,
    INTR_FLAG_DMA2, INTR_FLAG_DMA3, INTR_FLAG_KEYPAD, INTR_FLAG_GAMEPAK,
};

// IntrMain's place: the layer has acknowledged the request; this runs the game's handler.
static void DispatchIrq(u16 flag)
{
    u32 i;

    for (i = 0; i < ARRAY_COUNT(sIntrOrder); i++)
    {
        if (sIntrOrder[i] == flag)
        {
            gIntrTable[i]();
            return;
        }
    }
}

__attribute__((constructor)) static void InitIrqDispatch(void)
{
    IrvLayer_SetIrqHandler(DispatchIrq);
}

// The host's frame import. It returns, and the game runs the next frame; it blocks first, and the
// host paces the game; or it throws, and the throw ends AgbMain. A throw must not be a number:
// Emscripten's setjmp support reads a thrown number as a longjmp.
EM_JS(void, IrvWasm_HandOverFrame, (const u16 *pixels), {
    if (typeof Module.irvFrame !== 'function')
        throw new Error('irv-emerald: the host passed no irvFrame function');
    Module.irvFrame(pixels);
});

// GBATEK "BIOS Halt Functions": VBlankIntrWait runs IntrWait, which sets IME to 1. "LCD I/O
// Interrupts and Status": the VBlank request needs DISPSTAT bit 3.
void VBlankIntrWait(void)
{
    REG_IME = 1;
    DrawFrame(sFrame);
    REG_VCOUNT = VCOUNT_IN_VBLANK;
    REG_DISPSTAT |= DISPSTAT_VBLANK;
    RunDMAs(IRV_DMA_TIMING_VBLANK);
    if (REG_DISPSTAT & DISPSTAT_VBLANK_INTR)
        IrvLayer_RaiseIrq(INTR_FLAG_VBLANK);
    REG_DISPSTAT &= ~DISPSTAT_VBLANK;
    IrvWasm_HandOverFrame(sFrame);
}
