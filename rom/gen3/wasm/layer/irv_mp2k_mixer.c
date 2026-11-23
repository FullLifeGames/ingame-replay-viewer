// Our platform layer (#43): the PCM mixer's work on one DirectSound channel per frame, its
// envelope and its samples, written from the MP2K functional spec
// (.waves/04/s4b/mp2k-spec.md, sections 2.4, 2.5, 6.4 and 6.5).

#include <stdbool.h>
#include <stdint.h>
#include "irv_mp2k.h"

// MP2K spec 6.5: the position's fraction of a source sample, 23 bits.
#define FRACTION_BITS 23
#define FRACTION_MASK ((1u << FRACTION_BITS) - 1)
#define ONE_SAMPLE    (1u << FRACTION_BITS)

// MP2K spec 2.4 and 2.5: the samples follow a 16-byte header; a compressed sample keeps 64
// samples in each block of 33 bytes.
#define WAVE_HEADER   16
#define BLOCK_SAMPLES 64
#define BLOCK_BYTES   33

// MP2K spec 2.5: one decoded block per channel. The engine keeps the same; it is a cache, not
// behaviour, so it may live across frames while the sample's bytes stay as they are.
struct DecodedBlock
{
    uint32_t wave;
    uint32_t block;
    int8_t samples[BLOCK_SAMPLES];
};

// How one channel reads its sample this frame (MP2K spec 6.5).
struct Play
{
    const struct IrvSoundWave *wave;
    uint32_t channel;
    bool compressed;
    bool reverse;
    bool loop;
    uint32_t step;
};

static struct DecodedBlock sBlocks[IRV_SOUND_PCM_CHANNELS];

// MP2K spec 6.4, the release row: the level falls to the echo volume, which then holds (IEC), or
// to 0, which turns the channel off.
static void EndInEcho(struct IrvSoundChannel *chan)
{
    chan->envelopeVolume = chan->pseudoEchoVolume;
    if (chan->pseudoEchoVolume == 0)
        chan->statusFlags = 0;
    else
        chan->statusFlags |= IRV_CHANNEL_ECHO;
}

// MP2K spec 6.4, the attack row. A phase changes by 1 down, which keeps the LOOP bit.
static void Attack(struct IrvSoundChannel *chan)
{
    uint32_t level = chan->envelopeVolume + chan->attack;

    if (level >= 255)
    {
        level = 255;
        chan->statusFlags--;
    }
    chan->envelopeVolume = level;
}

// MP2K spec 6.4, the decay row.
static void Decay(struct IrvSoundChannel *chan)
{
    uint32_t level = chan->envelopeVolume * chan->decay >> 8;

    if (level > chan->sustain)
    {
        chan->envelopeVolume = level;
    }
    else if (chan->sustain == 0)
    {
        EndInEcho(chan);
    }
    else
    {
        chan->envelopeVolume = chan->sustain;
        chan->statusFlags--;
    }
}

// MP2K spec 6.4, the release row.
static void Release(struct IrvSoundChannel *chan)
{
    uint32_t level = chan->envelopeVolume * chan->release >> 8;

    if (level > chan->pseudoEchoVolume)
        chan->envelopeVolume = level;
    else
        EndInEcho(chan);
}

// MP2K spec 6.4, `START` alone: the attack phase, the loop bit from the sample (2.4), and the
// position at the start offset that ply_note left in `count` (5.6 step 6).
static void Start(struct IrvSoundChannel *chan)
{
    const struct IrvSoundWave *wave = IrvSound_Ptr(chan->wave);

    if (wave == NULL)
    {
        chan->statusFlags = 0;
        return;
    }
    chan->statusFlags = 3;
    if (wave->status & IRV_WAVE_LOOP)
        chan->statusFlags |= IRV_CHANNEL_LOOP;
    chan->count = wave->size - chan->count;
    chan->fw = 0;
    chan->envelopeVolume = 0;
    Attack(chan);
}

// MP2K spec 6.4: one envelope step per frame, whatever the tempo. False when the channel is off.
static bool StepEnvelope(struct IrvSoundChannel *chan)
{
    uint8_t flags = chan->statusFlags;

    if (flags & IRV_CHANNEL_START)
    {
        if (flags & IRV_CHANNEL_STOP)
            chan->statusFlags = 0;
        else
            Start(chan);
    }
    else if (flags & IRV_CHANNEL_ECHO)
    {
        if (chan->pseudoEchoLength == 0 || --chan->pseudoEchoLength == 0)
            chan->statusFlags = 0;
    }
    else if (flags & IRV_CHANNEL_STOP)
    {
        Release(chan);
    }
    else if ((flags & IRV_CHANNEL_PHASE) == 3)
    {
        Attack(chan);
    }
    else if ((flags & IRV_CHANNEL_PHASE) == 2)
    {
        Decay(chan);
    }
    return chan->statusFlags != 0;
}

// MP2K spec 2.5: 64 samples from 33 bytes. Byte 0 is the first sample; the low nibble of byte 1
// gives the second; bytes 2-32 give two each, high nibble first. Each nibble adds its entry of
// gDeltaEncodingTable to the sample before, and the sum wraps modulo 256.
static void DecodeBlock(const uint8_t *bytes, int8_t *samples)
{
    uint8_t sum = bytes[0];
    uint32_t i;

    samples[0] = (int8_t)sum;
    sum += gDeltaEncodingTable[bytes[1] & 0xF];
    samples[1] = (int8_t)sum;
    for (i = 2; i < BLOCK_BYTES; i++)
    {
        sum += gDeltaEncodingTable[bytes[i] >> 4];
        samples[2 * i - 2] = (int8_t)sum;
        sum += gDeltaEncodingTable[bytes[i] & 0xF];
        samples[2 * i - 1] = (int8_t)sum;
    }
}

