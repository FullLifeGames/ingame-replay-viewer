#include <string.h>
#include "irv_dma.h"
#include "irv_gba.h"
#include "irv_irq.h"

// Our platform layer (#43): DMA, from GBATEK's "GBA DMA Transfers". The registers in IO memory
// are the truth for what the game set, since the game also writes them directly (DmaStop, the
// sound DMAs of SoundInit). The internal pointers and the count latch on the enable bit's edge
// from 0 to 1. A transfer moves one unit at a time through memcpy, so it neither needs an aligned
// address nor masks one: in the module an address is a wasm32 pointer, which may lie above the
// GBA's 27 or 28 address bits and which wasm32 aligns as it does the game's structs.

#define CHANNELS 4

struct IrvDmaChannel
{
    uint32_t source;
    uint32_t dest;
    uint32_t count;
    int latched;
};

static struct IrvDmaChannel sChannels[CHANNELS];

static uint32_t ChannelRegs(int channel)
{
    return IRV_REG_DMA0 + channel * IRV_DMA_STRIDE;
}

// GBATEK: DMA0-2 count 14 bits and DMA3 16 bits; a count of 0 means the most.
static uint32_t UnitCount(int channel)
{
    uint32_t most = channel == 3 ? 0x10000 : 0x4000;
    uint32_t count = IRV_IO16(ChannelRegs(channel) + IRV_DMA_CNT_L) & (most - 1);

    return count == 0 ? most : count;
}

static void Latch(int channel)
{
    struct IrvDmaChannel *dma = &sChannels[channel];
    uint32_t regs = ChannelRegs(channel);

    dma->source = IRV_IO32(regs + IRV_DMA_SAD);
    dma->dest = IRV_IO32(regs + IRV_DMA_DAD);
    dma->count = UnitCount(channel);
    dma->latched = 1;
}

// The step of one address control. The source's control 3 is prohibited; it counts up here.
static int32_t Step(uint32_t addressControl, int32_t unit)
{
    switch (addressControl & 3)
    {
    case IRV_DMA_DECREMENT:
        return -unit;
    case IRV_DMA_FIXED:
        return 0;
    default:
        return unit;
    }
}

// After the count: a repeating timed DMA reloads its count, and DAD with control 3; any other
// clears its enable bit. An immediate DMA has no start condition to repeat on, so it always ends.
static void EndTransfer(int channel, uint16_t control)
{
    struct IrvDmaChannel *dma = &sChannels[channel];
    uint32_t regs = ChannelRegs(channel);
    uint32_t timing = (control >> IRV_DMA_TIMING_SHIFT) & 3;

    if ((control & IRV_DMA_REPEAT) && timing != IRV_DMA_TIMING_NOW)
    {
        dma->count = UnitCount(channel);
        if (((control >> IRV_DMA_DEST_SHIFT) & 3) == IRV_DMA_RELOAD)
            dma->dest = IRV_IO32(regs + IRV_DMA_DAD);
    }
    else
    {
        IRV_IO16(regs + IRV_DMA_CNT_H) = control & ~IRV_DMA_ENABLE;
        dma->latched = 0;
    }
    if (control & IRV_DMA_IRQ)
        IrvLayer_RaiseIrq(IRV_INTR_DMA0 << channel);
}

static void Transfer(int channel)
{
    struct IrvDmaChannel *dma = &sChannels[channel];
    uint16_t control = IRV_IO16(ChannelRegs(channel) + IRV_DMA_CNT_H);
    int32_t unit = (control & IRV_DMA_32BIT) ? 4 : 2;
    int32_t sourceStep = Step(control >> IRV_DMA_SRC_SHIFT, unit);
    int32_t destStep = Step(control >> IRV_DMA_DEST_SHIFT, unit);
    uint32_t i;

    for (i = 0; i < dma->count; i++)
    {
        uint32_t value;

        memcpy(&value, IRV_PTR(dma->source), unit);
        memcpy(IRV_PTR(dma->dest), &value, unit);
        dma->source += sourceStep;
        dma->dest += destStep;
    }
    EndTransfer(channel, control);
}

// The game's DmaSet writes SAD, DAD and the count with the control as one word. A channel that
// was off latches the new values; an immediate one transfers before DmaSet returns, as the game's
// fills pass a source on their stack.
void DmaSet(int dmaNum, const void *src, void *dest, uint32_t control)
{
    uint32_t regs;
    uint16_t before;

    if (dmaNum < 0 || dmaNum >= CHANNELS)
        return;
    regs = ChannelRegs(dmaNum);
    before = IRV_IO16(regs + IRV_DMA_CNT_H);
    IRV_IO32(regs + IRV_DMA_SAD) = IRV_ADDRESS(src);
    IRV_IO32(regs + IRV_DMA_DAD) = IRV_ADDRESS(dest);
    IRV_IO32(regs + IRV_DMA_CNT_L) = control;
    if (!((control >> 16) & IRV_DMA_ENABLE))
        return;
    if (!(before & IRV_DMA_ENABLE) || !sChannels[dmaNum].latched)
        Latch(dmaNum);
    if (((control >> (16 + IRV_DMA_TIMING_SHIFT)) & 3) == IRV_DMA_TIMING_NOW)
        Transfer(dmaNum);
}

// Runs every enabled channel of one start timing, DMA0 first. A channel the game switched off by
// a plain write forgets its latch; one it switched on that way latches here. Timing 3 never
// transfers: the mixer hands its samples to the host, and DMA3's video capture has no user.
void RunDMAs(uint32_t timing)
{
    int channel;

    if (timing == IRV_DMA_TIMING_SPECIAL)
        return;
    for (channel = 0; channel < CHANNELS; channel++)
    {
        uint16_t control = IRV_IO16(ChannelRegs(channel) + IRV_DMA_CNT_H);

        if (!(control & IRV_DMA_ENABLE))
        {
            sChannels[channel].latched = 0;
            continue;
        }
        if (((control >> IRV_DMA_TIMING_SHIFT) & 3) != timing)
            continue;
        if (!sChannels[channel].latched)
            Latch(channel);
        Transfer(channel);
    }
}
