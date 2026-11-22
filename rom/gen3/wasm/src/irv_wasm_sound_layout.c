// stdlib.h before global.h, whose abs macro would break the prototype of abs.
#include <stdlib.h>
#include "global.h"
#include "gba/m4a_internal.h"
#include "music_player.h"
#include <stddef.h>

// The WebAssembly build (#35): the pinned port's mixer and sequencer read the expansion's sound
// structs as their own (irv_wasm_sound.c casts one to the other). Overlay patch 0007 gives
// SoundInfo and SoundChannel the port's float fields. These asserts hold every field of each pair
// at one offset and one size, so a reordering of two fields of one size stops the build.

#define FIELD_SIZE(type, field) sizeof(((struct type *)0)->field)

// The port's field portField lies where ours does and has its size.
#define SAME_FIELD(port, portField, ours, ourField)                                       \
    STATIC_ASSERT(offsetof(struct port, portField) == offsetof(struct ours, ourField)     \
                  && FIELD_SIZE(port, portField) == FIELD_SIZE(ours, ourField),           \
                  IrvWasm_##ours##_##ourField)

// Padding that each side splits in its own way: only the start matches.
#define SAME_START(port, portField, ours, ourField)                                       \
    STATIC_ASSERT(offsetof(struct port, portField) == offsetof(struct ours, ourField),    \
                  IrvWasm_##ours##_##ourField##_start)

STATIC_ASSERT(sizeof(struct SoundMixerState) == sizeof(struct SoundInfo), IrvWasmMixerSize);
SAME_FIELD(SoundMixerState, lockStatus, SoundInfo, ident);
SAME_FIELD(SoundMixerState, dmaCounter, SoundInfo, pcmDmaCounter);
SAME_FIELD(SoundMixerState, reverb, SoundInfo, reverb);
SAME_FIELD(SoundMixerState, numChans, SoundInfo, maxChans);
SAME_FIELD(SoundMixerState, masterVol, SoundInfo, masterVolume);
SAME_FIELD(SoundMixerState, freqOption, SoundInfo, freq);
SAME_FIELD(SoundMixerState, extensionFlags, SoundInfo, mode);
SAME_FIELD(SoundMixerState, cgbCounter15, SoundInfo, c15);
SAME_FIELD(SoundMixerState, framesPerDmaCycle, SoundInfo, pcmDmaPeriod);
SAME_FIELD(SoundMixerState, maxScanlines, SoundInfo, maxLines);
SAME_START(SoundMixerState, padding1, SoundInfo, gap);
SAME_FIELD(SoundMixerState, samplesPerFrame, SoundInfo, pcmSamplesPerVBlank);
SAME_FIELD(SoundMixerState, sampleRate, SoundInfo, pcmFreq);
SAME_FIELD(SoundMixerState, sampleRateReciprocal, SoundInfo, divFreq);
SAME_FIELD(SoundMixerState, cgbChans, SoundInfo, cgbChans);
SAME_FIELD(SoundMixerState, firstPlayerFunc, SoundInfo, MPlayMainHead);
SAME_FIELD(SoundMixerState, firstPlayer, SoundInfo, musicPlayerHead);
SAME_FIELD(SoundMixerState, cgbMixerFunc, SoundInfo, CgbSound);
SAME_FIELD(SoundMixerState, cgbNoteOffFunc, SoundInfo, CgbOscOff);
SAME_FIELD(SoundMixerState, cgbCalcFreqFunc, SoundInfo, MidiKeyToCgbFreq);
SAME_FIELD(SoundMixerState, mp2kEventFuncTable, SoundInfo, MPlayJumpTable);
SAME_FIELD(SoundMixerState, mp2kEventNxxFunc, SoundInfo, plynote);
SAME_FIELD(SoundMixerState, reserved1, SoundInfo, ExtVolPit);
SAME_START(SoundMixerState, reserved2, SoundInfo, gap2);
SAME_FIELD(SoundMixerState, chans, SoundInfo, chans);
SAME_FIELD(SoundMixerState, outBuffer, SoundInfo, pcmBuffer);

STATIC_ASSERT(sizeof(struct MixerSource) == sizeof(struct SoundChannel), IrvWasmChannelSize);
SAME_FIELD(MixerSource, status, SoundChannel, statusFlags);
SAME_FIELD(MixerSource, type, SoundChannel, type);
SAME_FIELD(MixerSource, rightVol, SoundChannel, rightVolume);
SAME_FIELD(MixerSource, leftVol, SoundChannel, leftVolume);
SAME_FIELD(MixerSource, attack, SoundChannel, attack);
SAME_FIELD(MixerSource, decay, SoundChannel, decay);
SAME_FIELD(MixerSource, sustain, SoundChannel, sustain);
SAME_FIELD(MixerSource, release, SoundChannel, release);
SAME_FIELD(MixerSource, key, SoundChannel, key);
SAME_FIELD(MixerSource, envelopeVol, SoundChannel, envelopeVolume);
SAME_FIELD(MixerSource, envelopeVolR, SoundChannel, envelopeVolumeRight);
SAME_FIELD(MixerSource, envelopeVolL, SoundChannel, envelopeVolumeLeft);
SAME_FIELD(MixerSource, echoVol, SoundChannel, pseudoEchoVolume);
SAME_FIELD(MixerSource, echoLen, SoundChannel, pseudoEchoLength);
SAME_FIELD(MixerSource, padding1, SoundChannel, dummy1);
SAME_FIELD(MixerSource, padding2, SoundChannel, dummy2);
SAME_FIELD(MixerSource, gateTime, SoundChannel, gateTime);
SAME_FIELD(MixerSource, untransposedKey, SoundChannel, midiKey);
SAME_FIELD(MixerSource, velocity, SoundChannel, velocity);
SAME_FIELD(MixerSource, priority, SoundChannel, priority);
SAME_FIELD(MixerSource, rhythmPan, SoundChannel, rhythmPan);
SAME_START(MixerSource, padding3, SoundChannel, dummy3);
SAME_FIELD(MixerSource, ct, SoundChannel, count);
SAME_FIELD(MixerSource, fw, SoundChannel, fw);
SAME_FIELD(MixerSource, freq, SoundChannel, frequency);
SAME_FIELD(MixerSource, wav, SoundChannel, wav);
SAME_FIELD(MixerSource, current, SoundChannel, currentPointer);
SAME_FIELD(MixerSource, track, SoundChannel, track);
SAME_FIELD(MixerSource, prev, SoundChannel, prevChannelPointer);
SAME_FIELD(MixerSource, next, SoundChannel, nextChannelPointer);
SAME_FIELD(MixerSource, padding7, SoundChannel, dummy4);
SAME_FIELD(MixerSource, blockCount, SoundChannel, blockCount);

// SoundInfo.cgbChans points at CgbChannels, which the port reads as MixerSources.
STATIC_ASSERT(sizeof(struct MixerSource) == sizeof(struct CgbChannel), IrvWasmCgbChannelSize);
SAME_FIELD(MixerSource, status, CgbChannel, statusFlags);
SAME_FIELD(MixerSource, type, CgbChannel, type);
SAME_FIELD(MixerSource, rightVol, CgbChannel, rightVolume);
SAME_FIELD(MixerSource, leftVol, CgbChannel, leftVolume);
SAME_FIELD(MixerSource, attack, CgbChannel, attack);
SAME_FIELD(MixerSource, decay, CgbChannel, decay);
SAME_FIELD(MixerSource, sustain, CgbChannel, sustain);
SAME_FIELD(MixerSource, release, CgbChannel, release);
SAME_FIELD(MixerSource, key, CgbChannel, key);
SAME_FIELD(MixerSource, envelopeVol, CgbChannel, envelopeVolume);
SAME_FIELD(MixerSource, envelopeGoal, CgbChannel, envelopeGoal);
SAME_FIELD(MixerSource, envelopeCtr, CgbChannel, envelopeCounter);
SAME_FIELD(MixerSource, echoVol, CgbChannel, pseudoEchoVolume);
SAME_FIELD(MixerSource, echoLen, CgbChannel, pseudoEchoLength);
SAME_FIELD(MixerSource, padding1, CgbChannel, dummy1);
SAME_FIELD(MixerSource, padding2, CgbChannel, dummy2);
SAME_FIELD(MixerSource, gateTime, CgbChannel, gateTime);
SAME_FIELD(MixerSource, untransposedKey, CgbChannel, midiKey);
SAME_FIELD(MixerSource, velocity, CgbChannel, velocity);
SAME_FIELD(MixerSource, priority, CgbChannel, priority);
SAME_FIELD(MixerSource, rhythmPan, CgbChannel, rhythmPan);
SAME_START(MixerSource, padding3, CgbChannel, dummy3);
SAME_FIELD(MixerSource, padding6, CgbChannel, dummy5);
SAME_FIELD(MixerSource, sustainGoal, CgbChannel, sustainGoal);
SAME_FIELD(MixerSource, nrx4, CgbChannel, n4);
SAME_FIELD(MixerSource, pan, CgbChannel, pan);
SAME_FIELD(MixerSource, panMask, CgbChannel, panMask);
SAME_FIELD(MixerSource, cgbStatus, CgbChannel, modify);
SAME_FIELD(MixerSource, length, CgbChannel, length);
SAME_FIELD(MixerSource, sweep, CgbChannel, sweep);
SAME_FIELD(MixerSource, freq, CgbChannel, frequency);
SAME_FIELD(MixerSource, newCgb3Sample, CgbChannel, wavePointer);
SAME_FIELD(MixerSource, oldCgb3Sample, CgbChannel, currentPointer);
SAME_FIELD(MixerSource, track, CgbChannel, track);
SAME_FIELD(MixerSource, prev, CgbChannel, prevChannelPointer);
SAME_FIELD(MixerSource, next, CgbChannel, nextChannelPointer);
SAME_START(MixerSource, padding7, CgbChannel, dummy4);

STATIC_ASSERT(sizeof(struct MP2KPlayerState) == sizeof(struct MusicPlayerInfo), IrvWasmPlayerSize);
SAME_FIELD(MP2KPlayerState, songHeader, MusicPlayerInfo, songHeader);
SAME_FIELD(MP2KPlayerState, status, MusicPlayerInfo, status);
SAME_FIELD(MP2KPlayerState, trackCount, MusicPlayerInfo, trackCount);
SAME_FIELD(MP2KPlayerState, priority, MusicPlayerInfo, priority);
SAME_FIELD(MP2KPlayerState, cmd, MusicPlayerInfo, cmd);
SAME_FIELD(MP2KPlayerState, checkSongPriority, MusicPlayerInfo, unk_B);
SAME_FIELD(MP2KPlayerState, clock, MusicPlayerInfo, clock);
SAME_FIELD(MP2KPlayerState, padding, MusicPlayerInfo, gap);
SAME_FIELD(MP2KPlayerState, memaccArea, MusicPlayerInfo, memAccArea);
SAME_FIELD(MP2KPlayerState, tempoRawBPM, MusicPlayerInfo, tempoD);
SAME_FIELD(MP2KPlayerState, tempoScale, MusicPlayerInfo, tempoU);
SAME_FIELD(MP2KPlayerState, tempoInterval, MusicPlayerInfo, tempoI);
SAME_FIELD(MP2KPlayerState, tempoCounter, MusicPlayerInfo, tempoC);
SAME_FIELD(MP2KPlayerState, fadeInterval, MusicPlayerInfo, fadeOI);
SAME_FIELD(MP2KPlayerState, fadeCounter, MusicPlayerInfo, fadeOC);
// The port's fade bit fields fill the u16 after fadeCounter, which is our fadeOV. offsetof cannot
// name a bit field, so this holds where fadeOV starts; tracks below holds where it ends.
STATIC_ASSERT(offsetof(struct MusicPlayerInfo, fadeOV) == offsetof(struct MP2KPlayerState, fadeCounter) + sizeof(u16)
              && sizeof(((struct MusicPlayerInfo *)0)->fadeOV) == sizeof(u16),
              IrvWasm_MusicPlayerInfo_fadeOV);
SAME_FIELD(MP2KPlayerState, tracks, MusicPlayerInfo, tracks);
SAME_FIELD(MP2KPlayerState, voicegroup, MusicPlayerInfo, tone);
SAME_FIELD(MP2KPlayerState, lockStatus, MusicPlayerInfo, ident);
SAME_FIELD(MP2KPlayerState, nextPlayerFunc, MusicPlayerInfo, MPlayMainNext);
SAME_FIELD(MP2KPlayerState, nextPlayer, MusicPlayerInfo, musicPlayerNext);

// sound_data.o, assembled for the GBA, sizes gMPlayTrack_* by TRACK_SIZE (0x50).
STATIC_ASSERT(sizeof(struct MP2KTrack) == sizeof(struct MusicPlayerTrack), IrvWasmTrackSize);
STATIC_ASSERT(sizeof(struct MusicPlayerTrack) == 0x50, IrvWasmTrackDataSize);
SAME_FIELD(MP2KTrack, status, MusicPlayerTrack, flags);
SAME_FIELD(MP2KTrack, wait, MusicPlayerTrack, wait);
SAME_FIELD(MP2KTrack, patternLevel, MusicPlayerTrack, patternLevel);
SAME_FIELD(MP2KTrack, repeatCount, MusicPlayerTrack, repN);
SAME_FIELD(MP2KTrack, gateTime, MusicPlayerTrack, gateTime);
SAME_FIELD(MP2KTrack, key, MusicPlayerTrack, key);
SAME_FIELD(MP2KTrack, velocity, MusicPlayerTrack, velocity);
SAME_FIELD(MP2KTrack, runningStatus, MusicPlayerTrack, runningStatus);
SAME_FIELD(MP2KTrack, keyShiftCalculated, MusicPlayerTrack, keyM);
SAME_FIELD(MP2KTrack, pitchCalculated, MusicPlayerTrack, pitM);
SAME_FIELD(MP2KTrack, keyShift, MusicPlayerTrack, keyShift);
SAME_FIELD(MP2KTrack, keyShiftPublic, MusicPlayerTrack, keyShiftX);
SAME_FIELD(MP2KTrack, tune, MusicPlayerTrack, tune);
SAME_FIELD(MP2KTrack, pitchPublic, MusicPlayerTrack, pitX);
SAME_FIELD(MP2KTrack, bend, MusicPlayerTrack, bend);
SAME_FIELD(MP2KTrack, bendRange, MusicPlayerTrack, bendRange);
SAME_FIELD(MP2KTrack, volRightCalculated, MusicPlayerTrack, volMR);
SAME_FIELD(MP2KTrack, volLeftCalculated, MusicPlayerTrack, volML);
SAME_FIELD(MP2KTrack, vol, MusicPlayerTrack, vol);
SAME_FIELD(MP2KTrack, volPublic, MusicPlayerTrack, volX);
SAME_FIELD(MP2KTrack, pan, MusicPlayerTrack, pan);
SAME_FIELD(MP2KTrack, panPublic, MusicPlayerTrack, panX);
SAME_FIELD(MP2KTrack, modCalculated, MusicPlayerTrack, modM);
SAME_FIELD(MP2KTrack, modDepth, MusicPlayerTrack, mod);
SAME_FIELD(MP2KTrack, modType, MusicPlayerTrack, modT);
SAME_FIELD(MP2KTrack, lfoSpeed, MusicPlayerTrack, lfoSpeed);
SAME_FIELD(MP2KTrack, lfoSpeedCounter, MusicPlayerTrack, lfoSpeedC);
SAME_FIELD(MP2KTrack, lfoDelay, MusicPlayerTrack, lfoDelay);
SAME_FIELD(MP2KTrack, lfoDelayCounter, MusicPlayerTrack, lfoDelayC);
SAME_FIELD(MP2KTrack, priority, MusicPlayerTrack, priority);
SAME_FIELD(MP2KTrack, echoVolume, MusicPlayerTrack, pseudoEchoVolume);
SAME_FIELD(MP2KTrack, echoLength, MusicPlayerTrack, pseudoEchoLength);
SAME_FIELD(MP2KTrack, chan, MusicPlayerTrack, chan);
SAME_FIELD(MP2KTrack, instrument, MusicPlayerTrack, tone);
SAME_FIELD(MP2KTrack, gap, MusicPlayerTrack, gap);
SAME_FIELD(MP2KTrack, unk_3A, MusicPlayerTrack, timer);
SAME_FIELD(MP2KTrack, ct, MusicPlayerTrack, unk_3C);
SAME_FIELD(MP2KTrack, cmdPtr, MusicPlayerTrack, cmdPtr);
SAME_FIELD(MP2KTrack, patternStack, MusicPlayerTrack, patternStack);

// The track's instrument, and the voice groups of sound_data.o, which the port reads through it.
STATIC_ASSERT(sizeof(struct MP2KInstrument) == sizeof(struct ToneData), IrvWasmInstrumentSize);
SAME_FIELD(MP2KInstrument, type, ToneData, type);
SAME_FIELD(MP2KInstrument, drumKey, ToneData, key);
SAME_FIELD(MP2KInstrument, cgbLength, ToneData, length);
SAME_FIELD(MP2KInstrument, panSweep, ToneData, pan_sweep);
SAME_FIELD(MP2KInstrument, wav, ToneData, wav);
SAME_FIELD(MP2KInstrument, attack, ToneData, attack);
SAME_FIELD(MP2KInstrument, decay, ToneData, decay);
SAME_FIELD(MP2KInstrument, sustain, ToneData, sustain);
SAME_FIELD(MP2KInstrument, release, ToneData, release);
