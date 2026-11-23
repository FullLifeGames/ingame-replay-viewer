#include <stddef.h>
#include "irv_gba.h"
#include "irv_irq.h"

static IrvIrqHandler sIrqHandler;

void IrvLayer_SetIrqHandler(IrvIrqHandler handler)
{
    sIrqHandler = handler;
}

// GBATEK "GBA Interrupt Control": a request sets its bit in IF, and it interrupts when IME bit 0
// and its bit in IE are set. The handler runs at once and acknowledges the request first, as the
// game's IntrMain does (crt0.s). The IO registers are plain memory here, so the layer clears the
// bit for it; a request held back stays in IF and is never delivered later.
void IrvLayer_RaiseIrq(uint16_t flag)
{
    IRV_IO16(IRV_REG_IF) |= flag;
    if (sIrqHandler == NULL || !(IRV_IO16(IRV_REG_IME) & 1) || !(IRV_IO16(IRV_REG_IE) & flag))
        return;
    IRV_IO16(IRV_REG_IF) &= ~flag;
    sIrqHandler(flag);
}
