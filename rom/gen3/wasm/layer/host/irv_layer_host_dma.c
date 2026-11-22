// The host harness of our platform layer (#43): the `dma` command. It keeps the GBA address
// space 0x02000000-0x07FFFFFF in one zeroed block, runs a script of operations on it and the
// layer's DMA, and records each call of the IRQ handler. Never part of the module.
// The script is a list of little-endian words, each operation its code and its operands:
//   1 load    address length bytes...  (the bytes padded to a whole word)
//   2 dmaset  channel src dest control
//   3 run     timing                   (RunDMAs)
//   4 write16 address value
//   5 raise   flag                     (IrvLayer_RaiseIrq)
//   6 read    address length           (appends the bytes to the destination)
// The result holds the handler's calls in its upper half and the OR of their flags in its lower.
#include <stdlib.h>
#include <string.h>
#include "irv_dma.h"
#include "irv_gba.h"
#include "irv_irq.h"
#include "irv_layer_host.h"

uint8_t *gIrvHostMemory;

static uint32_t sIrqCalls;
static uint32_t sIrqFlags;

struct Script
{
    const uint8_t *at;
    uint32_t left;
    uint32_t readAt;
};

static uint32_t NextWord(struct Script *script)
{
    const uint8_t *at = script->at;

    if (script->left < 4)
        Fail("the script ends inside an operation");
    script->at += 4;
    script->left -= 4;
    return at[0] | (at[1] << 8) | (at[2] << 16) | ((uint32_t)at[3] << 24);
}

static uint8_t *HostBytes(uint32_t address, uint32_t length)
{
    if (address < IRV_EWRAM || address >= IRV_MAP_END || length > IRV_MAP_END - address)
        Fail("an address outside 0x02000000-0x07FFFFFF");
    return IRV_PTR(address);
}

static void Load(struct Script *script)
{
    uint32_t address = NextWord(script);
    uint32_t length = NextWord(script);
    uint32_t padded = (length + 3) & ~3u;

    if (script->left < padded)
        Fail("the script ends inside a load");
    memcpy(HostBytes(address, length), script->at, length);
    script->at += padded;
    script->left -= padded;
}

static void Set(struct Script *script)
{
    uint32_t channel = NextWord(script);
    uint32_t src = NextWord(script);
    uint32_t dest = NextWord(script);
    uint32_t control = NextWord(script);

    DmaSet(channel, HostBytes(src, 0), HostBytes(dest, 0), control);
}

static void Write16(struct Script *script)
{
    uint32_t address = NextWord(script);
    uint16_t value = NextWord(script);

    memcpy(HostBytes(address, 2), &value, 2);
}

static void Read(struct Script *script, struct HostCall *call)
{
    uint32_t address = NextWord(script);
    uint32_t length = NextWord(script);

    if (length > call->destLength - script->readAt)
        Fail("the reads return more bytes than the destination holds");
    memcpy(call->dest + script->readAt, HostBytes(address, length), length);
    script->readAt += length;
}

static void RecordIrq(uint16_t flag)
{
    sIrqCalls++;
    sIrqFlags |= flag;
}

static void RunOperation(struct Script *script, struct HostCall *call)
{
    switch (NextWord(script))
    {
    case 1:
        Load(script);
        break;
    case 2:
        Set(script);
        break;
    case 3:
        RunDMAs(NextWord(script));
        break;
    case 4:
        Write16(script);
        break;
    case 5:
        IrvLayer_RaiseIrq(NextWord(script));
        break;
    case 6:
        Read(script, call);
        break;
    default:
        Fail("an unknown operation in the script");
    }
}

void RunDmaScript(struct HostCall *call)
{
    struct Script script = {call->src, call->srcLength, 0};

    gIrvHostMemory = calloc(IRV_MAP_END - IRV_EWRAM, 1);
    if (gIrvHostMemory == NULL)
        Fail("out of memory");
    IrvLayer_SetIrqHandler(RecordIrq);
    while (script.left > 0)
        RunOperation(&script, call);
    if (script.readAt != call->destLength)
        Fail("the reads return fewer bytes than the destination holds");
    call->result = (sIrqCalls << 16) | sIrqFlags;
}
