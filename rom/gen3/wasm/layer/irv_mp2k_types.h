#ifndef GUARD_IRV_MP2K_TYPES_H
#define GUARD_IRV_MP2K_TYPES_H

// Our platform layer (#43): the sound engine's data in the layout of the game's
// include/gba/m4a_internal.h (MP2K spec section 2). Every pointer field is a 32-bit GBA address,
// the size a pointer has in the module, so one layout holds in the module and in the host harness.
// The glue file rom/gen3/wasm/src/irv_wasm_mp2k_layout.c holds each struct against the game's.

#include <stddef.h>
#include <stdint.h>

// MP2K spec 1, R2: the lock word of an idle engine or player.
#define IRV_SOUND_ID 0x68736D53

// MP2K spec 1, R4, and 2.3.
#define IRV_SOUND_PCM_CHANNELS 12
#define IRV_SOUND_PCM_BUFFER   1584
#define IRV_SOUND_MAX_TRACKS   16
#define IRV_SOUND_JUMP_ENTRIES 36

// MP2K spec 2.2: the voice's type byte.
#define IRV_VOICE_PSG   0x07
#define IRV_VOICE_FIX   0x08
#define IRV_VOICE_SPLIT 0x40
#define IRV_VOICE_DRUMS 0x80

// MP2K spec 6.4: a channel's status flags.
#define IRV_CHANNEL_START 0x80
#define IRV_CHANNEL_STOP  0x40
#define IRV_CHANNEL_ECHO  0x04
#define IRV_CHANNEL_PHASE 0x03
#define IRV_CHANNEL_ON    (IRV_CHANNEL_START | IRV_CHANNEL_STOP | IRV_CHANNEL_ECHO | IRV_CHANNEL_PHASE)

// MP2K spec 4.4: a PSG channel's changes for the game's CgbSound.
#define IRV_PSG_MODIFY_VOLUME 0x01
#define IRV_PSG_MODIFY_PITCH  0x02

// MP2K spec 2.3: the track flags and the player's pause bit.
#define IRV_TRACK_VOLUME_SET    0x01
#define IRV_TRACK_VOLUME_CHANGE 0x03
#define IRV_TRACK_PITCH_SET     0x04
#define IRV_TRACK_PITCH_CHANGE  0x0C
#define IRV_TRACK_PENDING       0x0F
#define IRV_TRACK_START         0x40
#define IRV_TRACK_EXIST         0x80
#define IRV_PLAYER_PAUSE        0x80000000u

// MP2K spec 2.4 (struct WaveData): the sample header; the samples follow.
struct IrvSoundWave
{
    uint16_t type;
    uint16_t status;
    uint32_t freq;
    uint32_t loopStart;
    uint32_t size;
};

// MP2K spec 2.2 (struct ToneData). A split voice keeps its key-split table's address in the bytes
// from attack to release.
struct IrvSoundVoice
{
    uint8_t type;
    uint8_t key;
    uint8_t length;
    uint8_t panSweep;
    uint32_t wave;
    uint8_t attack;
    uint8_t decay;
    uint8_t sustain;
    uint8_t release;
};

// MP2K spec 2.3 and 6.4: one channel, DirectSound (struct SoundChannel) or PSG (struct
// CgbChannel). The two kinds share every field the sequencer uses; the unions hold the fields
// where they differ.
struct IrvSoundChannel
{
    uint8_t statusFlags;
    uint8_t type;
    uint8_t rightVolume;
    uint8_t leftVolume;
    uint8_t attack;
    uint8_t decay;
    uint8_t sustain;
    uint8_t release;
    uint8_t key;
    uint8_t envelopeVolume;
    union
    {
        struct
        {
            uint8_t envelopeVolumeRight;
            uint8_t envelopeVolumeLeft;
        };
        struct
        {
            uint8_t envelopeGoal;
            uint8_t envelopeCounter;
        };
    };
    uint8_t pseudoEchoVolume;
    uint8_t pseudoEchoLength;
    uint8_t dummy1;
    uint8_t dummy2;
    uint8_t gateTime;
    uint8_t midiKey;
    uint8_t velocity;
    uint8_t priority;
    uint8_t rhythmPan;
    uint8_t dummy3[3];
    union
    {
        struct
        {
            uint32_t count;
            uint32_t fw;
        };
        struct
        {
            uint8_t dummy5;
            uint8_t sustainGoal;
            uint8_t n4;
            uint8_t pan;
            uint8_t panMask;
            uint8_t modify;
            uint8_t length;
            uint8_t sweep;
        };
    };
    uint32_t frequency;
    uint32_t wave;
    uint32_t currentPointer;
    uint32_t track;
    uint32_t prevChannel;
    uint32_t nextChannel;
    union
    {
        struct
        {
            uint32_t dummy4;
            uint16_t xpi;
            uint16_t xpc;
        };
        uint8_t psgDummy4[8];
    };
};

