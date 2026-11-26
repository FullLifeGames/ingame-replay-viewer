#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "battle_gfx_sfx_util.h"
#include "battle_util.h"
#include "palette.h"
#include "replay_interpreter.h"
#include "replay_ops.h"
#include "replay_stream.h"
#include "sound.h"
#include "constants/rgb.h"
#include "constants/songs.h"
#include "constants/trainers.h"

// The end of a replay (#20, #91). The win line starts the victory music, and after END the outro
// runs as gBattleMainFunc: every mon still out goes back into its ball, the loser's first, the
// winner's trainer slides in, the scene holds for two seconds, and the screen and the music fade to
// black. A tie or an unknown end has no winner: no trainer slides in, and the battle music plays on
// until the fade. END stops the low-HP beep for every outcome. An unknown end, a log cut short,
// empties the text box, while a tie keeps its tie line as a win keeps its win line. A mon that a
// move left hidden shows again before the first mon goes back. END has counted as done and
// finished before the outro starts, so every reader of gReplayProgress sees the end on the same
// frame as before.

// Two seconds at 60 frames a second.
#define OUTRO_HOLD_FRAMES 120
// BeginNormalPaletteFade moves 2 of 16 steps every delay + 1 frames: 8 steps of 9 frames.
#define OUTRO_FADE_DELAY 8
// FadeOutBGM lowers the volume in 16 steps of this many frames: the music is silent after 64
// frames, before the screen is black after 72.
#define OUTRO_MUSIC_FADE_SPEED 4

struct ReplayOutro
{
    u16 wait;
    u8 step;
    u8 outcome;   // REPLAY_OUTCOME_*
    u8 sidesOut;  // a bit for each REPLAY_SIDE_* whose battler is out
};

// Each step runs once no controller is busy and no wait runs, and returns TRUE when it is done.
typedef bool32 (*ReplayOutroStep)(void);

static bool32 Outro_ReturnLoser(void);
static bool32 Outro_ReturnWinner(void);
static bool32 Outro_SlideWinnerIn(void);
static bool32 Outro_Hold(void);
static bool32 Outro_Fade(void);
static bool32 Outro_End(void);
static void Replay_Outro(void);

static EWRAM_DATA struct ReplayOutro sOutro = {0};

static const ReplayOutroStep sOutroSteps[] =
{
    Outro_ReturnLoser,
    Outro_ReturnWinner,
    Outro_SlideWinnerIn,
    Outro_Hold,
    Outro_Fade,
    Outro_End,
};

static bool32 HasWinner(u32 outcome)
{
    return outcome == REPLAY_OUTCOME_NEAR_WON || outcome == REPLAY_OUTCOME_FAR_WON;
}

// The side that won and the side that lost. With no winner the far mon goes back first.
static u32 GetWinnerSide(void)
{
    return (sOutro.outcome == REPLAY_OUTCOME_FAR_WON) ? REPLAY_SIDE_FAR : REPLAY_SIDE_NEAR;
}

static u32 GetLoserSide(void)
{
    return (sOutro.outcome == REPLAY_OUTCOME_FAR_WON) ? REPLAY_SIDE_NEAR : REPLAY_SIDE_FAR;
}

// As HandleEndTurn_BattleWon starts the victory music before the battle script prints the end text
// (src/battle_main.c), for a win of either side: the viewer takes no side.
void Replay_StartVictoryMusic(u32 outcome)
{
    if (!HasWinner(outcome))
        return;
    BattleStopLowHpSound();
    PlayBGM(MUS_VICTORY_TRAINER);
}

// Fly, Dig, Dive and Bounce hide their user on the charge turn, and a log can end before the hit:
// a forfeit, or a foe's Explosion that ends the battle. Every mon still out that is hidden shows
// again with no animation, as SHOW_MON shows it (Replay_OpShowMon), so the ball takes back a mon
// the player sees. A visible mon gets no command, so an outro with no hidden mon plays on the same
// frames as before.
static void ShowHiddenMons(void)
{
    u32 side;

    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
    {
        u32 battler = Replay_GetBattler(side);

        if (!(sOutro.sidesOut & (1u << side)) || !gSprites[gBattlerSpriteIds[battler]].invisible)
            continue;
        BtlController_EmitSpriteInvisibility(battler, B_COMM_TO_CONTROLLER, FALSE);
        MarkBattlerForControllerExec(battler);
    }
}

// The game stops the low-HP beep at a win before the victory music (HandleEndTurn_BattleWon), and
// at any end once it leaves the battle (FreeRestoreBattleData). The outro never leaves the battle,
// so END stops the beep for every outcome, as a win's line did already. The last line of a log cut
// short belongs to a battle that goes on, so the box empties as FLUSH_TEXT_BOX empties it. The
// hidden mons show on END's frame, and the outro's first step waits for the controllers.
void Replay_StartOutro(u32 outcome, u32 sidesOut)
{
    BattleStopLowHpSound();
    memset(&sOutro, 0, sizeof(sOutro));
    sOutro.outcome = outcome;
    sOutro.sidesOut = sidesOut;
    if (outcome == REPLAY_OUTCOME_UNKNOWN)
        Replay_FlushTextBox();
    ShowHiddenMons();
    gBattleMainFunc = Replay_Outro;
}

// The step never leaves sOutroSteps: Outro_End hands gBattleMainFunc on, and if it did not, the
// last step would run again.
static void Replay_Outro(void)
{
    if (gBattleControllerExecFlags)
        return;
    if (sOutro.wait != 0)
    {
        sOutro.wait--;
        return;
    }
#if TESTING
    if (sOutro.step == 0)
        ReplayTest_AtOutroStart();
#endif
    if (sOutroSteps[sOutro.step]() && sOutro.step < ARRAY_COUNT(sOutroSteps) - 1)
        sOutro.step++;
}

// As WITHDRAW returns a mon.
static void ReturnToBall(u32 side)
{
    if (!(sOutro.sidesOut & (1u << side)))
        return;
#if TESTING
    ReplayTest_AtOutroReturn(side);
#endif
    Replay_ReturnMonToBall(side);
}

static bool32 Outro_ReturnLoser(void)
{
    ReturnToBall(GetLoserSide());
    return TRUE;
}

static bool32 Outro_ReturnWinner(void)
{
    ReturnToBall(GetWinnerSide());
    return TRUE;
}

// The trainer slides in as a battle script's trainerslidein makes the controller run
// CONTROLLER_TRAINERSLIDE, called here because the recorded player's table holds
// BtlController_Empty for it. BtlController_HandleTrainerSlide sets the controller to wait for the
// sprite's slide, and the wait clears the battler's exec flag set here, as for any command.
static bool32 Outro_SlideWinnerIn(void)
{
    u32 battler = Replay_GetBattler(GetWinnerSide());

    if (!HasWinner(sOutro.outcome))
        return TRUE;
    MarkBattlerForControllerExec(battler);
    BtlController_HandleTrainerSlide(battler, Replay_GetTrainerPic(battler, TRAINER_PIC_NONE));
    return TRUE;
}

static bool32 Outro_Hold(void)
{
    sOutro.wait = OUTRO_HOLD_FRAMES;
    return TRUE;
}

static bool32 Outro_Fade(void)
{
    BeginNormalPaletteFade(PALETTES_ALL, OUTRO_FADE_DELAY, 0, 16, RGB_BLACK);
    FadeOutBGM(OUTRO_MUSIC_FADE_SPEED);
    return TRUE;
}

static bool32 Outro_End(void)
{
    if (gPaletteFade.active)
        return FALSE;
    Replay_EndOutro();
    return TRUE;
}
