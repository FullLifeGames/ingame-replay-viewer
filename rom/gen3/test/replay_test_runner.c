#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "battle_controllers.h"
#include "battle_gfx_sfx_util.h"
#include "battle_util2.h"
#include "main.h"
#include "pokemon.h"
#include "replay_ops.h"
#include "sprite.h"
#include "window.h"
#include "test/replay_test.h"

// The runner of REPLAY_TEST (#7). It borrows upstream's event queue and matchers: SCENE queues
// into gBattleTestRunnerState, and the recorders in test_runner_battle.c match each message, HP
// change, animation, ability pop-up, status icon and effectiveness sound against it. The battle
// itself is ours: Replay_Start sets it up from the stream. After END, or after the outro of a test
// that calls ReplayTest_PlayOutro, the interpreter calls ReplayTest_AtEnd, which runs THEN while
// the battle is still up, and then leaves the battle through CB2_QuitRecordedBattle into
// CB2_ReplayTest_Done.

#define STATE gBattleTestRunnerState
#define DATA gBattleTestRunnerState->data

EWRAM_DATA bool8 gReplayTestRunStream = FALSE;
static EWRAM_DATA u16 sCheckedProgress = 0;
static EWRAM_DATA u8 sKOAnimsAtOpStart[REPLAY_TEST_RECORDED_OPS] = {0};
static EWRAM_DATA u8 sAnimMoveTurnsAtOpStart[REPLAY_TEST_RECORDED_OPS] = {0};
static EWRAM_DATA struct ReplayTestTrainerSprite sTrainerSpritesAtOpStart[REPLAY_TEST_RECORDED_OPS][REPLAY_STREAM_SIDE_COUNT] = {0};
static EWRAM_DATA bool8 sPlayOutro = FALSE;
static EWRAM_DATA struct ReplayProgress sProgressAtOutroStart = {0};

static void CB2_ReplayTest_Done(void);

static void InvokeReplayTest(const struct BattleTest *test)
{
    test->function.singles(NULL, 0, &gBattleMons[B_POSITION_PLAYER_LEFT], &gBattleMons[B_POSITION_OPPONENT_LEFT]);
}

static void ReplayTest_SetUp(void *data)
{
    memset(STATE, 0, sizeof(*STATE));
    STATE->battlersCount = 2;
    DATA.queuedEventsFailIndex = MAX_QUEUED_EVENTS;
    sCheckedProgress = 0;
    memset(sKOAnimsAtOpStart, 0, sizeof(sKOAnimsAtOpStart));
    memset(sAnimMoveTurnsAtOpStart, 0, sizeof(sAnimMoveTurnsAtOpStart));
    memset(sTrainerSpritesAtOpStart, 0, sizeof(sTrainerSpritesAtOpStart));
    sPlayOutro = FALSE;
    memset(&sProgressAtOutroStart, 0, sizeof(sProgressAtOutroStart));
    Replay_Unload();
}

static void ReplayTest_Run(void *data)
{
    enum ReplayError error;

    ReplayStream_Begin();
    gReplayTestRunStream = TRUE;
    STATE->runScene = TRUE;
    InvokeReplayTest(data);
    gReplayTestRunStream = FALSE;
    STATE->runScene = FALSE;
    error = Replay_Start(ReplayStream_Data(), ReplayStream_Length(), sPlayOutro ? REPLAY_OUTRO_THEN_EXIT : REPLAY_EXIT_AT_END, CB2_ReplayTest_Done);
    if (error != REPLAY_ERROR_NONE)
        Test_ExitWithResult(TEST_RESULT_FAIL, SourceLine(0), "%s:%d: the interpreter refused the stream with error %d", gTestRunnerState.test->filename, SourceLine(0), error);
}

// As TestRunner_Battle_AfterLastTurn: every queued event matched, NOT groups aside.
static void CheckQueuedEvents(void)
{
    const struct QueuedEvent *event;
    u32 line;

    while (DATA.trial.queuedEvent < DATA.queuedEventsCount
        && DATA.queuedEvents[DATA.trial.queuedEvent].groupType == QUEUE_GROUP_NONE_OF)
        DATA.trial.queuedEvent += DATA.queuedEvents[DATA.trial.queuedEvent].groupSize;
    if (DATA.trial.queuedEvent == DATA.queuedEventsCount)
        return;
    event = &DATA.queuedEvents[DATA.trial.queuedEvent];
    line = SourceLine(event->sourceLineOffset);
    if (event->type == QUEUED_MESSAGE_EVENT)
        Test_ExitWithResult(TEST_RESULT_FAIL, line, "%s:%d: Unmatched MESSAGE(\"%S\")", gTestRunnerState.test->filename, line, event->as.message.pattern);
    Test_ExitWithResult(TEST_RESULT_FAIL, line, "%s:%d: Unmatched event of type %d", gTestRunnerState.test->filename, line, event->type);
}

