#include "irv_mp2k.h"

// Our platform layer (#43): a note on (MP2K spec section 5): its arguments and gate, the voice
// it plays, the channel it takes and how that channel starts; and the channel's volumes and
// pitch from its track, which the frame's update pass shares (section 4.4).

#define PSG_SWEEP_OFF 8

// What a note plays: MP2K spec 5.3.
struct Note
{
    const struct IrvSoundVoice *voice;
    uint8_t key;
    int8_t rhythmPan;
    uint8_t priority;
};

// MP2K spec 5.4.
void IrvSound_SetChannelVolume(struct IrvSoundChannel *chan, const struct IrvSoundTrack *track)
{
    int32_t pan = (int8_t)chan->rhythmPan;
    uint32_t right = chan->velocity * (128 + pan) * track->volMR >> 14;
    uint32_t left = chan->velocity * (127 - pan) * track->volML >> 14;

    chan->rightVolume = right > 255 ? 255 : right;
    chan->leftVolume = left > 255 ? 255 : left;
}

// MP2K spec 4.4 step 2 and 5.6 step 6: the channel's key moved by the track's key offset, never
// below 0, through the game's MidiKeyToCgbFreq or MidiKeyToFreq.
uint32_t IrvSound_ChannelFrequency(const struct IrvSoundChannel *chan, const struct IrvSoundTrack *track)
{
    int32_t key = chan->key + track->keyM;
    uint8_t psg = chan->type & IRV_VOICE_PSG;

    if (key < 0)
        key = 0;
    if (psg)
        return IRV_SOUND_CALL(IrvSoundCgbFreqFunc, IrvSound_Info()->MidiKeyToCgbFreq)(psg, key, track->pitM);
    return MidiKeyToFreq(IrvSound_Ptr(chan->wave), key, track->pitM);
}

// MP2K spec 5.1: the gate from the command, then up to three argument bytes below 0x80: the key,
// the velocity and an extra gate. The first byte from 0x80 on stays for the next command.
static void ReadArguments(uint32_t note, struct IrvSoundTrack *track)
{
    track->gateTime = gClockTable[note];
    if (IrvSound_PeekByte(track) >= 0x80)
        return;
    track->key = IrvSound_ReadByte(track);
    if (IrvSound_PeekByte(track) >= 0x80)
        return;
    track->velocity = IrvSound_ReadByte(track);
    if (IrvSound_PeekByte(track) >= 0x80)
        return;
    track->gateTime += IrvSound_ReadByte(track);
}

// MP2K spec 5.3: a key split picks its sub voice through the key-split table, a drum kit by the
// key and plays the sub voice's own key and pan. A sub voice that splits again drops the note.
static bool ChooseVoice(const struct IrvSoundTrack *track, struct Note *note)
{
    const struct IrvSoundVoice *voice = &track->tone;
    const struct IrvSoundVoice *group = IrvSound_Ptr(voice->wave);

    note->voice = voice;
    note->key = track->key;
    note->rhythmPan = 0;
    if (voice->type & IRV_VOICE_SPLIT)
    {
        const uint8_t *split = IrvSound_Ptr(IrvSound_Word(&voice->attack));

        note->voice = &group[split[track->key]];
    }
    else if (voice->type & IRV_VOICE_DRUMS)
    {
        note->voice = &group[track->key];
        note->key = note->voice->key;
        if (note->voice->panSweep & 0x80)
            note->rhythmPan = (note->voice->panSweep - 0xC0) * 2;
    }
    return !(note->voice->type & (IRV_VOICE_SPLIT | IRV_VOICE_DRUMS));
}

// MP2K spec 5.5: a channel gives way to a note of higher priority, or of the same priority from a
// track at the same or a lower address. Addresses compare unsigned.
static bool GivesWay(const struct IrvSoundChannel *chan, uint8_t priority, uint32_t track)
{
    return chan->priority < priority || (chan->priority == priority && chan->track >= track);
}

// MP2K spec 5.5, PSG: the voice's own channel, when it is off, releasing or gives way.
static struct IrvSoundChannel *ChoosePsgChannel(const struct Note *note, uint32_t track)
{
    struct IrvSoundInfo *info = IrvSound_Info();
    struct IrvSoundChannel *chan;

    if (info->cgbChans == 0)
        return NULL;
    chan = (struct IrvSoundChannel *)IrvSound_Ptr(info->cgbChans) + (note->voice->type & IRV_VOICE_PSG) - 1;
    if (!(chan->statusFlags & IRV_CHANNEL_ON) || (chan->statusFlags & IRV_CHANNEL_STOP)
        || GivesWay(chan, note->priority, track))
        return chan;
    return NULL;
}

