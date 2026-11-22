#include "gba/m4a_internal.h"
#include "irv_mp2k_types.h"
#include <stddef.h>

// The WebAssembly build (#43): the sequencer of our platform layer takes the sound engine's data
// in its own structs (layer/irv_mp2k_types.h), each pointer as a 32-bit address, while the game
// passes its own (include/gba/m4a_internal.h). These asserts hold each field of each pair at one
// offset and one size. Until the sound swap (B8b) this file stays out of the module
// (scripts/wasm-link.ts); scripts/wasm-mp2k-layout.test.ts compiles it for 32 bits against the
// pinned tree's header.

#define FIELD_SIZE(type, field) sizeof(((struct type *)0)->field)

#define SAME_FIELD(ours, ourField, game, gameField)                                   \
    _Static_assert(offsetof(struct ours, ourField) == offsetof(struct game, gameField) \
                   && FIELD_SIZE(ours, ourField) == FIELD_SIZE(game, gameField),       \
                   #game "." #gameField)

#define SAME_SIZE(ours, game) _Static_assert(sizeof(struct ours) == sizeof(struct game), #game)

_Static_assert(sizeof(struct IrvSoundWave) == offsetof(struct WaveData, data), "WaveData header");
SAME_FIELD(IrvSoundWave, type, WaveData, type);
SAME_FIELD(IrvSoundWave, status, WaveData, status);
SAME_FIELD(IrvSoundWave, freq, WaveData, freq);
SAME_FIELD(IrvSoundWave, loopStart, WaveData, loopStart);
SAME_FIELD(IrvSoundWave, size, WaveData, size);

SAME_SIZE(IrvSoundVoice, ToneData);
SAME_FIELD(IrvSoundVoice, type, ToneData, type);
SAME_FIELD(IrvSoundVoice, key, ToneData, key);
SAME_FIELD(IrvSoundVoice, length, ToneData, length);
SAME_FIELD(IrvSoundVoice, panSweep, ToneData, pan_sweep);
SAME_FIELD(IrvSoundVoice, wave, ToneData, wav);
SAME_FIELD(IrvSoundVoice, attack, ToneData, attack);
SAME_FIELD(IrvSoundVoice, decay, ToneData, decay);
SAME_FIELD(IrvSoundVoice, sustain, ToneData, sustain);
SAME_FIELD(IrvSoundVoice, release, ToneData, release);

SAME_SIZE(IrvSoundChannel, SoundChannel);
SAME_FIELD(IrvSoundChannel, statusFlags, SoundChannel, statusFlags);
SAME_FIELD(IrvSoundChannel, type, SoundChannel, type);
SAME_FIELD(IrvSoundChannel, rightVolume, SoundChannel, rightVolume);
SAME_FIELD(IrvSoundChannel, leftVolume, SoundChannel, leftVolume);
SAME_FIELD(IrvSoundChannel, attack, SoundChannel, attack);
SAME_FIELD(IrvSoundChannel, decay, SoundChannel, decay);
SAME_FIELD(IrvSoundChannel, sustain, SoundChannel, sustain);
SAME_FIELD(IrvSoundChannel, release, SoundChannel, release);
SAME_FIELD(IrvSoundChannel, key, SoundChannel, key);
SAME_FIELD(IrvSoundChannel, envelopeVolume, SoundChannel, envelopeVolume);
SAME_FIELD(IrvSoundChannel, envelopeVolumeRight, SoundChannel, envelopeVolumeRight);
SAME_FIELD(IrvSoundChannel, envelopeVolumeLeft, SoundChannel, envelopeVolumeLeft);
SAME_FIELD(IrvSoundChannel, pseudoEchoVolume, SoundChannel, pseudoEchoVolume);
SAME_FIELD(IrvSoundChannel, pseudoEchoLength, SoundChannel, pseudoEchoLength);
SAME_FIELD(IrvSoundChannel, dummy1, SoundChannel, dummy1);
SAME_FIELD(IrvSoundChannel, dummy2, SoundChannel, dummy2);
SAME_FIELD(IrvSoundChannel, gateTime, SoundChannel, gateTime);
SAME_FIELD(IrvSoundChannel, midiKey, SoundChannel, midiKey);
SAME_FIELD(IrvSoundChannel, velocity, SoundChannel, velocity);
SAME_FIELD(IrvSoundChannel, priority, SoundChannel, priority);
SAME_FIELD(IrvSoundChannel, rhythmPan, SoundChannel, rhythmPan);
SAME_FIELD(IrvSoundChannel, dummy3, SoundChannel, dummy3);
SAME_FIELD(IrvSoundChannel, count, SoundChannel, count);
SAME_FIELD(IrvSoundChannel, fw, SoundChannel, fw);
SAME_FIELD(IrvSoundChannel, frequency, SoundChannel, frequency);
SAME_FIELD(IrvSoundChannel, wave, SoundChannel, wav);
SAME_FIELD(IrvSoundChannel, currentPointer, SoundChannel, currentPointer);
SAME_FIELD(IrvSoundChannel, track, SoundChannel, track);
SAME_FIELD(IrvSoundChannel, prevChannel, SoundChannel, prevChannelPointer);
SAME_FIELD(IrvSoundChannel, nextChannel, SoundChannel, nextChannelPointer);
SAME_FIELD(IrvSoundChannel, dummy4, SoundChannel, dummy4);
SAME_FIELD(IrvSoundChannel, xpi, SoundChannel, xpi);
SAME_FIELD(IrvSoundChannel, xpc, SoundChannel, xpc);

SAME_SIZE(IrvSoundChannel, CgbChannel);
SAME_FIELD(IrvSoundChannel, statusFlags, CgbChannel, statusFlags);
SAME_FIELD(IrvSoundChannel, type, CgbChannel, type);
SAME_FIELD(IrvSoundChannel, rightVolume, CgbChannel, rightVolume);
SAME_FIELD(IrvSoundChannel, leftVolume, CgbChannel, leftVolume);
SAME_FIELD(IrvSoundChannel, attack, CgbChannel, attack);
SAME_FIELD(IrvSoundChannel, decay, CgbChannel, decay);
SAME_FIELD(IrvSoundChannel, sustain, CgbChannel, sustain);
SAME_FIELD(IrvSoundChannel, release, CgbChannel, release);
SAME_FIELD(IrvSoundChannel, key, CgbChannel, key);
SAME_FIELD(IrvSoundChannel, envelopeVolume, CgbChannel, envelopeVolume);
SAME_FIELD(IrvSoundChannel, envelopeGoal, CgbChannel, envelopeGoal);
SAME_FIELD(IrvSoundChannel, envelopeCounter, CgbChannel, envelopeCounter);
SAME_FIELD(IrvSoundChannel, pseudoEchoVolume, CgbChannel, pseudoEchoVolume);
SAME_FIELD(IrvSoundChannel, pseudoEchoLength, CgbChannel, pseudoEchoLength);
SAME_FIELD(IrvSoundChannel, dummy1, CgbChannel, dummy1);
SAME_FIELD(IrvSoundChannel, dummy2, CgbChannel, dummy2);
SAME_FIELD(IrvSoundChannel, gateTime, CgbChannel, gateTime);
SAME_FIELD(IrvSoundChannel, midiKey, CgbChannel, midiKey);
SAME_FIELD(IrvSoundChannel, velocity, CgbChannel, velocity);
SAME_FIELD(IrvSoundChannel, priority, CgbChannel, priority);
SAME_FIELD(IrvSoundChannel, rhythmPan, CgbChannel, rhythmPan);
SAME_FIELD(IrvSoundChannel, dummy3, CgbChannel, dummy3);
SAME_FIELD(IrvSoundChannel, dummy5, CgbChannel, dummy5);
SAME_FIELD(IrvSoundChannel, sustainGoal, CgbChannel, sustainGoal);
SAME_FIELD(IrvSoundChannel, n4, CgbChannel, n4);
SAME_FIELD(IrvSoundChannel, pan, CgbChannel, pan);
SAME_FIELD(IrvSoundChannel, panMask, CgbChannel, panMask);
SAME_FIELD(IrvSoundChannel, modify, CgbChannel, modify);
SAME_FIELD(IrvSoundChannel, length, CgbChannel, length);
SAME_FIELD(IrvSoundChannel, sweep, CgbChannel, sweep);
SAME_FIELD(IrvSoundChannel, frequency, CgbChannel, frequency);
SAME_FIELD(IrvSoundChannel, wave, CgbChannel, wavePointer);
SAME_FIELD(IrvSoundChannel, currentPointer, CgbChannel, currentPointer);
SAME_FIELD(IrvSoundChannel, track, CgbChannel, track);
SAME_FIELD(IrvSoundChannel, prevChannel, CgbChannel, prevChannelPointer);
SAME_FIELD(IrvSoundChannel, nextChannel, CgbChannel, nextChannelPointer);
SAME_FIELD(IrvSoundChannel, psgDummy4, CgbChannel, dummy4);

SAME_SIZE(IrvSoundInfo, SoundInfo);
SAME_FIELD(IrvSoundInfo, ident, SoundInfo, ident);
SAME_FIELD(IrvSoundInfo, pcmDmaCounter, SoundInfo, pcmDmaCounter);
SAME_FIELD(IrvSoundInfo, reverb, SoundInfo, reverb);
SAME_FIELD(IrvSoundInfo, maxChans, SoundInfo, maxChans);
SAME_FIELD(IrvSoundInfo, masterVolume, SoundInfo, masterVolume);
SAME_FIELD(IrvSoundInfo, freq, SoundInfo, freq);
SAME_FIELD(IrvSoundInfo, mode, SoundInfo, mode);
SAME_FIELD(IrvSoundInfo, c15, SoundInfo, c15);
SAME_FIELD(IrvSoundInfo, pcmDmaPeriod, SoundInfo, pcmDmaPeriod);
SAME_FIELD(IrvSoundInfo, maxLines, SoundInfo, maxLines);
SAME_FIELD(IrvSoundInfo, gap, SoundInfo, gap);
SAME_FIELD(IrvSoundInfo, pcmSamplesPerVBlank, SoundInfo, pcmSamplesPerVBlank);
SAME_FIELD(IrvSoundInfo, pcmFreq, SoundInfo, pcmFreq);
SAME_FIELD(IrvSoundInfo, divFreq, SoundInfo, divFreq);
SAME_FIELD(IrvSoundInfo, cgbChans, SoundInfo, cgbChans);
SAME_FIELD(IrvSoundInfo, MPlayMainHead, SoundInfo, MPlayMainHead);
SAME_FIELD(IrvSoundInfo, musicPlayerHead, SoundInfo, musicPlayerHead);
SAME_FIELD(IrvSoundInfo, CgbSound, SoundInfo, CgbSound);
SAME_FIELD(IrvSoundInfo, CgbOscOff, SoundInfo, CgbOscOff);
SAME_FIELD(IrvSoundInfo, MidiKeyToCgbFreq, SoundInfo, MidiKeyToCgbFreq);
SAME_FIELD(IrvSoundInfo, MPlayJumpTable, SoundInfo, MPlayJumpTable);
SAME_FIELD(IrvSoundInfo, plynote, SoundInfo, plynote);
SAME_FIELD(IrvSoundInfo, ExtVolPit, SoundInfo, ExtVolPit);
SAME_FIELD(IrvSoundInfo, gap2, SoundInfo, gap2);
SAME_FIELD(IrvSoundInfo, chans, SoundInfo, chans);
SAME_FIELD(IrvSoundInfo, pcmBuffer, SoundInfo, pcmBuffer);

SAME_FIELD(IrvSoundSongHeader, trackCount, SongHeader, trackCount);
SAME_FIELD(IrvSoundSongHeader, blockCount, SongHeader, blockCount);
SAME_FIELD(IrvSoundSongHeader, priority, SongHeader, priority);
SAME_FIELD(IrvSoundSongHeader, reverb, SongHeader, reverb);
SAME_FIELD(IrvSoundSongHeader, tone, SongHeader, tone);
SAME_FIELD(IrvSoundSongHeader, part, SongHeader, part);

SAME_SIZE(IrvSoundTrack, MusicPlayerTrack);
SAME_FIELD(IrvSoundTrack, flags, MusicPlayerTrack, flags);
SAME_FIELD(IrvSoundTrack, wait, MusicPlayerTrack, wait);
SAME_FIELD(IrvSoundTrack, patternLevel, MusicPlayerTrack, patternLevel);
SAME_FIELD(IrvSoundTrack, repN, MusicPlayerTrack, repN);
SAME_FIELD(IrvSoundTrack, gateTime, MusicPlayerTrack, gateTime);
SAME_FIELD(IrvSoundTrack, key, MusicPlayerTrack, key);
SAME_FIELD(IrvSoundTrack, velocity, MusicPlayerTrack, velocity);
SAME_FIELD(IrvSoundTrack, runningStatus, MusicPlayerTrack, runningStatus);
SAME_FIELD(IrvSoundTrack, keyM, MusicPlayerTrack, keyM);
SAME_FIELD(IrvSoundTrack, pitM, MusicPlayerTrack, pitM);
SAME_FIELD(IrvSoundTrack, keyShift, MusicPlayerTrack, keyShift);
SAME_FIELD(IrvSoundTrack, keyShiftX, MusicPlayerTrack, keyShiftX);
SAME_FIELD(IrvSoundTrack, tune, MusicPlayerTrack, tune);
SAME_FIELD(IrvSoundTrack, pitX, MusicPlayerTrack, pitX);
SAME_FIELD(IrvSoundTrack, bend, MusicPlayerTrack, bend);
SAME_FIELD(IrvSoundTrack, bendRange, MusicPlayerTrack, bendRange);
SAME_FIELD(IrvSoundTrack, volMR, MusicPlayerTrack, volMR);
SAME_FIELD(IrvSoundTrack, volML, MusicPlayerTrack, volML);
SAME_FIELD(IrvSoundTrack, vol, MusicPlayerTrack, vol);
SAME_FIELD(IrvSoundTrack, volX, MusicPlayerTrack, volX);
SAME_FIELD(IrvSoundTrack, pan, MusicPlayerTrack, pan);
SAME_FIELD(IrvSoundTrack, panX, MusicPlayerTrack, panX);
SAME_FIELD(IrvSoundTrack, modM, MusicPlayerTrack, modM);
SAME_FIELD(IrvSoundTrack, mod, MusicPlayerTrack, mod);
SAME_FIELD(IrvSoundTrack, modT, MusicPlayerTrack, modT);
SAME_FIELD(IrvSoundTrack, lfoSpeed, MusicPlayerTrack, lfoSpeed);
SAME_FIELD(IrvSoundTrack, lfoSpeedC, MusicPlayerTrack, lfoSpeedC);
SAME_FIELD(IrvSoundTrack, lfoDelay, MusicPlayerTrack, lfoDelay);
SAME_FIELD(IrvSoundTrack, lfoDelayC, MusicPlayerTrack, lfoDelayC);
SAME_FIELD(IrvSoundTrack, priority, MusicPlayerTrack, priority);
SAME_FIELD(IrvSoundTrack, pseudoEchoVolume, MusicPlayerTrack, pseudoEchoVolume);
SAME_FIELD(IrvSoundTrack, pseudoEchoLength, MusicPlayerTrack, pseudoEchoLength);
SAME_FIELD(IrvSoundTrack, chan, MusicPlayerTrack, chan);
SAME_FIELD(IrvSoundTrack, tone, MusicPlayerTrack, tone);
SAME_FIELD(IrvSoundTrack, gap, MusicPlayerTrack, gap);
SAME_FIELD(IrvSoundTrack, timer, MusicPlayerTrack, timer);
SAME_FIELD(IrvSoundTrack, startOffset, MusicPlayerTrack, unk_3C);
SAME_FIELD(IrvSoundTrack, cmdPtr, MusicPlayerTrack, cmdPtr);
SAME_FIELD(IrvSoundTrack, patternStack, MusicPlayerTrack, patternStack);

SAME_SIZE(IrvSoundPlayer, MusicPlayerInfo);
SAME_FIELD(IrvSoundPlayer, songHeader, MusicPlayerInfo, songHeader);
SAME_FIELD(IrvSoundPlayer, status, MusicPlayerInfo, status);
SAME_FIELD(IrvSoundPlayer, trackCount, MusicPlayerInfo, trackCount);
SAME_FIELD(IrvSoundPlayer, priority, MusicPlayerInfo, priority);
SAME_FIELD(IrvSoundPlayer, cmd, MusicPlayerInfo, cmd);
SAME_FIELD(IrvSoundPlayer, unk_B, MusicPlayerInfo, unk_B);
SAME_FIELD(IrvSoundPlayer, clock, MusicPlayerInfo, clock);
SAME_FIELD(IrvSoundPlayer, gap, MusicPlayerInfo, gap);
SAME_FIELD(IrvSoundPlayer, memAccArea, MusicPlayerInfo, memAccArea);
SAME_FIELD(IrvSoundPlayer, tempoD, MusicPlayerInfo, tempoD);
SAME_FIELD(IrvSoundPlayer, tempoU, MusicPlayerInfo, tempoU);
SAME_FIELD(IrvSoundPlayer, tempoI, MusicPlayerInfo, tempoI);
SAME_FIELD(IrvSoundPlayer, tempoC, MusicPlayerInfo, tempoC);
SAME_FIELD(IrvSoundPlayer, fadeOI, MusicPlayerInfo, fadeOI);
SAME_FIELD(IrvSoundPlayer, fadeOC, MusicPlayerInfo, fadeOC);
SAME_FIELD(IrvSoundPlayer, fadeOV, MusicPlayerInfo, fadeOV);
SAME_FIELD(IrvSoundPlayer, tracks, MusicPlayerInfo, tracks);
SAME_FIELD(IrvSoundPlayer, tone, MusicPlayerInfo, tone);
SAME_FIELD(IrvSoundPlayer, ident, MusicPlayerInfo, ident);
SAME_FIELD(IrvSoundPlayer, MPlayMainNext, MusicPlayerInfo, MPlayMainNext);
SAME_FIELD(IrvSoundPlayer, musicPlayerNext, MusicPlayerInfo, musicPlayerNext);
