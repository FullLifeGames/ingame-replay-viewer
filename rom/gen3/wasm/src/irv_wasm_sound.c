// stdlib.h before global.h, whose abs macro would break the prototype of abs.
#include <stdlib.h>
#include "global.h"
#include "irv_wasm_sound.h"
#include <emscripten/em_js.h>
#include <stdio.h>

// The WebAssembly build (#35, #43) plays sound through our platform layer: its sequencer, PCM
// mixer and PSG (rom/gen3/wasm/layer/irv_mp2k_*.c, irv_psg.c) take the place of m4a_1.s and the
// sound hardware. This file hands each frame's samples to the host.

// The host's audio import: `count` floats at `samples`, left and right interleaved, at `rate`
// samples per second. It returns before the game goes on; the host copies what it keeps.
EM_JS(void, IrvWasm_HandOverAudio, (const float *samples, int count, int rate), {
    if (typeof Module.irvAudio !== 'function')
        throw new Error('irv-emerald: the host passed no irvAudio function');
    Module.irvAudio(samples, count, rate);
});

// The layer's SoundMain, at the end of each frame's mix (MP2K spec 10, O1 (a)).
void IrvSound_HandOver(const float *pairs, u32 count, s32 rate)
{
    if (rate != IRV_WASM_MIXER_RATE)
    {
        printf("irv-emerald: the mixer runs at %d Hz, the page expects %d Hz\n", (int)rate, IRV_WASM_MIXER_RATE);
        abort();
    }
    IrvWasm_HandOverAudio(pairs, count * 2, rate);
}