// MP2K spec 2.4, 2.5 and 10 (O3 (a)): sample `i`, read from memory as the engine reads it, also
// past the sample's end, where the bytes that follow the data stand in.
static int32_t Sample(const struct Play *play, uint32_t i)
{
    const uint8_t *data = (const uint8_t *)play->wave + WAVE_HEADER;
    struct DecodedBlock *cache = &sBlocks[play->channel];
    uint32_t block = i / BLOCK_SAMPLES;

    if (!play->compressed)
        return (int8_t)data[i];
    if (cache->wave != IrvSound_Address(play->wave) || cache->block != block)
    {
        DecodeBlock(data + block * BLOCK_BYTES, cache->samples);
        cache->wave = IrvSound_Address(play->wave);
        cache->block = block;
    }
    return cache->samples[i % BLOCK_SAMPLES];
}

// MP2K spec 6.5: the output value at `left` samples left with fraction `fraction`. Forward the
// position is size - left and the value moves towards the next sample; reversed it is left - 1
// and moves towards the one below, never below sample 0 (our choice: the spec leaves sample -1
// open, and a reversed sample's last output interpolates towards nothing).
static int32_t Value(const struct Play *play, int32_t left, uint32_t fraction)
{
    uint32_t i = play->reverse ? (uint32_t)(left - 1) : play->wave->size - (uint32_t)left;
    int32_t first = Sample(play, i);
    int32_t next;

    if (fraction == 0 || (play->reverse && i == 0))
        return first;
    next = Sample(play, play->reverse ? i - 1 : i + 1);
    return first + (int32_t)(((int64_t)fraction * (next - first)) >> FRACTION_BITS);
}

// MP2K spec 6.5: one output sample's step. At the end a looping sample folds the overshoot into
// its loop, so the position keeps its distance past the end; any other turns the channel off.
static bool Advance(struct IrvSoundChannel *chan, const struct Play *play)
{
    uint32_t fraction = chan->fw + play->step;
    int32_t left = (int32_t)chan->count - (int32_t)(fraction >> FRACTION_BITS);
    int32_t loopLength = (int32_t)(play->wave->size - play->wave->loopStart);

    chan->fw = fraction & FRACTION_MASK;
    if (left <= 0 && play->loop && loopLength > 0)
    {
        while (left <= 0)
            left += loopLength;
    }
    chan->count = (uint32_t)left;
    if (left > 0)
        return true;
    chan->statusFlags = 0;
    return false;
}

// MP2K spec 6.5: the paths. `CMP` or `REV` select the decoder by the sample's own type and the
// direction by `REV`; with neither a compressed sample nor `REV` nothing is mixed and the
// position stays. `FIX` steps one source sample per output sample, except on the reversed
// uncompressed path, which the spec gives the pitched step.
static bool Prepare(struct Play *play, const struct IrvSoundChannel *chan, uint32_t channel)
{
    const struct IrvSoundInfo *info = IrvSound_Info();
    bool fix = chan->type & IRV_VOICE_FIX;

    play->wave = IrvSound_Ptr(chan->wave);
    play->channel = channel;
    play->compressed = false;
    play->reverse = false;
    if (chan->type & (IRV_VOICE_REV | IRV_VOICE_CMP))
    {
        play->compressed = play->wave->type != 0;
        play->reverse = chan->type & IRV_VOICE_REV;
        if (!play->compressed && !play->reverse)
            return false;
        fix = fix && play->compressed;
    }
    play->loop = !play->reverse && (chan->statusFlags & IRV_CHANNEL_LOOP);
    // MP2K spec 6.5 and 6.6: the step is divFreq * frequency in 2^-23 samples, 32 bits.
    play->step = fix ? ONE_SAMPLE : (uint32_t)info->divFreq * chan->frequency;
    return true;
}

// MP2K spec 6.5: the buffer bytes wrap modulo 256; nothing clips.
static void Add(int8_t *byte, int32_t volume, int32_t value)
{
    *byte = (int8_t)(uint8_t)((uint8_t)*byte + (uint8_t)((volume * value) >> 8));
}

void IrvSound_MixChannel(struct IrvSoundChannel *chan, uint32_t channel, int8_t *right, int8_t *left)
{
    const struct IrvSoundInfo *info = IrvSound_Info();
    struct Play play;
    uint32_t level;
    int32_t k;

    if (!(chan->statusFlags & IRV_CHANNEL_ON) || !StepEnvelope(chan))
        return;
    // MP2K spec 6.4, output levels.
    level = chan->envelopeVolume * (info->masterVolume + 1) >> 4;
    chan->envelopeVolumeRight = chan->rightVolume * level >> 8;
    chan->envelopeVolumeLeft = chan->leftVolume * level >> 8;
    if (!Prepare(&play, chan, channel))
        return;
    if ((int32_t)chan->count <= 0)
    {
        chan->statusFlags = 0;
        return;
    }
    for (k = 0; k < info->pcmSamplesPerVBlank; k++)
    {
        int32_t value = Value(&play, (int32_t)chan->count, chan->fw);

        Add(&right[k], chan->envelopeVolumeRight, value);
        Add(&left[k], chan->envelopeVolumeLeft, value);
        if (!Advance(chan, &play))
            break;
    }
}
