#include <string.h>
#include "irv_gba.h"
#include "irv_psg.h"

// Our platform layer (#43): the four PSG channels, synthesised from the sound registers. The
// registers are plain memory here, so the layer reads them once per frame (IrvPsg_Frame) into a
// copy and renders the frame's pairs from that copy. GBATEK sections are named above each rule.

#define REGISTERS_START IRV_REG_NR10
#define REGISTERS_END   (IRV_REG_SOUNDCNT_H + 2)
#define REG(offset)     sPsg.registers[(offset) - REGISTERS_START]
#define WAVE_BYTES      16

// GBATEK "GBA Sound Channel 3 - Wave Output": the wave channel's clock, 2097152/(2048-n) digits
// per second. The tones and the noise count in the same clock (Period).
#define PSG_CLOCK 2097152

// GBATEK gives no frame sequencer, only its units: the length in 1/256 s, the sweep in 7.8 ms
// (1/128 s), the envelope in 1/64 s. Ours runs at 512 Hz and gives the length its even steps, the
// sweep steps 2 and 6 and the envelope step 7, so each clock keeps its rate. The order is ours.
#define SEQUENCER_RATE 512

// GBATEK "GBA Sound Channel 1 - Tone & Sweep" to "GBA Sound Channel 4 - Noise": each channel's
// length, envelope and frequency registers, and its control byte with the Length Flag (bit 6) and
// Initial (bit 7). Channel 3 has its volume byte NR32 where the others have their envelope.
struct ChannelRegisters
{
    uint8_t length;
    uint8_t envelope;
    uint8_t frequency;
    uint8_t control;
};

static const struct ChannelRegisters sChannelRegisters[4] = {
    {IRV_REG_NR11, IRV_REG_NR12, IRV_REG_NR13, IRV_REG_NR14},
    {IRV_REG_NR21, IRV_REG_NR22, IRV_REG_NR23, IRV_REG_NR24},
    {IRV_REG_NR31, IRV_REG_NR32, IRV_REG_NR33, IRV_REG_NR34},
    {IRV_REG_NR41, IRV_REG_NR42, IRV_REG_NR43, IRV_REG_NR44},
};

#define CONTROL_LENGTH_FLAG (1 << 6)
#define CONTROL_INITIAL     (1 << 7)
#define MASTER_ENABLE       (1 << 7)

struct IrvPsgChannel
{
    uint8_t on;
    uint8_t position;      // the duty step 0-7, the wave digit 0-63
    uint8_t volume;        // the envelope's volume 0-15
    uint8_t envelope;      // NRx2 as the restart took it
    uint8_t envelopeTimer; // envelope clocks left to the next step
    uint16_t length;       // length clocks left while the Length Flag is set
    uint64_t clock;        // PSG_CLOCK ticks into the current step, counted in 1/rate
};

static struct
{
    uint32_t rate;
    uint32_t sequencerClock;
    uint8_t sequencerStep;
    uint8_t sweepTimer;
    uint8_t noiseHigh;
    uint16_t noise;
    uint8_t selectedBank;
    uint8_t banks[2][WAVE_BYTES];
    uint8_t window[WAVE_BYTES];
    uint8_t registers[REGISTERS_END - REGISTERS_START];
    struct IrvPsgChannel channels[4];
} sPsg;

void IrvPsg_Reset(uint32_t rate)
{
    memset(&sPsg, 0, sizeof(sPsg));
    sPsg.rate = rate;
}

static uint16_t Frequency(uint8_t channel)
{
    uint8_t low = sChannelRegisters[channel].frequency;

    return REG(low) | ((REG(low + 1) & 7) << 8);
}

// GBATEK "GBA Sound Control Registers", SOUNDCNT_X: while the master enable is off, the PSG is
// silent and its registers 4000060h..4000081h are zero.
static void PowerOff(void)
{
    memset(IRV_PTR(IRV_IO + IRV_REG_NR10), 0, IRV_REG_NR51 + 1 - IRV_REG_NR10);
    memset(sPsg.channels, 0, sizeof(sPsg.channels));
    sPsg.sequencerClock = 0;
    sPsg.sequencerStep = 0;
}

