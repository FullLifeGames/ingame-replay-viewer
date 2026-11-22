// Our platform layer (#43): the sound engine's frame. SoundMain runs the players, the game's
// CgbSound and the PCM mixer, then adds the FIFOs to the PSG as the hardware does and hands the
// frame's samples to the host. Written from the MP2K functional spec
// (.waves/04/s4b/mp2k-spec.md, sections 6-8 and 10) and GBATEK ("GBA Sound Channel A and B -
// DMA Sound", "GBA Sound Control Registers"). The file does not include the game's
// m4a_internal.h, which declares SoundMainBTM without its argument (MP2K spec 10, O2 (b)).

#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include "irv_gba.h"
#include "irv_mp2k.h"
#include "irv_psg.h"

typedef void (*IrvSoundFunc)(void);

// GBATEK "GBA Sound Control Registers": SOUNDCNT_H's DMA sound bits and SOUNDCNT_X's master
// enable.
#define FIFO_A_FULL    0x0004
#define FIFO_B_FULL    0x0008
#define FIFO_A_RIGHT   0x0100
#define FIFO_A_LEFT    0x0200
#define FIFO_B_RIGHT   0x1000
#define FIFO_B_LEFT    0x2000
#define MASTER_ENABLE  0x80

// GBATEK "Max Output Levels": a FIFO spans +/-0x200 at 100 %, so a sample byte counts 4 units,
// 2 at 50 %. SOUNDBIAS: "The default setting is 0200h", which the BIOS leaves and the game keeps
// (it writes bits 14-15 only, MP2K spec 7); the sum clips to the unsigned 10-bit range.
#define FIFO_UNITS_FULL 4
#define FIFO_UNITS_HALF 2
#define BIAS            0x200
#define OUTPUT_MAX      0x3FF

static float sPairs[2 * IRV_SOUND_PCM_BUFFER];
static int32_t sPsgRate;

// MP2K spec 5.7: 64 zero bytes at `ptr`, for Clear64byte through jump table entry 35.
void SoundMainBTM(void *ptr)
{
    memset(ptr, 0, 64);
}

// MP2K spec 6.2 and R2: the DMA ring's counter, at VCOUNT 150. It runs while the engine is idle
// or inside SoundMain. On hardware the reload also restarts the two sound DMAs; the layer has no
// FIFO and reads the segment directly (MP2K spec 10, O1 (a)).
void m4aSoundVSync(void)
{
    struct IrvSoundInfo *info = IrvSound_Info();
    int32_t counter;

    if (info == NULL || info->ident - IRV_SOUND_ID > 1)
        return;
    counter = (int8_t)(info->pcmDmaCounter - 1);
    if (counter <= 0)
        counter = info->pcmDmaPeriod;
    info->pcmDmaCounter = counter;
}

// MP2K spec 6.2: the segment the frame writes, one frame ahead of the DMA.
static uint32_t Segment(const struct IrvSoundInfo *info)
{
    uint32_t counter = info->pcmDmaCounter;

    if (counter < 2 || counter > info->pcmDmaPeriod)
        return 0;
    return info->pcmDmaPeriod - (counter - 1);
}

// MP2K spec 6.3: the segment cleared, or both halves replaced by the reverb of this segment and
// the next one of the ring (segment 0 after the last).
static void ReverbOrClear(struct IrvSoundInfo *info, uint32_t segment, uint32_t samples)
{
    int8_t *right = info->pcmBuffer + segment * samples;
    int8_t *left = right + IRV_SOUND_PCM_BUFFER;
    const int8_t *otherRight = info->pcmBuffer + (segment + 1) % info->pcmDmaPeriod * samples;
    const int8_t *otherLeft = otherRight + IRV_SOUND_PCM_BUFFER;
    uint32_t k;

    if (info->reverb == 0)
    {
        memset(right, 0, samples);
        memset(left, 0, samples);
        return;
    }
    for (k = 0; k < samples; k++)
    {
        int32_t sum = right[k] + left[k] + otherRight[k] + otherLeft[k];
        int32_t level = (sum * info->reverb) >> 9;

        if (level < 0)
            level++;
        right[k] = level;
        left[k] = level;
    }
}

