// The host harness of our platform layer (#43): what the game's C provides around the sound
// engine's sequencer, as stand-ins (MP2K spec 1). In the module these are the game's own m4a.c
// and m4a_tables.c. Never part of the module.
//
// The stand-ins compute what the spec says the game's functions compute, or something simpler
// that shows their arguments:
//   TrkVolPitSet       MP2K spec 4.4 step 1
//   MidiKeyToFreq      the low 16 bits of the sample's address, the key and the fine offset, one
//                      byte each from the top: (wave << 16) | (key << 8) | fine
//   MidiKeyToCgbFreq   (channel << 16) | (key << 8) | fine
//   CgbOscOff          appends the channel number to the log at HOST_LOG
//   ply_xcmd           the XCMD sub-commands xRELE, xIECV, xIECL, xWAIT and 0x0D (MP2K spec 3)
//   FadeOutBody        nothing
//   IrvSound_HandOver  writes the pair count, the rate and the pairs at HOST_AUDIO
#include <string.h>
#include "irv_layer_host.h"
#include "irv_mp2k.h"

#define HOST_LOG     0x0203F000
#define HOST_LOG_MAX 15
#define HOST_AUDIO   0x02040000
#define HOST_PAIRS   1584

// MP2K spec 2.6, gClockTable.
const uint8_t gClockTable[] = {
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    28, 30, 32, 36, 40, 42, 44, 48, 52, 54, 56, 60, 64, 66, 68, 72, 76, 78, 80, 84, 88, 90, 92, 96,
};

// MP2K spec 2.5, gDeltaEncodingTable.
const int8_t gDeltaEncodingTable[] = { 0, 1, 4, 9, 16, 25, 36, 49, -64, -49, -36, -25, -16, -9, -4, -1 };

void IrvSound_HandOver(const float *pairs, uint32_t count, int32_t rate)
{
    uint32_t *words = IRV_PTR(HOST_AUDIO);

    if (count > HOST_PAIRS)
        Fail("a frame of more sound pairs than the harness keeps");
    words[0] = count;
    words[1] = (uint32_t)rate;
    memcpy(&words[2], pairs, count * 2 * sizeof(float));
}

static void HostCgbOscOff(uint8_t chan);
static uint32_t HostMidiKeyToCgbFreq(uint8_t chan, uint8_t key, uint8_t fine);
static void HostXcmd(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);

typedef void (*HostFunction)(void);

// The function numbers: 1-5 as scripts/wasm-layer-mp2k.ts names them, the rest the template's.
enum
{
    FN_NONE,
    FN_MPLAY_MAIN,
    FN_PLY_NOTE,
    FN_CGB_OSC_OFF,
    FN_MIDI_KEY_TO_CGB_FREQ,
    FN_XCMD,
    FN_FINE,
    FN_GOTO,
    FN_PATT,
    FN_PEND,
    FN_REPT,
    FN_PRIO,
    FN_TEMPO,
    FN_KEYSH,
    FN_VOICE,
    FN_VOL,
    FN_PAN,
    FN_BEND,
    FN_BENDR,
    FN_LFOS,
    FN_LFODL,
    FN_MOD,
    FN_MODT,
    FN_TUNE,
    FN_PORT,
    FN_ENDTIE,
    FN_TRACK_STOP,
    FN_FADE_OUT_BODY,
    FN_TRK_VOL_PIT_SET,
    FN_REAL_CLEAR_CHAIN,
    FN_COUNT,
};

static const HostFunction sFunctions[FN_COUNT] = {
    [FN_MPLAY_MAIN] = (HostFunction)MPlayMain,
    [FN_PLY_NOTE] = (HostFunction)ply_note,
    [FN_CGB_OSC_OFF] = (HostFunction)HostCgbOscOff,
    [FN_MIDI_KEY_TO_CGB_FREQ] = (HostFunction)HostMidiKeyToCgbFreq,
    [FN_XCMD] = (HostFunction)HostXcmd,
    [FN_FINE] = (HostFunction)ply_fine,
    [FN_GOTO] = (HostFunction)ply_goto,
    [FN_PATT] = (HostFunction)ply_patt,
    [FN_PEND] = (HostFunction)ply_pend,
    [FN_REPT] = (HostFunction)ply_rept,
    [FN_PRIO] = (HostFunction)ply_prio,
    [FN_TEMPO] = (HostFunction)ply_tempo,
    [FN_KEYSH] = (HostFunction)ply_keysh,
    [FN_VOICE] = (HostFunction)ply_voice,
    [FN_VOL] = (HostFunction)ply_vol,
    [FN_PAN] = (HostFunction)ply_pan,
    [FN_BEND] = (HostFunction)ply_bend,
    [FN_BENDR] = (HostFunction)ply_bendr,
    [FN_LFOS] = (HostFunction)ply_lfos,
    [FN_LFODL] = (HostFunction)ply_lfodl,
    [FN_MOD] = (HostFunction)ply_mod,
    [FN_MODT] = (HostFunction)ply_modt,
    [FN_TUNE] = (HostFunction)ply_tune,
    [FN_PORT] = (HostFunction)ply_port,
    [FN_ENDTIE] = (HostFunction)ply_endtie,
    [FN_TRACK_STOP] = (HostFunction)TrackStop,
    [FN_FADE_OUT_BODY] = (HostFunction)FadeOutBody,
    [FN_TRK_VOL_PIT_SET] = (HostFunction)TrkVolPitSet,
    [FN_REAL_CLEAR_CHAIN] = (HostFunction)RealClearChain,
};

