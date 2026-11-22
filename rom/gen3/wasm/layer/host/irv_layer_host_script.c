// The host harness of our platform layer (#43): the `script` command. It keeps the GBA address
// space 0x02000000-0x07FFFFFF in one zeroed block, runs a script of operations on it and the
// layer's DMA and frame driver, and records each call of the IRQ handler. Never part of the
// module.
// The script is a list of little-endian words, each operation its code and its operands:
//   1 load    address length bytes...  (the bytes padded to a whole word)
//   2 dmaset  channel src dest control
//   3 run     timing                   (RunDMAs)
//   4 write16 address value
//   5 raise   flag                     (IrvLayer_RaiseIrq)
//   6 read    address length           (appends the bytes to the destination)
//   7 onirq   flag address value       (each later call of the handler for the flag writes the
//                                       16-bit value first; up to 8 of them)
//   8 frame                            (IrvLayer_RunFrame; appends its 240x160 BGR555 pixels)
//   9 log     max                      (appends the first max calls of the handler as a 16-bit
//                                       flag and VCOUNT each, zeros after the last)
//  10 trace                            (a frame as 8 does, then its trace: struct IrvPixelTrace
//                                       per pixel, irv_render.h)
//  11 psgreset rate                    (IrvPsg_Reset)
//  12 psgframe count                   (IrvPsg_Frame; appends its count pairs of floats)
// The result holds the handler's calls in its upper half and the OR of their flags in its lower.
#include <stdlib.h>
#include <string.h>
#include "irv_dma.h"
#include "irv_frame.h"
#include "irv_gba.h"
#include "irv_irq.h"
#include "irv_layer_host.h"
#include "irv_psg.h"
#include "irv_render.h"

uint8_t *gIrvHostMemory;
struct IrvPixelTrace *gIrvPixelTrace;

#define FRAME_BYTES (240 * 160 * 2)
#define MAX_ON_IRQ  8
#define MAX_LOG     1024

struct OnIrq
{
    uint16_t flag;
    uint16_t value;
    uint32_t address;
};

static uint32_t sIrqCalls;
static uint32_t sIrqFlags;
static struct OnIrq sOnIrq[MAX_ON_IRQ];
static uint32_t sOnIrqCount;
static uint16_t sLog[MAX_LOG][2];

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

static void Append(struct Script *script, struct HostCall *call, const void *bytes, uint32_t length)
{
    if (length > call->destLength - script->readAt)
        Fail("the reads return more bytes than the destination holds");
    memcpy(call->dest + script->readAt, bytes, length);
    script->readAt += length;
}

static void Read(struct Script *script, struct HostCall *call)
{
    uint32_t address = NextWord(script);
    uint32_t length = NextWord(script);

    Append(script, call, HostBytes(address, length), length);
}

static void AddOnIrq(struct Script *script)
{
    struct OnIrq *on;

    if (sOnIrqCount == MAX_ON_IRQ)
        Fail("more than 8 onirq operations");
    on = &sOnIrq[sOnIrqCount++];
    on->flag = NextWord(script);
    on->address = NextWord(script);
    on->value = NextWord(script);
    HostBytes(on->address, 2);
}

static void Frame(struct Script *script, struct HostCall *call)
{
    static uint16_t sPixels[FRAME_BYTES / 2];

    IrvLayer_RunFrame(sPixels);
    Append(script, call, sPixels, FRAME_BYTES);
}

static void TraceFrame(struct Script *script, struct HostCall *call)
{
    static struct IrvPixelTrace sTrace[240 * 160];

    memset(sTrace, 0, sizeof(sTrace));
    gIrvPixelTrace = sTrace;
    Frame(script, call);
    gIrvPixelTrace = NULL;
    Append(script, call, sTrace, sizeof(sTrace));
}

static void PsgFrame(struct Script *script, struct HostCall *call)
{
    uint32_t count = NextWord(script);
    float *pairs;

    if (count > call->destLength / (2 * sizeof(float)))
        Fail("a PSG frame of more pairs than the destination holds");
    pairs = malloc(count * 2 * sizeof(float));
    if (pairs == NULL)
        Fail("out of memory");
    IrvPsg_Frame(pairs, count);
    Append(script, call, pairs, count * 2 * sizeof(float));
    free(pairs);
}

static void Log(struct Script *script, struct HostCall *call)
{
    uint32_t max = NextWord(script);
    uint32_t i;
    uint16_t entry[2];

    if (max > MAX_LOG)
        Fail("a log of more than 1024 calls");
    for (i = 0; i < max; i++)
    {
        entry[0] = i < sIrqCalls ? sLog[i][0] : 0;
        entry[1] = i < sIrqCalls ? sLog[i][1] : 0;
        Append(script, call, entry, sizeof(entry));
    }
}

static void RecordIrq(uint16_t flag)
{
    uint32_t i;

    for (i = 0; i < sOnIrqCount; i++)
    {
        if (sOnIrq[i].flag == flag)
            memcpy(IRV_PTR(sOnIrq[i].address), &sOnIrq[i].value, 2);
    }
    if (sIrqCalls < MAX_LOG)
    {
        sLog[sIrqCalls][0] = flag;
        sLog[sIrqCalls][1] = IRV_IO16(IRV_REG_VCOUNT);
    }
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
    case 7:
        AddOnIrq(script);
        break;
    case 8:
        Frame(script, call);
        break;
    case 9:
        Log(script, call);
        break;
    case 10:
        TraceFrame(script, call);
        break;
    case 11:
        IrvPsg_Reset(NextWord(script));
        break;
    case 12:
        PsgFrame(script, call);
        break;
    default:
        Fail("an unknown operation in the script");
    }
}

void RunScript(struct HostCall *call)
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
