#ifndef GUARD_IRV_LAYER_HOST_H
#define GUARD_IRV_LAYER_HOST_H

// The host harness of our platform layer (#43): one call as read from the input. Never part of
// the module.

#include <stdbool.h>
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

// irv_layer_host_script.c: the source is a script of operations on the GBA address space, the
// destination what its reads, frames and IRQ logs return.
void RunScript(struct HostCall *call);

// irv_layer_host_mp2k.c: the script's sound operation; true when it gives a result word.
bool HostSoundCall(uint32_t call, uint32_t a, uint32_t b, uint32_t *result);

// irv_layer_host_divide.c: the glue's division helpers on records of the source.
void RunDivide(struct HostCall *call);

#endif // GUARD_IRV_LAYER_HOST_H
