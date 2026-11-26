#include "global.h"
#include "battle.h"
#include "battle_gfx_sfx_util.h"
#include "data.h"
#include "m4a.h"
#include "palette.h"
#include "recorded_battle.h"
#include "sound.h"
#include "sprite.h"
#include "string_util.h"
#include "test/replay_test.h"
#include "constants/battle_anim.h"
#include "constants/characters.h"
#include "constants/moves.h"
#include "constants/rgb.h"
#include "constants/songs.h"
#include "constants/trainers.h"

// The end of a replay (#20, #91): the win line starts the victory music, and after END the outro
// empties the text box of an unknown end, shows every hidden mon still out, returns each mon still
// out to its ball, slides the winner's trainer in, holds the scene and fades the screen and the
// music to black. A test sees the outro only after ReplayTest_PlayOutro.

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

// As StartBattle, with the near mon sent out in the red: the send-out starts the low-HP beep
// (HandleLowHpMusicChange at the end of the recorded player's intro).
static void StartBattleNearInRed(void)
{
    PlayBGM(MUS_VS_TRAINER);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 10, REPLAY_STATUS_NONE);
}

static bool32 PlaysSong(u32 song)
{
    return gMPlayInfo_BGM.songHeader == gSongTable[song].header;
}

static const struct Sprite *GetTrainerSlideSprite(u32 side)
{
    return &gSprites[gBattleStruct->trainerSlideSpriteIds[GetBattlerAtPosition(side == REPLAY_SIDE_NEAR ? B_POSITION_PLAYER_LEFT : B_POSITION_OPPONENT_LEFT)]];
}

// Whether the side's trainer stands where the slide ends, as the near back pic or the far front
// pic of trainerPic.
static bool32 HasTrainerSlidIn(u32 side, u32 trainerPic)
{
    const struct Sprite *trainer = GetTrainerSlideSprite(side);

    if (!trainer->inUse)
        return FALSE;
    if (side == REPLAY_SIDE_NEAR)
        return trainer->images == GetTrainerBackPicImage(trainerPic) && trainer->x + trainer->x2 == NEAR_TRAINER_END_X;
    return trainer->oam.affineParam == trainerPic && trainer->x + trainer->x2 == FAR_TRAINER_END_X;
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

// A move can leave a mon hidden at the end: Fly's charge hides its user until its hit (#65). The
// outro shows every hidden mon still out, on both sides, before the first one goes back, as
// SHOW_MON shows it, so the ball takes back a mon the player sees. Headless tests play the charge
// only with animations forced.
REPLAY_TEST("The outro shows a near mon that Fly's charge hid before it returns")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_FLY);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, nearMon); }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(ReplayTest_VisibleAtReturn(REPLAY_SIDE_NEAR));
        EXPECT(ReplayTest_VisibleAtReturn(REPLAY_SIDE_FAR));
    }
}

// A forfeit while the loser's mon is in the air: the loser's mon shows before it goes back too.
REPLAY_TEST("The outro shows a far mon that Fly's charge hid before it returns at a forfeit")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Move(REPLAY_SIDE_FAR, REPLAY_SIDE_NEAR, MOVE_FLY);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, farMon); }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(ReplayTest_VisibleAtReturn(REPLAY_SIDE_FAR));
        EXPECT(ReplayTest_VisibleAtReturn(REPLAY_SIDE_NEAR));
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

// A tie that leaves both mons out, as a tie by the endless battle clause does: both go back, the
// far one first, and no trainer slides in.
REPLAY_TEST("The outro of a tie with both mons out returns both, the far one first, with no trainer")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        SetTrainerPics(TRAINER_PIC_STEVEN, TRAINER_PIC_RED);
        StartBattle();
        ReplayStream_Print(COMPOUND_STRING("The battle ended in a tie!"));
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_PLAYER_MON, nearMon);
    }
    THEN
    {
        EXPECT(!HasTrainerSlidIn(REPLAY_SIDE_NEAR, TRAINER_PIC_STEVEN));
        EXPECT(!HasTrainerSlidIn(REPLAY_SIDE_FAR, TRAINER_PIC_RED));
        EXPECT_EQ((u32)gPaletteFade.y, 16);
        EXPECT(PlaysSong(MUS_VS_TRAINER));
        EXPECT(IsBGMPausedOrStopped());
    }
}