// MP2K spec 2.6, the jump-table indexes. Entries 30 (SampleFreqSet) and 35 (SoundMainBTM) stay
// empty: nothing here calls them.
const uint32_t gMPlayJumpTableTemplate[IRV_SOUND_JUMP_ENTRIES] = {
    FN_FINE, FN_GOTO, FN_PATT, FN_PEND, FN_REPT, FN_FINE, FN_FINE, FN_FINE, FN_FINE,
    FN_PRIO, FN_TEMPO, FN_KEYSH, FN_VOICE, FN_VOL, FN_PAN, FN_BEND, FN_BENDR, FN_LFOS,
    FN_LFODL, FN_MOD, FN_MODT, FN_FINE, FN_FINE, FN_TUNE, FN_FINE, FN_FINE, FN_FINE,
    FN_PORT, FN_FINE, FN_ENDTIE, FN_NONE, FN_TRACK_STOP, FN_FADE_OUT_BODY, FN_TRK_VOL_PIT_SET,
    FN_REAL_CLEAR_CHAIN, FN_NONE,
};

void (*IrvHost_Function(uint32_t address))(void)
{
    if (address == FN_NONE || address >= FN_COUNT)
        Fail("a call through a function address the harness does not know");
    return sFunctions[address];
}

static int32_t Clamp(int32_t value, int32_t low, int32_t high)
{
    return value < low ? low : value > high ? high : value;
}

// MP2K spec 4.4 step 1.
void TrkVolPitSet(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    if (track->flags & IRV_TRACK_VOLUME_SET)
    {
        int32_t x = track->vol * track->volX >> 5;
        int32_t y = 2 * track->pan + track->panX;

        if (track->modT == 1)
            x = x * (track->modM + 128) >> 7;
        if (track->modT == 2)
            y += track->modM;
        y = Clamp(y, -128, 127);
        track->volMR = (y + 128) * x >> 8;
        track->volML = (127 - y) * x >> 8;
    }
    if (track->flags & IRV_TRACK_PITCH_SET)
    {
        int32_t v = (track->tune + track->bend * track->bendRange) * 4
                  + (track->keyShift + track->keyShiftX) * 256 + track->pitX;

        if (track->modT == 0)
            v += 16 * track->modM;
        track->keyM = v >> 8;
        track->pitM = v & 0xFF;
    }
    track->flags &= ~(IRV_TRACK_VOLUME_SET | IRV_TRACK_PITCH_SET);
}

void FadeOutBody(struct IrvSoundPlayer *player)
{
    (void)player;
}

uint32_t MidiKeyToFreq(struct IrvSoundWave *wave, uint8_t key, uint8_t fine)
{
    return (IrvSound_Address(wave) << 16) | (key << 8) | fine;
}

static uint32_t HostMidiKeyToCgbFreq(uint8_t chan, uint8_t key, uint8_t fine)
{
    return (chan << 16) | (key << 8) | fine;
}

static void HostCgbOscOff(uint8_t chan)
{
    uint32_t *log = IRV_PTR(HOST_LOG);

    if (log[0] == HOST_LOG_MAX)
        Fail("more CgbOscOff calls than the log holds");
    log[++log[0]] = chan;
}

static void HostXwait(struct IrvSoundTrack *track)
{
    const uint8_t *at = IRV_PTR(track->cmdPtr);
    uint16_t length = at[0] | (at[1] << 8);

    if (track->timer < length)
    {
        track->timer++;
        track->cmdPtr -= 2;
        track->wait = 1;
    }
    else
    {
        track->timer = 0;
        track->cmdPtr += 2;
    }
}

static void HostXcmd(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    uint8_t sub = IrvSound_ReadByte(track);

    (void)player;
    if (sub == 0x07)
        track->tone.release = IrvSound_ReadByte(track);
    else if (sub == 0x08)
        track->pseudoEchoVolume = IrvSound_ReadByte(track);
    else if (sub == 0x09)
        track->pseudoEchoLength = IrvSound_ReadByte(track);
    else if (sub == 0x0C)
        HostXwait(track);
    else if (sub == 0x0D)
    {
        track->startOffset = IrvSound_Word(IRV_PTR(track->cmdPtr));
        track->cmdPtr += 4;
    }
    else
        Fail("an XCMD the harness does not serve");
}

// The script's sound operation (irv_layer_host_script.c, operation 13). Returns true when it
// gives a result word.
bool HostSoundCall(uint32_t call, uint32_t a, uint32_t b, uint32_t *result)
{
    struct IrvSoundInfo *info = IrvSound_Info();

    switch (call)
    {
    case 0:
        if (info->MPlayMainHead != 0)
            IRV_SOUND_CALL(IrvSoundPlayerFunc, info->MPlayMainHead)(IrvSound_Ptr(info->musicPlayerHead));
        return false;
    case 1:
        MPlayJumpTableCopy(IrvSound_Ptr(a));
        return false;
    case 2:
        TrackStop(IrvSound_Ptr(a), IrvSound_Ptr(b));
        return false;
    case 3:
        RealClearChain(IrvSound_Ptr(a));
        return false;
    case 4:
        *result = umul3232H32(a, b);
        return true;
    case 5:
        SoundMain();
        return false;
    case 6:
        m4aSoundVSync();
        return false;
    case 7:
        SoundMainBTM(IrvSound_Ptr(a));
        return false;
    default:
        Fail("an unknown sound call in the script");
    }
}
