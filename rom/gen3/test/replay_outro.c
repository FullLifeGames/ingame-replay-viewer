#include "global.h"
#include "battle.h"
#include "battle_gfx_sfx_util.h"
#include "data.h"
#include "m4a.h"
#include "palette.h"
#include "recorded_battle.h"
#include "sound.h"
#include "sprite.h"
#include "test/replay_test.h"
#include "constants/battle_anim.h"
#include "constants/rgb.h"
#include "constants/songs.h"
#include "constants/trainers.h"

// The end of a replay (#20): the win line starts the victory music, and after END the outro
// returns every mon still out to its ball, slides the winner's trainer in, holds the scene and
// fades the screen and the music to black. A test sees the outro only after ReplayTest_PlayOutro.

// Where BtlController_HandleTrainerSlide puts each side's trainer once the slide has ended: the
// near back pic at x 80, the far front pic at x 176 + 32.
#define NEAR_TRAINER_END_X 80
#define FAR_TRAINER_END_X  208

static void SetTrainerPics(u32 nearPic, u32 farPic)
{
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_NEAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, nearPic);
    ReplayStream_SetU16(ReplayStream_TrainerOffset(REPLAY_SIDE_FAR) + REPLAY_TRAINER_OFFSET_TRAINER_PIC, farPic);
}

// The battle music plays from the start, as CB2_ReplayBoot plays it.
static void StartBattle(void)
{
    PlayBGM(MUS_VS_TRAINER);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
}

static bool32 PlaysSong(u32 song)
{
    return gMPlayInfo_BGM.songHeader == gSongTable[song].header;
}

static const struct Sprite *GetTrainerSlideSprite(u32 side)
{
    return &gSprites[gBattleStruct->trainerSlideSpriteIds[GetBattlerAtPosition(side == REPLAY_SIDE_NEAR ? B_POSITION_PLAYER_LEFT : B_POSITION_OPPONENT_LEFT)]];
}

REPLAY_TEST("The win line before END of a near win starts the victory music")
{
    STREAM
    {
        PlayBGM(MUS_VS_TRAINER);
        ReplayStream_Print(COMPOUND_STRING("Brendan won the battle!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN { EXPECT(PlaysSong(MUS_VICTORY_TRAINER)); }
}

REPLAY_TEST("The win line before END of a far win starts the victory music")
{
    STREAM
    {
        PlayBGM(MUS_VS_TRAINER);
        ReplayStream_Print(COMPOUND_STRING("May won the battle!"));
        ReplayStream_End(REPLAY_OUTCOME_FAR_WON);
    }
    THEN { EXPECT(PlaysSong(MUS_VICTORY_TRAINER)); }
}

REPLAY_TEST("The last line before END of a tie keeps the battle music")
{
    STREAM
    {
        PlayBGM(MUS_VS_TRAINER);
        ReplayStream_Print(COMPOUND_STRING("The battle ended in a tie!"));
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    THEN { EXPECT(PlaysSong(MUS_VS_TRAINER)); }
}

REPLAY_TEST("A line before a later instruction keeps the battle music")
{
    STREAM
    {
        PlayBGM(MUS_VS_TRAINER);
        ReplayStream_Print(COMPOUND_STRING("Turn 2!"));
        ReplayStream_Turn(2);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN { EXPECT(PlaysSong(MUS_VS_TRAINER)); }
}

REPLAY_TEST("The outro of a far win returns the far mon and slides the far trainer in")
{
    u32 farBattler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        ReplayTest_PlayOutro();
        SetTrainerPics(TRAINER_PIC_BRENDAN, TRAINER_PIC_RED);
        StartBattle();
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_NEAR);
        ReplayStream_End(REPLAY_OUTCOME_FAR_WON);
    }
    SCENE
    {
        HP_BAR(nearMon, hp: 0);
        NOT ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_PLAYER_MON, nearMon);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
    }
    THEN
    {
        const struct Sprite *trainer = GetTrainerSlideSprite(REPLAY_SIDE_FAR);

        EXPECT(gSprites[gHealthboxSpriteIds[farBattler]].invisible);
        EXPECT(trainer->inUse);
        EXPECT_EQ(trainer->oam.affineParam, TRAINER_PIC_RED);
        EXPECT_EQ(trainer->x + trainer->x2, FAR_TRAINER_END_X);
        EXPECT(trainer->callback == SpriteCallbackDummy);
    }
}

REPLAY_TEST("The outro of a near win slides the near trainer's back pic in")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        SetTrainerPics(TRAINER_PIC_STEVEN, TRAINER_PIC_MAY);
        StartBattle();
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        HP_BAR(farMon, hp: 0);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_PLAYER_MON, nearMon);
    }
    THEN
    {
        const struct Sprite *trainer = GetTrainerSlideSprite(REPLAY_SIDE_NEAR);

        EXPECT(trainer->inUse);
        EXPECT(trainer->images == GetTrainerBackPicImage(TRAINER_PIC_STEVEN));
        EXPECT_EQ(trainer->x + trainer->x2, NEAR_TRAINER_END_X);
        EXPECT(trainer->callback == SpriteCallbackDummy);
    }
}