// GBATEK "GBA Sound Channel 3 - Wave Output": the selected bank plays, while the CPU reads and
// writes the other one through WAVE_RAM. Once per frame the layer takes new bytes in the window
// into the bank the CPU addresses, and after a bank switch it shows the newly addressed bank there.
// It cannot see a switch that brackets the writes inside one frame, as CgbSound's note start
// does (U/src/m4a.c: NR30 = 0x40, the four words, NR30 = 0, then Initial). So at a read that
// restarts channel 3, new bytes go to the bank that plays. A write of the bytes the window
// already holds is not seen.
static void ReadWaveWindow(uint8_t restart)
{
    uint8_t *window = IRV_PTR(IRV_IO + IRV_REG_WAVE_RAM);
    uint8_t selected = (REG(IRV_REG_NR30) >> 6) & 1;

    if (memcmp(window, sPsg.window, WAVE_BYTES) != 0)
        memcpy(sPsg.banks[restart ? selected : !selected], window, WAVE_BYTES);
    else if (selected != sPsg.selectedBank)
        memcpy(window, sPsg.banks[!selected], WAVE_BYTES);
    sPsg.selectedBank = selected;
    memcpy(sPsg.window, window, WAVE_BYTES);
}

// GBATEK "GBA Sound Channel 1 - Tone & Sweep", "GBA Sound Channel 4 - Noise": Initial restarts
// the sound. The envelope starts at its initial volume (NRx2 bits 4-7), the length counts
// (64-n)/256 s (channel 3: (256-n)/256 s), the noise register starts at 40h (7 bits) or 4000h
// (15 bits), the wave at the first digit of the selected bank. The duty step runs on: CgbSound
// restarts a tone at each volume change, so a reset there would click.
static void Restart(uint8_t channel)
{
    struct IrvPsgChannel *chan = &sPsg.channels[channel];
    uint8_t length = REG(sChannelRegisters[channel].length);

    chan->on = 1;
    chan->clock = 0;
    if (channel == 2)
    {
        chan->length = 256 - length;
        chan->position = 0;
        return;
    }
    chan->length = 64 - (length & 0x3F);
    chan->envelope = REG(sChannelRegisters[channel].envelope);
    chan->volume = chan->envelope >> 4;
    chan->envelopeTimer = chan->envelope & 7;
    if (channel == 0)
        sPsg.sweepTimer = (REG(IRV_REG_NR10) >> 4) & 7;
    if (channel == 3)
        sPsg.noise = (REG(IRV_REG_NR43) & 0x08) ? 0x40 : 0x4000;
}

// GBATEK "GBA Sound Channel 1 - Tone & Sweep" (NRx4 bit 15 is "W"): Initial is write-only, so
// the layer clears it in the register once it has taken the restart.
static void ReadRegisters(void)
{
    uint8_t restart[4];
    uint8_t i;

    memcpy(sPsg.registers, IRV_PTR(IRV_IO + REGISTERS_START), sizeof(sPsg.registers));
    for (i = 0; i < 4; i++)
    {
        restart[i] = REG(sChannelRegisters[i].control) & CONTROL_INITIAL;
        IRV_IO8(sChannelRegisters[i].control) &= ~CONTROL_INITIAL;
    }
    ReadWaveWindow(restart[2]);
    for (i = 0; i < 4; i++)
    {
        if (restart[i])
            Restart(i);
    }
    // GBATEK "GBA Sound Channel 3 - Wave Output", NR30 bit 7: 0 stops channel 3.
    if (!(REG(IRV_REG_NR30) & 0x80))
        sPsg.channels[2].on = 0;
}

// GBATEK "GBA Sound Channel 1 - Tone & Sweep", NRx4 bit 14: with the Length Flag set, the sound
// stops when its length expires.
static void ClockLength(void)
{
    struct IrvPsgChannel *chan;
    uint8_t i;

    for (i = 0; i < 4; i++)
    {
        chan = &sPsg.channels[i];
        if (!(REG(sChannelRegisters[i].control) & CONTROL_LENGTH_FLAG) || chan->length == 0)
            continue;
        if (--chan->length == 0)
            chan->on = 0;
    }
}

