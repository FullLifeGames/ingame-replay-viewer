#include <string.h>
#include "irv_mp2k.h"

// Our platform layer (#43): one frame of one music player, the tick and the tempo (MP2K spec
// section 4), and the two helpers the game calls besides (section 1). The section that each
// rule comes from is named above it.

#define TICK_TEMPO       150
#define START_TRACK_SIZE 0x40

// MP2K spec 1: the high 32 bits of the unsigned 64-bit product (MidiKeyToFreq's arithmetic).
uint32_t umul3232H32(uint32_t multiplier, uint32_t multiplicand)
{
    return ((uint64_t)multiplier * multiplicand) >> 32;
}

// MP2K spec 1 and R1: the 36 entries of the game's gMPlayJumpTableTemplate, read without an
// address guard.
void MPlayJumpTableCopy(uint32_t *table)
{
    memcpy(table, gMPlayJumpTableTemplate, IRV_SOUND_JUMP_ENTRIES * sizeof(uint32_t));
}

// MP2K spec 4.3 step 2: an on channel's gate counts down once per tick and STOP comes at 0; a
// gate of 0 is a tie and never counts. An off channel leaves the chain.
static void CountGates(struct IrvSoundTrack *track)
{
    struct IrvSoundChannel *chan = IrvSound_Ptr(track->chan);

    while (chan != NULL)
    {
        struct IrvSoundChannel *next = IrvSound_Ptr(chan->nextChannel);

        if (!(chan->statusFlags & IRV_CHANNEL_ON))
            RealClearChain(chan);
        else if (chan->gateTime != 0 && --chan->gateTime == 0)
            chan->statusFlags |= IRV_CHANNEL_STOP;
        chan = next;
    }
}

// MP2K spec 4.3 step 3: a track that MPlayStart marked starts from its defaults; the bytes from
// cmdPtr on stay.
static void StartTrack(struct IrvSoundTrack *track)
{
    memset(track, 0, START_TRACK_SIZE);
    track->flags = IRV_TRACK_EXIST;
    track->bendRange = 2;
    track->volX = 64;
    track->lfoSpeed = 22;
    track->tone.type = 1;
}

// MP2K spec 2.6: one command. A byte below 0x80 repeats the running status with itself as the
// first argument; a byte from 0xBD on becomes the running status. Returns false once a command
// ended the track.
static bool RunCommand(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    struct IrvSoundInfo *info = IrvSound_Info();
    uint8_t cmd = IrvSound_PeekByte(track);

    if (cmd < 0x80)
    {
        cmd = track->runningStatus;
    }
    else
    {
        track->cmdPtr++;
        if (cmd >= 0xBD)
            track->runningStatus = cmd;
    }

    if (cmd >= 0xCF)
    {
        IRV_SOUND_CALL(IrvSoundNoteFunc, info->plynote)(cmd - 0xCF, player, track);
    }
    else if (cmd >= 0xB1)
    {
        uint32_t *table = IrvSound_Ptr(info->MPlayJumpTable);

        player->cmd = cmd - 0xB1;
        IRV_SOUND_CALL(IrvSoundCommandFunc, table[player->cmd])(player, track);
        return track->flags != 0;
    }
    else if (cmd >= 0x80)
    {
        track->wait = gClockTable[cmd - 0x80];
    }
    else
    {
        // A data byte before any running status. The engine reads a wait from the byte 128 before
        // gClockTable and stalls or hangs on that byte (spec 12.2), and no song reaches it. Our
        // deviation (S4-8): the track ends as at FINE.
        ply_fine(player, track);
        return false;
    }
    return true;
}

// MP2K spec 4.3 step 6: the LFO steps once per tick after its delay. Its phase runs a triangle
// 0..63, 64..-63, -64..-1; the output is mod * triangle / 64.
static void StepLfo(struct IrvSoundTrack *track)
{
    uint8_t phase;
    int32_t triangle;
    int8_t value;

    if (track->lfoSpeed == 0 || track->mod == 0)
        return;
    if (track->lfoDelayC != 0)
    {
        track->lfoDelayC--;
        return;
    }
    track->lfoSpeedC += track->lfoSpeed;
    phase = track->lfoSpeedC;
    triangle = (phase < 64 || phase >= 192) ? (int8_t)phase : 128 - phase;
    value = (track->mod * triangle) >> 6;
    if (value != track->modM)
    {
        track->modM = value;
        track->flags |= track->modT == 0 ? IRV_TRACK_PITCH_CHANGE : IRV_TRACK_VOLUME_CHANGE;
    }
}

