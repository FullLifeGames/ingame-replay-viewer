#include "irv_mp2k.h"

// Our platform layer (#43): the track commands of the game's jump table (MP2K spec section 3)
// and the two ways to take channels from a track (section 5.7). Each command runs with cmdPtr
// past its command byte and reads its arguments from there.

#define PATTERN_LEVELS 3
#define PSG_REGISTERS  0x60

// MP2K spec 3, "Clearing the LFO".
void IrvSound_ClearLfo(struct IrvSoundTrack *track)
{
    track->modM = 0;
    track->lfoSpeedC = 0;
    track->flags |= track->modT == 0 ? IRV_TRACK_PITCH_CHANGE : IRV_TRACK_VOLUME_CHANGE;
}

// MP2K spec 5.7: unlinks the channel from its track's chain. The channel keeps its own links.
void RealClearChain(void *pointer)
{
    struct IrvSoundChannel *chan = pointer;
    struct IrvSoundTrack *track = IrvSound_Ptr(chan->track);
    struct IrvSoundChannel *prev;
    struct IrvSoundChannel *next;

    if (track == NULL)
        return;
    prev = IrvSound_Ptr(chan->prevChannel);
    next = IrvSound_Ptr(chan->nextChannel);
    if (prev != NULL)
        prev->nextChannel = chan->nextChannel;
    else
        track->chan = chan->nextChannel;
    if (next != NULL)
        next->prevChannel = chan->prevChannel;
    chan->track = 0;
}

// MP2K spec 5.7: silences the track's channels at once, without a release; the game's CgbOscOff
// turns a PSG channel off. The track's flags stay.
void TrackStop(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    struct IrvSoundInfo *info = IrvSound_Info();
    struct IrvSoundChannel *chan;

    (void)player;
    if (!(track->flags & IRV_TRACK_EXIST))
        return;
    for (chan = IrvSound_Ptr(track->chan); chan != NULL; chan = IrvSound_Ptr(chan->nextChannel))
    {
        if (chan->statusFlags != 0)
        {
            if (chan->type & IRV_VOICE_PSG)
                IRV_SOUND_CALL(IrvSoundOscOffFunc, info->CgbOscOff)(chan->type & IRV_VOICE_PSG);
            chan->statusFlags = 0;
        }
        chan->track = 0;
    }
    track->chan = 0;
}

// MP2K spec 3, FINE: the track's sounding channels release and leave its chain; the track ends.
void ply_fine(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    struct IrvSoundChannel *chan = IrvSound_Ptr(track->chan);

    (void)player;
    while (chan != NULL)
    {
        struct IrvSoundChannel *next = IrvSound_Ptr(chan->nextChannel);

        if (chan->statusFlags & IRV_CHANNEL_ON)
            chan->statusFlags |= IRV_CHANNEL_STOP;
        RealClearChain(chan);
        chan = next;
    }
    track->flags = 0;
}

// MP2K spec 3, GOTO.
void ply_goto(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->cmdPtr = IrvSound_Word(IRV_PTR(track->cmdPtr));
}

// MP2K spec 3, PATT: three levels of patterns; a fourth ends the track as FINE does.
void ply_patt(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    if (track->patternLevel >= PATTERN_LEVELS)
    {
        ply_fine(player, track);
        return;
    }
    track->patternStack[track->patternLevel++] = track->cmdPtr + 4;
    ply_goto(player, track);
}

// MP2K spec 3, PEND.
void ply_pend(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    if (track->patternLevel > 0)
        track->cmdPtr = track->patternStack[--track->patternLevel];
}

// MP2K spec 3, REPT: a count of n plays the passage n times, a count of 0 for ever.
void ply_rept(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    uint8_t count = IrvSound_ReadByte(track);

    if (count != 0 && ++track->repN >= count)
    {
        track->repN = 0;
        track->cmdPtr += 4;
        return;
    }
    ply_goto(player, track);
}