// GBATEK "GBA Sound Channel 1 - Tone & Sweep", NR10: every sweep time (in 1/128 s) the frequency
// changes by X/2^n up or down and goes back into NR13 and NR14. Sweep time 0 turns it off; a
// shift of 0 leaves the frequency as it is. The frequency field holds 0-2047, so a step past it
// stops the channel.
static void ClockSweep(void)
{
    uint8_t sweep = REG(IRV_REG_NR10);
    uint8_t time = (sweep >> 4) & 7;
    uint32_t frequency = Frequency(0);
    uint32_t change = frequency >> (sweep & 7);

    if (!sPsg.channels[0].on || time == 0)
        return;
    if (sPsg.sweepTimer > 1)
    {
        sPsg.sweepTimer--;
        return;
    }
    sPsg.sweepTimer = time;
    if ((sweep & 7) == 0)
        return;
    frequency = (sweep & 0x08) ? frequency - change : frequency + change;
    if (frequency > 2047)
    {
        sPsg.channels[0].on = 0;
        return;
    }
    REG(IRV_REG_NR13) = frequency;
    REG(IRV_REG_NR14) = (REG(IRV_REG_NR14) & ~7) | (frequency >> 8);
    IRV_IO8(IRV_REG_NR13) = frequency;
    IRV_IO8(IRV_REG_NR14) = (IRV_IO8(IRV_REG_NR14) & ~7) | (frequency >> 8);
}

// GBATEK "GBA Sound Channel 1 - Tone & Sweep", NRx2: every step time (in 1/64 s) the volume goes
// one up or down, as far as 15 or 0; step time 0 holds it.
static void ClockEnvelope(void)
{
    struct IrvPsgChannel *chan;
    uint8_t i, stepTime;

    for (i = 0; i < 4; i++)
    {
        chan = &sPsg.channels[i];
        stepTime = chan->envelope & 7;
        if (i == 2 || stepTime == 0 || --chan->envelopeTimer != 0)
            continue;
        chan->envelopeTimer = stepTime;
        if ((chan->envelope & 0x08) && chan->volume < 15)
            chan->volume++;
        else if (!(chan->envelope & 0x08) && chan->volume > 0)
            chan->volume--;
    }
}

static void StepSequencer(void)
{
    sPsg.sequencerClock += SEQUENCER_RATE;
    if (sPsg.sequencerClock < sPsg.rate)
        return;
    sPsg.sequencerClock -= sPsg.rate;
    if ((sPsg.sequencerStep & 1) == 0)
        ClockLength();
    if (sPsg.sequencerStep == 2 || sPsg.sequencerStep == 6)
        ClockSweep();
    if (sPsg.sequencerStep == 7)
        ClockEnvelope();
    sPsg.sequencerStep = (sPsg.sequencerStep + 1) & 7;
}

// The length of one step of each channel in PSG_CLOCK ticks. GBATEK: a tone is 131072/(2048-n) Hz
// over the 8 duty steps, the wave 2097152/(2048-n) digits per second, and the noise register
// shifts at 524288 Hz / r / 2^(s+1) (r = 0 counts as 0.5) from NR43's bits 0-2 (r) and 4-7 (s).
static uint32_t Period(uint8_t channel)
{
    uint8_t polynomial;

    if (channel < 2)
        return 2 * (2048 - Frequency(channel));
    if (channel == 2)
        return 2048 - Frequency(2);
    polynomial = REG(IRV_REG_NR43);
    if ((polynomial & 7) == 0)
        return 4u << (polynomial >> 4);
    return (polynomial & 7) * (8u << (polynomial >> 4));
}

// GBATEK "GBA Sound Channel 4 - Noise": X = X SHR 1; with a carry the output is high and
// X = X XOR 60h (7 bits, NR43 bit 3) or X XOR 6000h (15 bits).
static void ShiftNoise(void)
{
    uint8_t carry = sPsg.noise & 1;

    sPsg.noise >>= 1;
    sPsg.noiseHigh = carry;
    if (carry)
        sPsg.noise ^= (REG(IRV_REG_NR43) & 0x08) ? 0x60 : 0x6000;
}

// One output sample's time, 1/rate s, for one channel: its steps through the duty, the wave
// digits or the noise register.
static void Advance(uint8_t channel)
{
    struct IrvPsgChannel *chan = &sPsg.channels[channel];
    uint64_t period = (uint64_t)Period(channel) * sPsg.rate;
    uint64_t steps;

    if (!chan->on)
        return;
    chan->clock += PSG_CLOCK;
    steps = chan->clock / period;
    chan->clock %= period;
    if (channel < 2)
    {
        chan->position = (chan->position + steps) & 7;
    }
    else if (channel == 2)
    {
        chan->position = (chan->position + steps) % ((REG(IRV_REG_NR30) & 0x20) ? 64 : 32);
    }
    else
    {
        while (steps-- > 0)
            ShiftNoise();
    }
}

