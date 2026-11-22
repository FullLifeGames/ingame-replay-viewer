#ifndef GUARD_IRV_LAYER_HOST_H
#define GUARD_IRV_LAYER_HOST_H

// The host harness of our platform layer (#43): one call as read from the input. Never part of
// the module.

#include <stdint.h>

#define MAX_ARGS 8

struct HostCall
{
    uint32_t argc;
    uint32_t args[MAX_ARGS];
    uint8_t *src;
    uint32_t srcLength;
    uint8_t *dest;
    uint32_t destLength;
    uint32_t result;
};

_Noreturn void Fail(const char *what);

// irv_layer_host_dma.c: the source is a script of DMA operations, the destination what its reads
// return.
void RunDmaScript(struct HostCall *call);

#endif // GUARD_IRV_LAYER_HOST_H
