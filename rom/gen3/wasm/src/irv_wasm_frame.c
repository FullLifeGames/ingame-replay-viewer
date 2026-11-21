#include "global.h"
#include "main.h"
#include "platform/dma.h"
#include <emscripten/em_js.h>

// The WebAssembly build (#35): the end of each frame. On the GBA, AgbMainLoop waits in the BIOS
// call VBlankIntrWait while the display draws, and the VBlank interrupt runs at line 160. Here the
// same call draws the frame through the platform's renderer, which raises the VCount and HBlank
// interrupts line by line and runs the HBlank DMAs, then raises VBlank as the port's sdl2.c does,
// and hands the frame to the host.

// The VBlank handler's place in gIntrTable, in the order of gIntrTableTemplate (main.c).
#define INTR_INDEX_VBLANK 4
// The port's VDraw leaves VCOUNT here, inside the VBlank lines, so SetGpuReg in the main loop
// writes the registers at once, as on a GBA whose frame work ends before line 226.
#define VCOUNT_IN_VBLANK (DISPLAY_HEIGHT + 1)

// gba_easy_draw.c: draws lines 0 to 159 as BGR555, one u16 per pixel.
void DrawFrame(u16 *pixels);

static u16 sFrame[DISPLAY_WIDTH * DISPLAY_HEIGHT];

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
    DrawFrame(sFrame);
    REG_VCOUNT = VCOUNT_IN_VBLANK;
    REG_DISPSTAT |= DISPSTAT_VBLANK;
    RunDMAs(DMA_VBLANK);
    if (REG_DISPSTAT & DISPSTAT_VBLANK_INTR)
        gIntrTable[INTR_INDEX_VBLANK]();
    REG_DISPSTAT &= ~DISPSTAT_VBLANK;
    IrvWasm_HandOverFrame(sFrame);
}
