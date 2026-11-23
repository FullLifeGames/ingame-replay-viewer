#ifndef GUARD_IRV_WASM_SOUND_H
#define GUARD_IRV_WASM_SOUND_H

// The WebAssembly build (#35, #43): the sound's hand-over from our platform layer
// (rom/gen3/wasm/layer) to the page. The layer's SoundMain calls IrvSound_HandOver once per
// frame; irv_wasm_sound.c passes the samples to the host.

// The mixer's rate: SOUND_MODE_FREQ_42048 gives 704 samples per frame at 59.7275 frames per
// second (gPcmSamplesPerVBlankTable, SampleFreqSet; overlay patch 0008). The page's audio
// worklet resamples from it.
#define IRV_WASM_MIXER_RATE 42048

// `count` pairs of floats (left, right) at `rate` pairs per second, mixed and clipped, -1..1.
void IrvSound_HandOver(const float *pairs, u32 count, s32 rate);

#endif // GUARD_IRV_WASM_SOUND_H