// The probe of the beep tests below: a near mon sent out in the red starts the beep, and nothing
// stops it up to END.
REPLAY_TEST("A near mon sent out in the red starts the low-HP beep")
{
    STREAM
    {
        StartBattleNearInRed();
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    THEN { EXPECT(ReplayTest_PlaysLowHpBeep()); }
}

// The game stops the beep at a win before the victory music (HandleEndTurn_BattleWon), and when it
// leaves a battle (FreeRestoreBattleData). The outro never leaves the battle, so END stops the beep
// itself, for any outcome. The beep is a burst of eight notes that ends by itself (se_low_health),
// so the tests read it on the outro's first frame, the frame after END.
REPLAY_TEST("The outro of a tie stops the low-HP beep")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattleNearInRed();
        ReplayStream_Print(COMPOUND_STRING("The battle ended in a tie!"));
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    THEN { EXPECT(!ReplayTest_LowHpBeepAtOutroStart()); }
}

// A log cut short has no win and no tie line: the backend ends the stream with an END of unknown
// outcome after its last line. The battle counts as a draw, no victory music starts, and the
// outro runs as at a tie.
REPLAY_TEST("The outro of an unknown end returns both mons, the far one first, with no trainer")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        SetTrainerPics(TRAINER_PIC_STEVEN, TRAINER_PIC_RED);
        StartBattle();
        ReplayStream_Turn(2);
        ReplayStream_End(REPLAY_OUTCOME_UNKNOWN);
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_OPPONENT_MON, farMon);
        ANIMATION(ANIM_TYPE_SPECIAL, B_ANIM_SWITCH_OUT_PLAYER_MON, nearMon);
    }
    THEN
    {
        EXPECT_EQ(gBattleOutcome, B_OUTCOME_DREW);
        EXPECT(!HasTrainerSlidIn(REPLAY_SIDE_NEAR, TRAINER_PIC_STEVEN));
        EXPECT(!HasTrainerSlidIn(REPLAY_SIDE_FAR, TRAINER_PIC_RED));
        EXPECT_EQ((u32)gPaletteFade.y, 16);
        EXPECT(PlaysSong(MUS_VS_TRAINER));
        EXPECT(IsBGMPausedOrStopped());
    }
}

// The text box at the outro. A log cut short ends on a battle line that the outro no longer
// explains, such as the weather's damage, so the outro of an unknown end empties the box, as
// FLUSH_TEXT_BOX does. A tie keeps its tie line, as a win keeps its win line.
static bool32 ShowsLine(const u8 *line)
{
    return StringCompare(gDisplayedStringBattle, line) == 0;
}

REPLAY_TEST("The outro of an unknown end clears the last battle line")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Print(COMPOUND_STRING("Dugtrio is buffeted by the sandstorm!"));
        ReplayStream_End(REPLAY_OUTCOME_UNKNOWN);
    }
    SCENE { MESSAGE("Dugtrio is buffeted by the sandstorm!"); }
    THEN { EXPECT_EQ(gDisplayedStringBattle[0], EOS); }
}

REPLAY_TEST("The outro of a tie keeps its tie line")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattle();
        ReplayStream_Print(COMPOUND_STRING("The battle ended in a tie!"));
        ReplayStream_End(REPLAY_OUTCOME_TIE);
    }
    SCENE { MESSAGE("The battle ended in a tie!"); }
    THEN { EXPECT(ShowsLine(COMPOUND_STRING("The battle ended in a tie!"))); }
}

REPLAY_TEST("The outro of an unknown end stops the low-HP beep")
{
    STREAM
    {
        ReplayTest_PlayOutro();
        StartBattleNearInRed();
        ReplayStream_End(REPLAY_OUTCOME_UNKNOWN);
    }
    THEN { EXPECT(!ReplayTest_LowHpBeepAtOutroStart()); }
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