// After END, while the battle is still up: the SCENE events, then the THEN block.
void ReplayTest_AtEnd(void)
{
    CheckQueuedEvents();
    STATE->runThen = TRUE;
    InvokeReplayTest(gTestRunnerState.test->data);
    STATE->runThen = FALSE;
}

static void RecordTrainerSprites(struct ReplayTestTrainerSprite *recorded)
{
    u32 side;

    for (side = 0; side < REPLAY_STREAM_SIDE_COUNT; side++)
    {
        const struct Sprite *sprite = &gSprites[gBattleStruct->trainerSlideSpriteIds[Replay_GetBattler(side)]];

        recorded[side].images = sprite->images;
        recorded[side].affineParam = sprite->oam.affineParam;
        recorded[side].paletteTag = GetSpritePaletteTagByPaletteNum(sprite->oam.paletteNum);
        recorded[side].inUse = sprite->inUse;
    }
}

void ReplayTest_AtOpStart(u32 op)
{
    if (op >= REPLAY_TEST_RECORDED_OPS)
        return;
    sKOAnimsAtOpStart[op] = gBattleStruct->battlerKOAnimsRunning;
    sAnimMoveTurnsAtOpStart[op] = gAnimMoveTurn;
    RecordTrainerSprites(sTrainerSpritesAtOpStart[op]);
}

void ReplayTest_PlayOutro(void)
{
    sPlayOutro = TRUE;
}

void ReplayTest_AtOutroStart(void)
{
    sProgressAtOutroStart = gReplayProgress;
}

const struct ReplayProgress *ReplayTest_ProgressAtOutroStart(void)
{
    return &sProgressAtOutroStart;
}

static void CheckRecordedOp(u32 op)
{
    if (op >= REPLAY_TEST_RECORDED_OPS)
        Test_ExitWithResult(TEST_RESULT_FAIL, SourceLine(0), "%s:%d: op %d is past the %d recorded ops", gTestRunnerState.test->filename, SourceLine(0), op, REPLAY_TEST_RECORDED_OPS);
}

u32 ReplayTest_KOAnimsAtOpStart(u32 op)
{
    CheckRecordedOp(op);
    return sKOAnimsAtOpStart[op];
}

u32 ReplayTest_AnimMoveTurnAtOpStart(u32 op)
{
    CheckRecordedOp(op);
    return sAnimMoveTurnsAtOpStart[op];
}

const struct ReplayTestTrainerSprite *ReplayTest_TrainerSpriteAtOpStart(u32 op, u32 side)
{
    CheckRecordedOp(op);
    return &sTrainerSpritesAtOpStart[op][side];
}

static void CB2_ReplayTest_Done(void)
{
    Replay_Unload();
    SetMainCallback2(CB2_TestRunner);
}

// As TearDownBattle in test_runner_battle.c, for a battle that ended or was cut short: each free
// does nothing for what is already freed.
static void ReplayTest_TearDown(void *data)
{
    u32 i;

    for (i = 0; i < MAX_BATTLE_TRAINERS; i++)
    {
        ZeroPartyMons(gParties[i]);
        gPartiesCount[i] = 0;
    }
    for (i = 0; i < MAX_BATTLERS_COUNT; i++)
    {
        gBattlerBattleController[i] = BATTLE_CONTROLLER_NONE;
        gBattlerPartyIndexes[i] = 0;
    }
    FreeMonSpritesGfx();
    FreeBattleSpritesData();
    FreeBattleResources();
    FreeAllWindowBuffers();
    gMain.inBattle = FALSE;
    Replay_Unload();
}

// Without progress for 60 seconds the runner stops the test as a timeout.
static bool32 ReplayTest_CheckProgress(void *data)
{
    bool32 madeProgress = sCheckedProgress < gReplayProgress.done;
    sCheckedProgress = gReplayProgress.done;
    return madeProgress;
}

const struct TestRunner gReplayTestRunner =
{
    .setUp = ReplayTest_SetUp,
    .run = ReplayTest_Run,
    .tearDown = ReplayTest_TearDown,
    .checkProgress = ReplayTest_CheckProgress,
};