// MP2K spec 7 and 10 (O4): the bias added, the 10-bit clip, the bias taken off again, and the
// result scaled to the host's -1..1.
static float Level(float units)
{
    float level = units + BIAS;

    if (level < 0)
        level = 0;
    if (level > OUTPUT_MAX)
        level = OUTPUT_MAX;
    return (level - BIAS) / BIAS;
}

// MP2K spec 7: FIFO A plays the first half of the buffer, FIFO B the second. SOUNDCNT_H routes
// each to its sides at its volume, and the PSG's units from IrvPsg_Frame are already there.
static void MixOutput(const int8_t *fifoA, const int8_t *fifoB, uint32_t samples)
{
    uint16_t control = IRV_IO16(IRV_REG_SOUNDCNT_H);
    bool on = IRV_IO8(IRV_REG_SOUNDCNT_X) & MASTER_ENABLE;
    int32_t unitsA = (control & FIFO_A_FULL) ? FIFO_UNITS_FULL : FIFO_UNITS_HALF;
    int32_t unitsB = (control & FIFO_B_FULL) ? FIFO_UNITS_FULL : FIFO_UNITS_HALF;
    uint32_t k;

    for (k = 0; k < samples; k++)
    {
        int32_t a = on ? fifoA[k] * unitsA : 0;
        int32_t b = on ? fifoB[k] * unitsB : 0;
        float *pair = &sPairs[2 * k];

        pair[0] = Level(pair[0] + ((control & FIFO_A_LEFT) ? a : 0) + ((control & FIFO_B_LEFT) ? b : 0));
        pair[1] = Level(pair[1] + ((control & FIFO_A_RIGHT) ? a : 0) + ((control & FIFO_B_RIGHT) ? b : 0));
    }
}

// MP2K spec 10, O1 (a): the segment just mixed goes to the host with the PSG samples of the
// registers CgbSound just wrote. The PSG runs at the mixer's rate.
static void HandOver(const struct IrvSoundInfo *info, const int8_t *right, uint32_t samples)
{
    if (sPsgRate != info->pcmFreq)
    {
        IrvPsg_Reset(info->pcmFreq);
        sPsgRate = info->pcmFreq;
    }
    IrvPsg_Frame(sPairs, samples);
    MixOutput(right, right + IRV_SOUND_PCM_BUFFER, samples);
    IrvSound_HandOver(sPairs, samples, info->pcmFreq);
}

// MP2K spec 8.1: once per frame, in the VBlank interrupt, after m4aSoundVSync.
void SoundMain(void)
{
    struct IrvSoundInfo *info = IrvSound_Info();
    uint32_t samples;

    if (info == NULL || info->ident != IRV_SOUND_ID)
        return;
    info->ident++;
    if (info->MPlayMainHead != 0)
        IRV_SOUND_CALL(IrvSoundPlayerFunc, info->MPlayMainHead)(IrvSound_Ptr(info->musicPlayerHead));
    if (info->CgbSound != 0)
        IRV_SOUND_CALL(IrvSoundFunc, info->CgbSound)();
    samples = info->pcmSamplesPerVBlank;
    // MP2K spec 6.1: the ring of pcmDmaPeriod segments fits in each half of the buffer.
    if (samples > 0 && info->pcmDmaPeriod > 0 && samples * info->pcmDmaPeriod <= IRV_SOUND_PCM_BUFFER)
    {
        uint32_t segment = Segment(info);
        int8_t *right = info->pcmBuffer + segment * samples;
        uint32_t count = IrvSound_PcmChannels(info);
        uint32_t i;

        ReverbOrClear(info, segment, samples);
        for (i = 0; i < count; i++)
            IrvSound_MixChannel(&info->chans[i], i, right, right + IRV_SOUND_PCM_BUFFER);
        HandOver(info, right, samples);
    }
    info->ident = IRV_SOUND_ID;
}