// MP2K spec 4.3 steps 2-6 for one live track.
static void TickTrack(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    CountGates(track);
    if (track->flags & IRV_TRACK_START)
        StartTrack(track);
    while (track->wait == 0)
    {
        if (!RunCommand(player, track))
            return;
    }
    track->wait--;
    StepLfo(track);
}

// MP2K spec 4.3: one tick of every track. The tracks alive at its start become the player's
// status; with none the player stops. Returns false then.
static bool Tick(struct IrvSoundPlayer *player)
{
    struct IrvSoundTrack *tracks = IrvSound_Ptr(player->tracks);
    uint32_t alive = 0;
    uint32_t i;

    for (i = 0; i < player->trackCount; i++)
    {
        if (!(tracks[i].flags & IRV_TRACK_EXIST))
            continue;
        alive |= 1u << i;
        TickTrack(player, &tracks[i]);
    }
    player->clock++;
    if (alive == 0)
    {
        player->status = IRV_PLAYER_PAUSE;
        return false;
    }
    player->status = alive;
    return true;
}

// MP2K spec 4.4: a track's pending volume and pitch changes reach its channels once per frame.
static void UpdateTrack(struct IrvSoundPlayer *player, struct IrvSoundTrack *track)
{
    struct IrvSoundChannel *chan;

    TrkVolPitSet(player, track);
    chan = IrvSound_Ptr(track->chan);
    while (chan != NULL)
    {
        struct IrvSoundChannel *next = IrvSound_Ptr(chan->nextChannel);
        bool psg = chan->type & IRV_VOICE_PSG;

        if (!(chan->statusFlags & IRV_CHANNEL_ON))
        {
            RealClearChain(chan);
            chan = next;
            continue;
        }
        if (track->flags & IRV_TRACK_VOLUME_CHANGE)
        {
            IrvSound_SetChannelVolume(chan, track);
            if (psg)
                chan->modify |= IRV_PSG_MODIFY_VOLUME;
        }
        if (track->flags & IRV_TRACK_PITCH_CHANGE)
        {
            chan->frequency = IrvSound_ChannelFrequency(chan, track);
            if (psg)
                chan->modify |= IRV_PSG_MODIFY_PITCH;
        }
        chan = next;
    }
    track->flags &= ~IRV_TRACK_PENDING;
}

// MP2K spec 4.2 steps 2-6.
static void PlayerFrame(struct IrvSoundPlayer *player)
{
    struct IrvSoundTrack *tracks;
    uint32_t i;

    FadeOutBody(player);
    if (player->status & IRV_PLAYER_PAUSE)
        return;
    player->tempoC += player->tempoI;
    while (player->tempoC >= TICK_TEMPO)
    {
        if (!Tick(player))
            return;
        player->tempoC -= TICK_TEMPO;
    }
    tracks = IrvSound_Ptr(player->tracks);
    for (i = 0; i < player->trackCount; i++)
    {
        if ((tracks[i].flags & IRV_TRACK_EXIST) && (tracks[i].flags & IRV_TRACK_PENDING))
            UpdateTrack(player, &tracks[i]);
    }
}

// MP2K spec 4.1 and 4.2: one frame of one player. It takes its lock (R2), lets the player opened
// before it work first, then works itself unless it is paused.
void MPlayMain(struct IrvSoundPlayer *player)
{
    if (player->ident != IRV_SOUND_ID)
        return;
    player->ident++;
    if (player->MPlayMainNext != 0)
        IRV_SOUND_CALL(IrvSoundPlayerFunc, player->MPlayMainNext)(IrvSound_Ptr(player->musicPlayerNext));
    if (!(player->status & IRV_PLAYER_PAUSE))
        PlayerFrame(player);
    player->ident = IRV_SOUND_ID;
}
