#include "global.h"
#include "main.h"
#include "irv_frame.h"
#include "irv_irq.h"
#include <emscripten/em_js.h>

// The WebAssembly build (#35): the end of each frame. On the GBA, AgbMainLoop waits in the BIOS
// call VBlankIntrWait while the display draws, and the VBlank interrupt runs at line 160. Here the
// same call runs our platform layer's frame driver (#43), which draws the frame line by line,
// raises the VCount, HBlank and VBlank interrupts through the dispatch below, runs the HBlank and
// VBlank DMAs and returns in line 161; then the frame goes to the host.

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

void VBlankIntrWait(void)
{
    IrvLayer_RunFrame(sFrame);
    IrvWasm_HandOverFrame(sFrame);
}