// MP2K spec 5.5, DirectSound: the first off channel wins. Else the releasing channels compete,
// the first of them whatever its priority; playing channels compete only while no releasing one
// has been seen. The scan covers maxChans channels (12.3 c).
static struct IrvSoundChannel *ChoosePcmChannel(const struct Note *note, uint32_t track)
{
    struct IrvSoundInfo *info = IrvSound_Info();
    struct IrvSoundChannel *best = NULL;
    uint8_t priority = note->priority;
    bool releasing = false;
    uint32_t count = IrvSound_PcmChannels(info);
    uint32_t i;

    for (i = 0; i < count; i++)
    {
        struct IrvSoundChannel *chan = &info->chans[i];
        bool stopping = chan->statusFlags & IRV_CHANNEL_STOP;

        if (!(chan->statusFlags & IRV_CHANNEL_ON))
            return chan;
        if ((stopping && !releasing) || (stopping == releasing && GivesWay(chan, priority, track)))
        {
            best = chan;
            priority = chan->priority;
            track = chan->track;
            releasing = stopping;
        }
    }
    return best;
}

// MP2K spec 5.6 step 1: the channel leaves its old track's chain and heads this one's.
// The spec lists the channel's own links; the old head's prev pointing back to the channel is
// ours, so that RealClearChain (5.7) finds a whole chain.
static void LinkChannel(struct IrvSoundChannel *chan, struct IrvSoundTrack *track)
{
    struct IrvSoundChannel *head;

    RealClearChain(chan);
    head = IrvSound_Ptr(track->chan);
    chan->prevChannel = 0;
    chan->nextChannel = track->chan;
    if (head != NULL)
        head->prevChannel = IrvSound_Address(chan);
    track->chan = IrvSound_Address(chan);
    chan->track = IrvSound_Address(track);
}

// MP2K spec 5.6 steps 4 and 6: what the channel takes from the track and the voice.
static void CopyNote(struct IrvSoundChannel *chan, const struct Note *note, const struct IrvSoundTrack *track)
{
    const struct IrvSoundVoice *voice = note->voice;

    chan->gateTime = track->gateTime;
    chan->midiKey = track->key;
    chan->velocity = track->velocity;
    chan->priority = note->priority;
    chan->key = note->key;
    chan->rhythmPan = note->rhythmPan;
    chan->type = voice->type;
    chan->wave = voice->wave;
    chan->attack = voice->attack;
    chan->decay = voice->decay;
    chan->sustain = voice->sustain;
    chan->release = voice->release;
    chan->pseudoEchoVolume = track->pseudoEchoVolume;
    chan->pseudoEchoLength = track->pseudoEchoLength;
    if (voice->type & IRV_VOICE_PSG)
    {
        chan->length = voice->length;
        chan->sweep = (!(voice->panSweep & 0x80) && (voice->panSweep & 0x70)) ? voice->panSweep : PSG_SWEEP_OFF;
    }
    else
    {
        chan->count = track->startOffset;
    }
}

// MP2K spec 5.6.
static void StartChannel(struct IrvSoundChannel *chan, const struct Note *note,
                         struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    LinkChannel(chan, track);
    track->lfoDelayC = track->lfoDelay;
    if (track->lfoDelay != 0)
        IrvSound_ClearLfo(track);
    TrkVolPitSet(player, track);
    CopyNote(chan, note, track);
    IrvSound_SetChannelVolume(chan, track);
    chan->frequency = IrvSound_ChannelFrequency(chan, track);
    chan->statusFlags = IRV_CHANNEL_START;
    track->flags &= ~IRV_TRACK_PENDING;
}

// MP2K spec 5: `note` is the command byte minus 0xCF, 0 for TIE.
void ply_note(uint32_t note, struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    struct Note chosen;
    struct IrvSoundChannel *chan;
    uint32_t priority;

    ReadArguments(note, track);
    if (!ChooseVoice(track, &chosen))
        return;
    priority = player->priority + track->priority;
    chosen.priority = priority > 255 ? 255 : priority;
    if (chosen.voice->type & IRV_VOICE_PSG)
        chan = ChoosePsgChannel(&chosen, IrvSound_Address(track));
    else
        chan = ChoosePcmChannel(&chosen, IrvSound_Address(track));
    if (chan != NULL)
        StartChannel(chan, &chosen, player, track);
}
