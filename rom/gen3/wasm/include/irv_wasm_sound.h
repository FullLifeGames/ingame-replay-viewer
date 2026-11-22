#ifndef GUARD_IRV_WASM_SOUND_H
#define GUARD_IRV_WASM_SOUND_H

// The WebAssembly build (#35): the platform's sound entry points that m4a.c (overlay patch 0008)
// and the glue (irv_wasm_sound.c) call. The platform files define them; their own headers sit
// in build/wasm/platform/include, which the tree's files do not search.

// The mixer's rate: SOUND_MODE_FREQ_42048 gives 704 samples per frame at 59.7275 frames per
// second (gPcmSamplesPerVBlankTable, SampleFreqSet). The page's audio worklet resamples from it.
#define IRV_WASM_MIXER_RATE 42048

// cgb_audio.c: the PSG channels, synthesised from the sound registers.
void cgb_audio_init(u32 rate);
void cgb_set_sweep(u8 sweep);
void cgb_set_wavram(void);
void cgb_toggle_length(u8 channel, bool8 state);
void cgb_set_length(u8 channel, u8 length);
void cgb_set_envelope(u8 channel, u8 envelope);
void cgb_trigger_note(u8 channel);

// irv_wasm_sound.c: starts the four PSG channels as MPlayExtender leaves their registers.
void IrvWasm_CgbInitChannels(void);

#endif // GUARD_IRV_WASM_SOUND_H