// MP2K spec 3, PRIO.
void ply_prio(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->priority = IrvSound_ReadByte(track);
}

// MP2K spec 3, TEMPO: the argument is half the tempo in BPM.
void ply_tempo(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    player->tempoD = IrvSound_ReadByte(track) * 2;
    player->tempoI = (player->tempoD * player->tempoU) >> 8;
}

// MP2K spec 3, KEYSH.
void ply_keysh(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->keyShift = IrvSound_ReadByte(track);
    track->flags |= IRV_TRACK_PITCH_CHANGE;
}

// MP2K spec 3, VOICE: a copy of the song's voice n.
void ply_voice(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    const struct IrvSoundVoice *voices = IrvSound_Ptr(player->tone);

    track->tone = voices[IrvSound_ReadByte(track)];
}

// MP2K spec 3, VOL.
void ply_vol(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->vol = IrvSound_ReadByte(track);
    track->flags |= IRV_TRACK_VOLUME_CHANGE;
}

// MP2K spec 3, PAN: 64 is the centre.
void ply_pan(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->pan = IrvSound_ReadByte(track) - 64;
    track->flags |= IRV_TRACK_VOLUME_CHANGE;
}

// MP2K spec 3, BEND: 64 is the centre.
void ply_bend(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->bend = IrvSound_ReadByte(track) - 64;
    track->flags |= IRV_TRACK_PITCH_CHANGE;
}

// MP2K spec 3, BENDR.
void ply_bendr(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->bendRange = IrvSound_ReadByte(track);
    track->flags |= IRV_TRACK_PITCH_CHANGE;
}

// MP2K spec 3, LFOS: a speed of 0 clears the LFO.
void ply_lfos(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->lfoSpeed = IrvSound_ReadByte(track);
    if (track->lfoSpeed == 0)
        IrvSound_ClearLfo(track);
}

// MP2K spec 3, LFODL: no flag; the next note takes the delay (5.6).
void ply_lfodl(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->lfoDelay = IrvSound_ReadByte(track);
}

// MP2K spec 3, MOD: a depth of 0 clears the LFO.
void ply_mod(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->mod = IrvSound_ReadByte(track);
    if (track->mod == 0)
        IrvSound_ClearLfo(track);
}

// MP2K spec 3, MODT: only a new target marks both changes.
void ply_modt(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    uint8_t target = IrvSound_ReadByte(track);

    (void)player;
    if (target != track->modT)
    {
        track->modT = target;
        track->flags |= IRV_TRACK_VOLUME_CHANGE | IRV_TRACK_PITCH_CHANGE;
    }
}

// MP2K spec 3, TUNE: 64 is the centre.
void ply_tune(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    (void)player;
    track->tune = IrvSound_ReadByte(track) - 64;
    track->flags |= IRV_TRACK_PITCH_CHANGE;
}

// MP2K spec 3, PORT: a byte into the sound registers from 0x04000060 on (GBATEK "GBA I/O Map").
void ply_port(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    uint8_t offset = IrvSound_ReadByte(track);

    (void)player;
    IRV_IO8(PSG_REGISTERS + offset) = IrvSound_ReadByte(track);
}

// MP2K spec 3, EOT: an optional key, then STOP for the first channel of that key that is
// starting or in an envelope phase and not yet stopping.
void ply_endtie(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    struct IrvSoundChannel *chan;

    (void)player;
    if (IrvSound_PeekByte(track) < 0x80)
        track->key = IrvSound_ReadByte(track);
    for (chan = IrvSound_Ptr(track->chan); chan != NULL; chan = IrvSound_Ptr(chan->nextChannel))
    {
        if ((chan->statusFlags & (IRV_CHANNEL_START | IRV_CHANNEL_PHASE))
            && !(chan->statusFlags & IRV_CHANNEL_STOP)
            && chan->midiKey == track->key)
        {
            chan->statusFlags |= IRV_CHANNEL_STOP;
            return;
        }
    }
}