// MP2K spec 2.3 (struct SoundInfo). The function fields hold the functions' addresses.
struct IrvSoundInfo
{
    uint32_t ident;
    volatile uint8_t pcmDmaCounter;
    uint8_t reverb;
    uint8_t maxChans;
    uint8_t masterVolume;
    uint8_t freq;
    uint8_t mode;
    uint8_t c15;
    uint8_t pcmDmaPeriod;
    uint8_t maxLines;
    uint8_t gap[3];
    int32_t pcmSamplesPerVBlank;
    int32_t pcmFreq;
    int32_t divFreq;
    uint32_t cgbChans;
    uint32_t MPlayMainHead;
    uint32_t musicPlayerHead;
    uint32_t CgbSound;
    uint32_t CgbOscOff;
    uint32_t MidiKeyToCgbFreq;
    uint32_t MPlayJumpTable;
    uint32_t plynote;
    uint32_t ExtVolPit;
    uint8_t gap2[16];
    struct IrvSoundChannel chans[IRV_SOUND_PCM_CHANNELS];
    int8_t pcmBuffer[IRV_SOUND_PCM_BUFFER * 2];
};

// MP2K spec 2.1 (struct SongHeader): `part` runs on for trackCount entries.
struct IrvSoundSongHeader
{
    uint8_t trackCount;
    uint8_t blockCount;
    uint8_t priority;
    uint8_t reverb;
    uint32_t tone;
    uint32_t part[1];
};

// MP2K spec 2.3 (struct MusicPlayerTrack), 0x50 bytes.
struct IrvSoundTrack
{
    uint8_t flags;
    uint8_t wait;
    uint8_t patternLevel;
    uint8_t repN;
    uint8_t gateTime;
    uint8_t key;
    uint8_t velocity;
    uint8_t runningStatus;
    int8_t keyM;
    uint8_t pitM;
    int8_t keyShift;
    int8_t keyShiftX;
    int8_t tune;
    uint8_t pitX;
    int8_t bend;
    uint8_t bendRange;
    uint8_t volMR;
    uint8_t volML;
    uint8_t vol;
    uint8_t volX;
    int8_t pan;
    int8_t panX;
    int8_t modM;
    uint8_t mod;
    uint8_t modT;
    uint8_t lfoSpeed;
    uint8_t lfoSpeedC;
    uint8_t lfoDelay;
    uint8_t lfoDelayC;
    uint8_t priority;
    uint8_t pseudoEchoVolume;
    uint8_t pseudoEchoLength;
    uint32_t chan;
    struct IrvSoundVoice tone;
    uint8_t gap[10];
    uint16_t timer;
    uint32_t startOffset;
    uint32_t cmdPtr;
    uint32_t patternStack[3];
};

// MP2K spec 2.3 (struct MusicPlayerInfo), 64 bytes.
struct IrvSoundPlayer
{
    uint32_t songHeader;
    uint32_t status;
    uint8_t trackCount;
    uint8_t priority;
    uint8_t cmd;
    uint8_t unk_B;
    uint32_t clock;
    uint8_t gap[8];
    uint32_t memAccArea;
    uint16_t tempoD;
    uint16_t tempoU;
    uint16_t tempoI;
    uint16_t tempoC;
    uint16_t fadeOI;
    uint16_t fadeOC;
    uint16_t fadeOV;
    uint32_t tracks;
    uint32_t tone;
    uint32_t ident;
    uint32_t MPlayMainNext;
    uint32_t musicPlayerNext;
};

// The offsets the spec names (m4a_constants.inc), held here so the host harness checks them too.
_Static_assert(sizeof(struct IrvSoundVoice) == 12, "a voice is 12 bytes");
_Static_assert(sizeof(struct IrvSoundChannel) == 0x40, "a channel is 0x40 bytes");
_Static_assert(offsetof(struct IrvSoundChannel, count) == 0x18, "channel count");
_Static_assert(offsetof(struct IrvSoundChannel, modify) == 0x1D, "channel modify");
_Static_assert(offsetof(struct IrvSoundChannel, track) == 0x2C, "channel track");
_Static_assert(offsetof(struct IrvSoundChannel, nextChannel) == 0x34, "channel next");
_Static_assert(offsetof(struct IrvSoundInfo, chans) == 0x50, "sound info chans");
_Static_assert(sizeof(struct IrvSoundInfo) == 0x50 + 12 * 0x40 + 2 * 1584, "sound info size");
_Static_assert(offsetof(struct IrvSoundTrack, chan) == 0x20, "track chan");
_Static_assert(offsetof(struct IrvSoundTrack, timer) == 0x3A, "track timer");
_Static_assert(offsetof(struct IrvSoundTrack, cmdPtr) == 0x40, "track cmdPtr");
_Static_assert(sizeof(struct IrvSoundTrack) == 0x50, "a track is 0x50 bytes");
_Static_assert(offsetof(struct IrvSoundPlayer, tracks) == 0x2C, "player tracks");
_Static_assert(sizeof(struct IrvSoundPlayer) == 0x40, "a player is 0x40 bytes");

#endif // GUARD_IRV_MP2K_TYPES_H