// A forfeit leaves the loser's mon out: the loser's mon goes back first, the winner's last.
REPLAY_TEST("A forfeit returns both mons before the slide, the loser's first")
{
    u32 nearBattler = GetBattlerAtPosition(B_POSITION_PLAYER_LEFT);
    u32 farBattler = GetBattlerAtPosition(B_POSITION_OPPONENT_LEFT);

    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_PLAYER_MON, nearMon);
    }
    THEN
    {
        EXPECT(gSprites[gHealthboxSpriteIds[nearBattler]].invisible);
        EXPECT(gSprites[gHealthboxSpriteIds[farBattler]].invisible);
        EXPECT_EQ(GetTrainerSlideSprite(REPLAY_SIDE_NEAR)->x + GetTrainerSlideSprite(REPLAY_SIDE_NEAR)->x2, NEAR_TRAINER_END_X);
    }
}

REPLAY_TEST("The outro fades the screen and the music to black")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Print(COMPOUND_STRING("Brendan won the battle!"));
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT(!gPaletteFade.active);
        EXPECT_EQ((u32)gPaletteFade.y, 16);
        EXPECT_EQ((u32)gPaletteFade.blendColor, RGB_BLACK);
        EXPECT(PlaysSong(MUS_VICTORY_TRAINER));
        EXPECT(IsBGMPausedOrStopped());
    }
}

REPLAY_TEST("The outro of a tie fades out with no trainer and keeps the battle music")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Hp(REPLAY_SIDE_FAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_FAR);
        ReplayStream_Hp(REPLAY_SIDE_NEAR, 0);
        ReplayStream_Faint(REPLAY_SIDE_NEAR);
        ReplayStream_Print(COMPOUND_STRING("The battle ended in a tie!"));
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    SCENE
    {
        HP_BAR(farMon, hp: 0);
        HP_BAR(nearMon, hp: 0);
        NONE_OF
        {
            ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_PLAYER_MON, nearMon);
            ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
        }
    }
    THEN
    {
        EXPECT(!gPaletteFade.active);
        EXPECT_EQ((u32)gPaletteFade.y, 16);
        EXPECT(PlaysSong(MUS_VS_TRAINER));
        EXPECT(IsBGMPausedOrStopped());
    }
}

// The outro runs after END: the progress says done and finished on the frame after END, as the
// page and the screenshot tool read it.
REPLAY_TEST("END counts as done and finished before the outro starts")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_End(REPLAY_OUTCOME_FAR_WON);
    }
    THEN
    {
        const struct ReplayProgress *atOutro = ReplayTest_ProgressAtOutroStart();

        EXPECT_EQ(atOutro->total, 4);
        EXPECT_EQ(atOutro->done, 4);
        EXPECT(atOutro->finished);
    }
}

// A recorded battle leaves on a held B while RecordedBattle_CanStopPlayback() says so
// (BattleMainCB2). After END the outro plays out and the screen holds, as with no press.
REPLAY_TEST("B cannot leave the replay after END")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN { EXPECT(!RecordedBattle_CanStopPlayback()); }
}
