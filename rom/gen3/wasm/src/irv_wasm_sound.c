// stdlib.h before global.h, whose abs macro would break the prototype of abs.
#include <stdlib.h>
#include "global.h"
#include "gba/m4a_internal.h"
#include "irv_wasm_sound.h"
#include "music_player.h"
#include <emscripten/em_js.h>
#include <stddef.h>
#include <stdio.h>

// The WebAssembly build (#35) plays sound through the pinned port's C mixer and sequencer
// (sound_mixer.c, music_player.c) and its PSG synthesis (cgb_audio.c), in place of m4a_1.s. The
// port names its functions and structs in its own words; m4a.c and m4a_tables.c call them by the
// names of m4a_1.s. This file forwards those names and hands each frame's samples to the host.

// The port reads the expansion's structs as its own. Overlay patch 0007 gives SoundInfo and
// SoundChannel the port's float fields; these hold the rest to the same layout.
STATIC_ASSERT(sizeof(struct SoundMixerState) == sizeof(struct SoundInfo), IrvWasmMixerSize);
STATIC_ASSERT(offsetof(struct SoundMixerState, sampleRateReciprocal) == offsetof(struct SoundInfo, divFreq), IrvWasmMixerRate);
STATIC_ASSERT(offsetof(struct SoundMixerState, chans) == offsetof(struct SoundInfo, chans), IrvWasmMixerChans);
STATIC_ASSERT(offsetof(struct SoundMixerState, outBuffer) == offsetof(struct SoundInfo, pcmBuffer), IrvWasmMixerBuffer);
STATIC_ASSERT(sizeof(struct MixerSource) == sizeof(struct SoundChannel), IrvWasmChannelSize);
STATIC_ASSERT(sizeof(struct MixerSource) == sizeof(struct CgbChannel), IrvWasmCgbChannelSize);
STATIC_ASSERT(sizeof(struct MP2KPlayerState) == sizeof(struct MusicPlayerInfo), IrvWasmPlayerSize);
// sound_data.o, assembled for the GBA, sizes gMPlayTrack_* by TRACK_SIZE (0x50).
STATIC_ASSERT(sizeof(struct MP2KTrack) == sizeof(struct MusicPlayerTrack), IrvWasmTrackSize);
STATIC_ASSERT(sizeof(struct MusicPlayerTrack) == 0x50, IrvWasmTrackDataSize);

void RunMixerFrame(void);
void MP2KPlayerMain(void *player);
void MP2KClearChain(struct MixerSource *chan);
void MP2K_event_nxx(u8 clock, struct MP2KPlayerState *player, struct MP2KTrack *track);

// m4aSoundMain calls SoundMain in the VBlank interrupt; the port mixes the next frame there.
void SoundMain(void)
{
    RunMixerFrame();
}

void MPlayMain(struct MusicPlayerInfo *mplayInfo)
{
    MP2KPlayerMain(mplayInfo);
}

void RealClearChain(void *x)
{
    MP2KClearChain(x);
}

void ply_note(u32 note_cmd, struct MusicPlayerInfo *mplayInfo, struct MusicPlayerTrack *track)
{
    MP2K_event_nxx(note_cmd, (struct MP2KPlayerState *)mplayInfo, (struct MP2KTrack *)track);
}

#define FORWARD_EVENT(name, event)                                                \
    void event(struct MP2KPlayerState *player, struct MP2KTrack *track);         \
    void name(struct MusicPlayerInfo *mplayInfo, struct MusicPlayerTrack *track) \
    {                                                                             \
        event((struct MP2KPlayerState *)mplayInfo, (struct MP2KTrack *)track);   \
    }

FORWARD_EVENT(ply_fine, MP2K_event_fine)
FORWARD_EVENT(ply_goto, MP2K_event_goto)
FORWARD_EVENT(ply_patt, MP2K_event_patt)
FORWARD_EVENT(ply_pend, MP2K_event_pend)
FORWARD_EVENT(ply_rept, MP2K_event_rept)
FORWARD_EVENT(ply_prio, MP2K_event_prio)
FORWARD_EVENT(ply_tempo, MP2K_event_tempo)
FORWARD_EVENT(ply_keysh, MP2K_event_keysh)
FORWARD_EVENT(ply_voice, MP2K_event_voice)
FORWARD_EVENT(ply_vol, MP2K_event_vol)
FORWARD_EVENT(ply_pan, MP2K_event_pan)
FORWARD_EVENT(ply_bend, MP2K_event_bend)
FORWARD_EVENT(ply_bendr, MP2K_event_bendr)
FORWARD_EVENT(ply_lfos, MP2K_event_lfos)
FORWARD_EVENT(ply_lfodl, MP2K_event_lfodl)
FORWARD_EVENT(ply_mod, MP2K_event_mod)
FORWARD_EVENT(ply_modt, MP2K_event_modt)
FORWARD_EVENT(ply_tune, MP2K_event_tune)
FORWARD_EVENT(ply_port, MP2K_event_port)
FORWARD_EVENT(ply_endtie, MP2K_event_endtie)

// The PSG synthesis runs at the mixer's rate from the first instruction on, as the port's sdl2.c
// starts it before AgbMain.
__attribute__((constructor)) static void InitCgbAudio(void)
{
    cgb_audio_init(IRV_WASM_MIXER_RATE);
}

void IrvWasm_CgbInitChannels(void)
{
    u8 i;

    for (i = 0; i < 4; i++)
    {
        cgb_set_envelope(i, 8);
        cgb_trigger_note(i);
    }
}

// The host's audio import: `count` floats at `samples`, left and right interleaved, at `rate`
// samples per second. It returns before the game goes on; the host copies what it keeps.
EM_JS(void, IrvWasm_HandOverAudio, (const float *samples, int count, int rate), {
    if (typeof Module.irvAudio !== 'function')
        throw new Error('irv-emerald: the host passed no irvAudio function');
    Module.irvAudio(samples, count, rate);
});

// music_player.c's m4aSoundVSync: the frame's samples, mixed and clipped, `size` bytes of floats.
void Platform_QueueAudio(float *audioBuffer, s32 size)
{
    s32 rate = SOUND_INFO_PTR->pcmFreq;

    if (rate != IRV_WASM_MIXER_RATE)
    {
        printf("irv-emerald: the mixer runs at %d Hz, the PSG synthesis at %d Hz\n", (int)rate, IRV_WASM_MIXER_RATE);
        abort();
    }
    IrvWasm_HandOverAudio(audioBuffer, size / sizeof(float), rate);
}
