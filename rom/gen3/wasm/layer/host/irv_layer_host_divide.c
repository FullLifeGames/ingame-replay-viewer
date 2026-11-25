// The glue's division helpers (#66, rom/gen3/wasm/src/irv_wasm_divide.c) for the specs. Never part
// of the module. The source holds records of five words: the op's index in DIVIDE_OPS of
// scripts/wasm-divide.ts, then the numerator and the divisor, two words each, low word first. The
// destination takes the result of each record in eight bytes; a 32-bit op reads the low words and
// leaves the high word of its result 0.
#include <stdint.h>
#include <string.h>
#include "irv_wasm_divide.h"
#include "irv_layer_host.h"

#define RECORD_WORDS 5
#define RESULT_BYTES 8

// In the order of DIVIDE_OPS: i32.div_s, i32.div_u, i32.rem_s, i32.rem_u, then the same in 64 bits.
static uint64_t Divide(uint32_t op, uint64_t n, uint64_t d)
{
    switch (op)
    {
    case 0:
        return (uint32_t)IrvWasm_I32DivS((int32_t)n, (int32_t)d);
    case 1:
        return IrvWasm_I32DivU((uint32_t)n, (uint32_t)d);
    case 2:
        return (uint32_t)IrvWasm_I32RemS((int32_t)n, (int32_t)d);
    case 3:
        return IrvWasm_I32RemU((uint32_t)n, (uint32_t)d);
    case 4:
        return (uint64_t)IrvWasm_I64DivS((int64_t)n, (int64_t)d);
    case 5:
        return IrvWasm_I64DivU(n, d);
    case 6:
        return (uint64_t)IrvWasm_I64RemS((int64_t)n, (int64_t)d);
    case 7:
        return IrvWasm_I64RemU(n, d);
    }
    Fail("divide knows no op of that index");
}

static uint64_t Join(const uint32_t *words)
{
    return words[0] | ((uint64_t)words[1] << 32);
}

void RunDivide(struct HostCall *call)
{
    const uint32_t *words = (const uint32_t *)call->src;
    uint32_t count = call->srcLength / (RECORD_WORDS * 4);
    uint32_t i;

    if (call->srcLength % (RECORD_WORDS * 4) != 0 || call->destLength != count * RESULT_BYTES)
        Fail("divide takes records of five words and eight bytes of destination for each");
    for (i = 0; i < count; i++)
    {
        const uint32_t *record = words + i * RECORD_WORDS;
        uint64_t result = Divide(record[0], Join(record + 1), Join(record + 3));

        memcpy(call->dest + i * RESULT_BYTES, &result, RESULT_BYTES);
    }
}