// GBATEK "GBA Sound Channel 3 - Wave Output", NR32 (bits 13-15 of SOUND3CNT_H): mute, 100 %,
// 50 % or 25 %, or 75 % with the force bit.
static uint8_t WaveDigit(uint8_t digit)
{
    uint8_t volume = REG(IRV_REG_NR32);

    if (volume & 0x80)
        return (digit * 3) >> 2;
    switch ((volume >> 5) & 3)
    {
    case 1:
        return digit;
    case 2:
        return digit >> 1;
    case 3:
        return digit >> 2;
    default:
        return 0;
    }
}

// GBATEK "GBA Sound Channel 3 - Wave Output": the digits play from the MSBs of the first byte on;
// with the two-bank dimension (NR30 bit 5) the selected bank plays first, then the other.
static int32_t WaveLevel(uint8_t position)
{
    uint8_t bank = (sPsg.selectedBank + position / 32) & 1;
    uint8_t byte = sPsg.banks[bank][(position % 32) / 2];
    uint8_t digit = (position & 1) ? (byte & 0xF) : (byte >> 4);

    return 2 * WaveDigit(digit) - WaveDigit(15);
}

// GBATEK "GBA Sound Channel 1 - Tone & Sweep", NRx1 bits 6-7: the duty's high steps of 8.
static const uint8_t sDutyHigh[4] = {1, 2, 4, 6};

// A channel's level from -15 to 15, centred on 0 (our choice; GBATEK gives only the span).
static int32_t Level(uint8_t channel)
{
    const struct IrvPsgChannel *chan = &sPsg.channels[channel];
    uint8_t high;

    if (!chan->on)
        return 0;
    if (channel == 2)
        return WaveLevel(chan->position);
    if (channel == 3)
        high = sPsg.noiseHigh;
    else
        high = chan->position < sDutyHigh[REG(sChannelRegisters[channel].length) >> 6];
    return high ? chan->volume : -chan->volume;
}

// GBATEK "GBA Sound Control Registers": NR51 sends each channel right (bits 0-3) and left (bits
// 4-7); NR50 sets the right (bits 0-2) and left (bits 4-6) master volume 0-7, which scales by
// (n+1)/8 (our reading: 7 is full, 0 is quiet); SOUNDCNT_H bits 0-1 set the PSG to 25 %, 50 % or
// 100 % (3, prohibited, plays as 100 %). "Max Output Levels": a channel spans +/-0x80.
static void Mix(float *pair)
{
    static const float sPsgVolume[4] = {0.25f, 0.5f, 1.0f, 1.0f};
    uint8_t enable = REG(IRV_REG_NR51);
    uint8_t volume = REG(IRV_REG_NR50);
    float scale = sPsgVolume[REG(IRV_REG_SOUNDCNT_H) & 3] * 0x80 / 15 / 8;
    int32_t left = 0, right = 0, level;
    uint8_t i;

    for (i = 0; i < 4; i++)
    {
        level = Level(i);
        if (enable & (0x01 << i))
            right += level;
        if (enable & (0x10 << i))
            left += level;
    }
    pair[0] = left * scale * (((volume >> 4) & 7) + 1);
    pair[1] = right * scale * ((volume & 7) + 1);
}

// GBATEK "GBA Sound Control Registers", SOUNDCNT_X bits 0-3: set while a channel sounds, cleared
// when its length expires.
static void WriteOnFlags(void)
{
    uint8_t flags = 0;
    uint8_t i;

    for (i = 0; i < 4; i++)
    {
        if (sPsg.channels[i].on)
            flags |= 1 << i;
    }
    IRV_IO8(IRV_REG_SOUNDCNT_X) = (IRV_IO8(IRV_REG_SOUNDCNT_X) & ~0x0F) | flags;
}

void IrvPsg_Frame(float *pairs, uint32_t count)
{
    uint32_t i;
    uint8_t channel;

    memset(pairs, 0, count * 2 * sizeof(*pairs));
    if (!(IRV_IO8(IRV_REG_SOUNDCNT_X) & MASTER_ENABLE))
        PowerOff();
    else
        ReadRegisters();
    for (i = 0; i < count && sPsg.rate != 0 && (IRV_IO8(IRV_REG_SOUNDCNT_X) & MASTER_ENABLE); i++)
    {
        StepSequencer();
        for (channel = 0; channel < 4; channel++)
            Advance(channel);
        Mix(&pairs[2 * i]);
    }
    WriteOnFlags();
}
