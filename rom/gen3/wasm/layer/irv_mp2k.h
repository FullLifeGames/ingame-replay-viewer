#ifndef GUARD_IRV_MP2K_H
#define GUARD_IRV_MP2K_H

// Our platform layer (#43): the sequencer of the game's sound engine, written from the MP2K
// functional spec (.waves/04/s4b/mp2k-spec.md, sections 1-5). The game's m4a.c calls these
// functions by the names it declares in include/gba/m4a_internal.h, and the engine calls back
// into the game's C (m4a.c, m4a_tables.c) by name or through the addresses in struct
// IrvSoundInfo. In the host harness the game's part is a stand-in (layer/host).

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "irv_gba.h"
#include "irv_mp2k_types.h"

// The game's defines.h: the BIOS's word that points to the engine's struct SoundInfo.
#define IRV_SOUND_INFO_POINTER 0x03007FF0

typedef void (*IrvSoundPlayerFunc)(struct IrvSoundPlayer *);
typedef void (*IrvSoundCommandFunc)(struct IrvSoundPlayer *, struct IrvSoundTrack *);
typedef void (*IrvSoundNoteFunc)(uint32_t, struct IrvSoundPlayer *, struct IrvSoundTrack *);
typedef void (*IrvSoundOscOffFunc)(uint8_t);
typedef uint32_t (*IrvSoundCgbFreqFunc)(uint8_t, uint8_t, uint8_t);

// A function's address as the game stores it. In the module it is the function pointer itself;
// the host harness numbers its functions and looks the number up.
#ifdef IRV_HOST
void (*IrvHost_Function(uint32_t address))(void);
#define IRV_SOUND_CALL(type, address) ((type)IrvHost_Function(address))
#else
#define IRV_SOUND_CALL(type, address) ((type)(uintptr_t)(address))
#endif

static inline void *IrvSound_Ptr(uint32_t address)
{
    return address == 0 ? NULL : IRV_PTR(address);
}

static inline uint32_t IrvSound_Address(const void *pointer)
{
    return pointer == NULL ? 0 : IRV_ADDRESS(pointer);
}

static inline struct IrvSoundInfo *IrvSound_Info(void)
{
    return IrvSound_Ptr(*(uint32_t *)IRV_PTR(IRV_SOUND_INFO_POINTER));
}

static inline uint8_t IrvSound_PeekByte(const struct IrvSoundTrack *track)
{
    return *(const uint8_t *)IRV_PTR(track->cmdPtr);
}

static inline uint8_t IrvSound_ReadByte(struct IrvSoundTrack *track)
{
    uint8_t byte = IrvSound_PeekByte(track);

    track->cmdPtr++;
    return byte;
}

// MP2K spec 2: multi-byte fields are little-endian; song data holds addresses unaligned.
static inline uint32_t IrvSound_Word(const uint8_t *at)
{
    return at[0] | (at[1] << 8) | (at[2] << 16) | ((uint32_t)at[3] << 24);
}

// irv_mp2k_note.c: the channel's volumes and pitch from its track (MP2K spec 5.4, 4.4).
void IrvSound_SetChannelVolume(struct IrvSoundChannel *chan, const struct IrvSoundTrack *track);
uint32_t IrvSound_ChannelFrequency(const struct IrvSoundChannel *chan, const struct IrvSoundTrack *track);

// irv_mp2k_commands.c: clearing the LFO (MP2K spec 3, "Clearing the LFO").
void IrvSound_ClearLfo(struct IrvSoundTrack *track);

// The engine's names, as the game declares them (MP2K spec 1).
uint32_t umul3232H32(uint32_t multiplier, uint32_t multiplicand);
void MPlayMain(struct IrvSoundPlayer *player);
void MPlayJumpTableCopy(uint32_t *table);
void TrackStop(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void RealClearChain(void *chan);
void ply_note(uint32_t note, struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_fine(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_goto(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_patt(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_pend(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_rept(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_prio(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_tempo(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_keysh(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_voice(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_vol(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_pan(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_bend(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_bendr(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_lfos(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_lfodl(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_mod(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_modt(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_tune(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_port(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void ply_endtie(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);

// The game's C that the engine calls by name (m4a.c, m4a_tables.c; MP2K spec 1).
void TrkVolPitSet(struct IrvSoundPlayer *player, struct IrvSoundTrack *track);
void FadeOutBody(struct IrvSoundPlayer *player);
uint32_t MidiKeyToFreq(struct IrvSoundWave *wave, uint8_t key, uint8_t fine);
extern const uint8_t gClockTable[];
extern const uint32_t gMPlayJumpTableTemplate[];

#endif // GUARD_IRV_MP2K_H
