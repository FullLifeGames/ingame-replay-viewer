#include "global.h"
#include "battle.h"
#include "battle_controllers.h"
#include "battle_gfx_sfx_util.h"
#include "battle_util2.h"
#include "main.h"
#include "pokemon.h"
#include "window.h"
#include "test/replay_test.h"
#include "constants/characters.h"
#include "constants/species.h"

// The runner of REPLAY_TEST (#7). It borrows upstream's event queue and matchers: SCENE queues
// into gBattleTestRunnerState, and the recorders in test_runner_battle.c match each message, HP
// change, animation, ability pop-up, status icon and effectiveness sound against it. The battle
// itself is ours: Replay_Start sets it up from the stream, and END leaves it through
// CB2_QuitRecordedBattle into CB2_ReplayTest_Done.

#define STATE gBattleTestRunnerState
#define DATA gBattleTestRunnerState->data

#define STREAM_CAPACITY 0x1000

EWRAM_DATA bool8 gReplayTestRunStream = FALSE;
static EWRAM_DATA u8 sStream[STREAM_CAPACITY] = {0};
static EWRAM_DATA u32 sStreamLength = 0;
static EWRAM_DATA u16 sCheckedProgress = 0;

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
    error = Replay_Start(sStream, sStreamLength, REPLAY_EXIT_AT_END, CB2_ReplayTest_Done);
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

static void CB2_ReplayTest_Done(void)
{
    CheckQueuedEvents();
    STATE->runThen = TRUE;
    InvokeReplayTest(gTestRunnerState.test->data);
    STATE->runThen = FALSE;
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

static u8 *Reserve(u32 size)
{
    u8 *at = &sStream[sStreamLength];

    if (size > STREAM_CAPACITY - sStreamLength)
        Test_ExitWithResult(TEST_RESULT_INVALID, SourceLine(0), "%s:%d: the test stream is longer than %d bytes", gTestRunnerState.test->filename, SourceLine(0), STREAM_CAPACITY);
    sStreamLength += size;
    return at;
}

void ReplayStream_SetU8(u32 offset, u32 value)
{
    sStream[offset] = value;
}

void ReplayStream_SetU16(u32 offset, u32 value)
{
    sStream[offset] = value;
    sStream[offset + 1] = value >> 8;
}

void ReplayStream_SetU32(u32 offset, u32 value)
{
    ReplayStream_SetU16(offset, value);
    ReplayStream_SetU16(offset + 2, value >> 16);
}

static void WriteName(u8 *dest, const u8 *name, u32 capacity)
{
    u32 i;

    for (i = 0; i < capacity; i++)
        dest[i] = EOS;
    for (i = 0; i + 1 < capacity && name[i] != EOS; i++)
        dest[i] = name[i];
}

static void WriteTrainer(u32 side, const u8 *name)
{
    u8 *trainer = &sStream[REPLAY_STREAM_TRAINERS_OFFSET + side * REPLAY_TRAINER_SIZE];

    WriteName(trainer + REPLAY_TRAINER_OFFSET_NAME, name, REPLAY_TRAINER_NAME_LENGTH);
    trainer[REPLAY_TRAINER_OFFSET_TEAM_SIZE] = 1;
}

static void WriteWobbuffet(u32 side)
{
    u32 at = REPLAY_STREAM_MONS_OFFSET + side * REPLAY_STREAM_PARTY_SIZE * REPLAY_MON_SIZE;

    ReplayStream_SetU16(at + REPLAY_MON_OFFSET_SPECIES, SPECIES_WOBBUFFET);
    ReplayStream_SetU16(at + REPLAY_MON_OFFSET_MAX_HP, 100);
    sStream[at + REPLAY_MON_OFFSET_LEVEL] = 100;
    sStream[at + REPLAY_MON_OFFSET_GENDER] = REPLAY_GENDER_MALE;
    WriteName(&sStream[at + REPLAY_MON_OFFSET_NICKNAME], COMPOUND_STRING("WOBBUFFET"), REPLAY_MON_NICKNAME_LENGTH);
}

void ReplayStream_Begin(void)
{
    memset(sStream, 0, sizeof(sStream));
    sStreamLength = REPLAY_STREAM_TABLES_END;
    ReplayStream_SetU16(REPLAY_STREAM_OFFSET_VERSION, REPLAY_STREAM_VERSION);
    ReplayStream_SetU16(REPLAY_STREAM_OFFSET_HEADER_SIZE, REPLAY_STREAM_HEADER_SIZE);
    sStream[REPLAY_STREAM_OFFSET_TRAINER_SIZE] = REPLAY_TRAINER_SIZE;
    sStream[REPLAY_STREAM_OFFSET_MON_SIZE] = REPLAY_MON_SIZE;
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_OFFSET, REPLAY_STREAM_TABLES_END);
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, 0);
    WriteTrainer(REPLAY_SIDE_NEAR, COMPOUND_STRING("NEAR"));
    WriteTrainer(REPLAY_SIDE_FAR, COMPOUND_STRING("FAR"));
    WriteWobbuffet(REPLAY_SIDE_NEAR);
    WriteWobbuffet(REPLAY_SIDE_FAR);
}

void ReplayStream_Op(u32 op, u32 size, const u8 *operands)
{
    u8 *at = Reserve(REPLAY_INSTRUCTION_HEADER_SIZE + size);

    at[0] = op;
    at[1] = size;
    if (size != 0)
        memcpy(at + REPLAY_INSTRUCTION_HEADER_SIZE, operands, size);
    ReplayStream_SetU32(REPLAY_STREAM_OFFSET_INSTRUCTIONS_LENGTH, sStreamLength - REPLAY_STREAM_TABLES_END);
}

void ReplayStream_Turn(u32 number)
{
    const u8 operands[REPLAY_OP_TURN_SIZE] = { number, number >> 8 };
    ReplayStream_Op(REPLAY_OP_TURN, REPLAY_OP_TURN_SIZE, operands);
}

void ReplayStream_End(u32 outcome)
{
    const u8 operands[REPLAY_OP_END_SIZE] = { outcome };
    ReplayStream_Op(REPLAY_OP_END, REPLAY_OP_END_SIZE, operands);
}

const u8 *ReplayStream_Data(void)
{
    return sStream;
}

u32 ReplayStream_Length(void)
{
    return sStreamLength;
}
