#ifndef GUARD_IRV_IRQ_H
#define GUARD_IRV_IRQ_H

// Our platform layer (#43): interrupt requests. The layer raises them; the glue's handler runs
// the game's handler for the flag (rom/gen3/wasm/src/irv_wasm_frame.c).

#include <stdint.h>

typedef void (*IrvIrqHandler)(uint16_t flag);

void IrvLayer_SetIrqHandler(IrvIrqHandler handler);
void IrvLayer_RaiseIrq(uint16_t flag);

#endif // GUARD_IRV_IRQ_H
