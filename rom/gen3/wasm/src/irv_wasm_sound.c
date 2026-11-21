#include "global.h"
#include "gba/m4a_internal.h"

// The WebAssembly build (#35) starts silent (plan D9). m4a_1.s, the ARM mixer and sequencer, is
// not part of the build, and these stand in for its symbols. MPlayMain never runs, so no track
// advances: a player that MPlayStart starts keeps its status 0, and every wait on a song, a sound
// effect or a cry (IsSEPlaying, IsCryPlaying) sees it as finished. Step B6 replaces this file with
// the platform's mixer and sequencer.

// The entries of gMPlayJumpTableTemplate (m4a_tables.c) and of gMPlayJumpTable (m4a.c).
#define MPLAY_JUMP_TABLE_COUNT 36
#define MPLAY_JUMP_CLEAR_64_BYTES 35

extern void *const gMPlayJumpTableTemplate[];

void SoundMain(void)
{
}

void SoundMainBTM(void)
{
}

void m4aSoundVSync(void)
{
}

void MPlayMain(struct MusicPlayerInfo *mplayInfo)
{
}

void TrackStop(struct MusicPlayerInfo *mplayInfo, struct MusicPlayerTrack *track)
{
}

void RealClearChain(void *x)
{
}

// m4a_1.s's SoundMainBTM clears the 64 bytes at its argument. Clear64byte (m4a.c) calls it through
// entry 35 of the jump table, while m4a_internal.h declares it without the parameter, so a call
// through the table would trap on the signature. The table copy puts this in its place.
static void Clear64Bytes(void *dest)
{
    memset(dest, 0, 64);
}

// SoundInit copies the table, and MPlayOpen clears each player through entry 35 of the copy, so
// the copy is real.
void MPlayJumpTableCopy(MPlayFunc *mplayJumpTable)
{
    s32 i;

    for (i = 0; i < MPLAY_JUMP_TABLE_COUNT; i++)
        mplayJumpTable[i] = (MPlayFunc)gMPlayJumpTableTemplate[i];
    mplayJumpTable[MPLAY_JUMP_CLEAR_64_BYTES] = (MPlayFunc)Clear64Bytes;
}

// The upper word of the 64-bit product, as the ARM routine gives it (MidiKeyToFreq).
u32 umul3232H32(u32 multiplier, u32 multiplicand)
{
    return ((u64)multiplier * multiplicand) >> 32;
}

#define PLY_STUB(name) void name(struct MusicPlayerInfo *mplayInfo, struct MusicPlayerTrack *track) {}

PLY_STUB(ply_fine)
PLY_STUB(ply_goto)
PLY_STUB(ply_patt)
PLY_STUB(ply_pend)
PLY_STUB(ply_rept)
PLY_STUB(ply_prio)
PLY_STUB(ply_tempo)
PLY_STUB(ply_keysh)
PLY_STUB(ply_voice)
PLY_STUB(ply_vol)
PLY_STUB(ply_pan)
PLY_STUB(ply_bend)
PLY_STUB(ply_bendr)
PLY_STUB(ply_lfos)
PLY_STUB(ply_lfodl)
PLY_STUB(ply_mod)
PLY_STUB(ply_modt)
PLY_STUB(ply_tune)
PLY_STUB(ply_port)
PLY_STUB(ply_endtie)

void ply_note(u32 note_cmd, struct MusicPlayerInfo *mplayInfo, struct MusicPlayerTrack *track)
{
}
