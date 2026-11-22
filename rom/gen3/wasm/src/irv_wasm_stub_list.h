#ifndef GUARD_IRV_WASM_STUB_LIST_H
#define GUARD_IRV_WASM_STUB_LIST_H

#include <string.h>

// The WebAssembly build (#46): the stubs of irv_wasm_stubs.c that a replay run may call. InitRFU
// calls these four at boot, and the runs of rom:shots' streams reach no other stub. A call to any
// other stub stops the run with the stub's name. irv_wasm_stubs.c and scripts/wasm-stubs.test.ts
// both read this list.
static const char *const sStubsARunMayCall[] =
{
    "rfu_initializeAPI",
    "rfu_setTimerInterrupt",
    "rfu_REQ_stopMode",
    "rfu_waitREQComplete",
};

static inline int IrvWasm_StubMayRun(const char *name)
{
    unsigned int i;

    for (i = 0; i < sizeof(sStubsARunMayCall) / sizeof(sStubsARunMayCall[0]); i++)
    {
        if (strcmp(sStubsARunMayCall[i], name) == 0)
            return 1;
    }
    return 0;
}

#endif // GUARD_IRV_WASM_STUB_LIST_H
