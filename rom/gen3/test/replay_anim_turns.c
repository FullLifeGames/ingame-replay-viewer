#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "test/battle.h"
#include "test/replay_test.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/species.h"

// The animation turn (#65): the value a move animation reads to choose between its scripts
// (gAnimMoveTurn, set from the controller's MOVE_ANIMATION command). The engine tests pin what the
// pinned expansion passes for each case; the backend's turn rule follows them. Each arranges the
// move in question as the battle's last move animation (the other battler is faster, so its
// Celebrate plays first; the move knocks it out; or, for Pursuit, the other side switches and
// makes no move) and reads the turn in THEN, after the battle.

SINGLE_BATTLE_TEST("Replay: engine: Solar Beam's hit plays turn 1")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_SOLAR_BEAM); }
        TURN { SKIP_TURN(player); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, player);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Solar Beam's charge plays turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_SOLAR_BEAM); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, player);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

// In sun, Solar Beam charges and fires in one turn: the charge line, then the charge animation
// (`BattleScript_TwoTurnMoveCharging`), then the beam on the turn `CanTwoTurnMoveFireThisTurn`
// sets.
SINGLE_BATTLE_TEST("Replay: engine: Solar Beam in sun says its line, charges, then fires on turn 1")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(opponent, MOVE_SUNNY_DAY); MOVE(player, MOVE_SOLAR_BEAM); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SUNNY_DAY, opponent);
        MESSAGE("Wobbuffet used Solar Beam!");
        MESSAGE("Wobbuffet absorbed light!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, player);
        HP_BAR(opponent);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Fly's hit plays turn 1")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FLY); }
        TURN { SKIP_TURN(player); }
    }
    SCENE
    {
        MESSAGE("Wobbuffet flew up high!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
        HP_BAR(opponent);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Curse by a mon that is not a Ghost plays turn 1")
{
    GIVEN
    {
        ASSUME(!IsSpeciesOfType(SPECIES_SNORLAX, TYPE_GHOST));
        PLAYER(SPECIES_SNORLAX) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_CURSE); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CURSE, player);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Curse by a Ghost plays turn 0")
{
    GIVEN
    {
        ASSUME(IsSpeciesOfType(SPECIES_GENGAR, TYPE_GHOST));
        PLAYER(SPECIES_GENGAR) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_CURSE, target: opponent); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CURSE, player);
    }
    THEN
    {
        EXPECT(opponent->volatiles.cursed);
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Brick Break into Reflect plays turn 1")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(opponent, MOVE_REFLECT); }
        TURN { MOVE(player, MOVE_BRICK_BREAK); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_REFLECT, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_BRICK_BREAK, player);
    }
    THEN
    {
        EXPECT_EQ(gSideTimers[B_SIDE_OPPONENT].reflectTimer, 0);
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Brick Break with no screen plays turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_BRICK_BREAK); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_BRICK_BREAK, player);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

// Future Sight hits at the end of the second turn after it was used, after both moves.
SINGLE_BATTLE_TEST("Replay: engine: Future Sight's hit plays turn 1")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FUTURE_SIGHT); }
        TURN { }
        TURN { }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FUTURE_SIGHT, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FUTURE_SIGHT, player);
        HP_BAR(opponent);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

// The user faints on the hit's turn, and its replacement comes after the end-of-turn effects: the
// hit plays its animation from the user's empty position.
SINGLE_BATTLE_TEST("Replay: engine: Future Sight's hit plays with its user's side fainted")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { HP(1); Speed(1); }
        PLAYER(SPECIES_WYNAUT) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FUTURE_SIGHT); }
        TURN { }
        TURN { MOVE(opponent, MOVE_SCRATCH); SEND_OUT(player, 1); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FUTURE_SIGHT, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SCRATCH, opponent);
        MESSAGE("Wobbuffet fainted!");
        MESSAGE("The opposing Wobbuffet took the Future Sight attack!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FUTURE_SIGHT, player);
        HP_BAR(opponent);
        MESSAGE("Go! Wynaut!");
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Doom Desire's hit plays turn 1")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_DOOM_DESIRE); }
        TURN { }
        TURN { }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_DOOM_DESIRE, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        MESSAGE("The opposing Wobbuffet took the Doom Desire attack!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_DOOM_DESIRE, player);
        HP_BAR(opponent);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 1);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Swallow plays its Stockpile count as the turn")
{
    u32 stockpiles;

    PARAMETRIZE { stockpiles = 1; }
    PARAMETRIZE { stockpiles = 2; }
    PARAMETRIZE { stockpiles = 3; }
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { HP(10); MaxHP(400); Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_STOCKPILE); }
        TURN { MOVE(player, stockpiles >= 2 ? MOVE_STOCKPILE : MOVE_CELEBRATE); }
        TURN { MOVE(player, stockpiles >= 3 ? MOVE_STOCKPILE : MOVE_CELEBRATE); }
        TURN { MOVE(player, MOVE_SWALLOW); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SWALLOW, player);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, stockpiles);
    }
}

// Two hits: the second is the battle's last move animation.
SINGLE_BATTLE_TEST("Replay: engine: Double Slap's second hit plays turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_DOUBLE_SLAP, WITH_RNG(RNG_HITS, 2)); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_DOUBLE_SLAP, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_DOUBLE_SLAP, player);
        MESSAGE("The Pokémon was hit 2 times!");
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

// Sturdy holds the first kick at 1 HP, so the second faints the target and is the last.
SINGLE_BATTLE_TEST("Replay: engine: Triple Kick's second hit plays turn 0")
{
    GIVEN
    {
        WITH_CONFIG(B_STURDY, GEN_5);
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_GEODUDE) { Ability(ABILITY_STURDY); Level(1); Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_TRIPLE_KICK); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TRIPLE_KICK, player);
        ABILITY_POPUP(opponent, ABILITY_STURDY);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TRIPLE_KICK, player);
        MESSAGE("The opposing Geodude fainted!");
        NOT ANIMATION(ANIM_TYPE_MOVE, MOVE_TRIPLE_KICK, player);
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Triple Kick's third hit plays turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_TRIPLE_KICK); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TRIPLE_KICK, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TRIPLE_KICK, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_TRIPLE_KICK, player);
        MESSAGE("The Pokémon was hit 3 times!");
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

// Bide moves first (priority 1 in the pinned data), so its unleash knocks out the opponent: no
// move follows it, and the turn THEN reads is the unleash's.
SINGLE_BATTLE_TEST("Replay: engine: Bide's unleash plays turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { HP(1); Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_BIDE); MOVE(opponent, MOVE_SCRATCH); }
        TURN { SKIP_TURN(player); MOVE(opponent, MOVE_SCRATCH); }
        TURN { SKIP_TURN(player); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_BIDE, player);
        MESSAGE("Wobbuffet unleashed its energy!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_BIDE, player);
        HP_BAR(opponent);
        MESSAGE("The opposing Wobbuffet fainted!");
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

// Skull Bash's charge plays its animation before its line, then raises Defense
// (MoveHasChargeTurnAdditionalEffect).
SINGLE_BATTLE_TEST("Replay: engine: Skull Bash plays its charge before its line on turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_SKULL_BASH); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_CELEBRATE, opponent);
        MESSAGE("Wobbuffet used Skull Bash!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_SKULL_BASH, player);
        MESSAGE("Wobbuffet tucked in its head!");
        ANIMATION(ANIM_TYPE_GENERAL, B_ANIM_STATS_CHANGE, player);
        MESSAGE("Wobbuffet's Defense rose!");
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Pursuit on a switching target plays turn 0")
{
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET);
        OPPONENT(SPECIES_WYNAUT);
        OPPONENT(SPECIES_WOBBUFFET);
    }
    WHEN
    {
        TURN { SWITCH(opponent, 1); MOVE(player, MOVE_PURSUIT); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_PURSUIT, player);
        HP_BAR(opponent);
        MESSAGE("2 sent out Wobbuffet!");
    }
    THEN
    {
        EXPECT_EQ(gAnimMoveTurn, 0);
    }
}

// The replay tests: MOVE hands its animTurn to the move animation. Op 3 is the MOVE, so the turn
// its animation read is recorded at the start of op 4.
#define MOVE_OP 3

static void PlayMoveOnAnimTurn(u32 species, u32 move, u32 animTurn)
{
    ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, species, 100);
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_MoveOnAnimTurn(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, move, animTurn);
    ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
}

REPLAY_TEST("MOVE plays Curse by a mon that is not a Ghost on turn 1")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_SNORLAX, MOVE_CURSE, 1); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_CURSE, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 1); }
}

REPLAY_TEST("MOVE plays Solar Beam's charge on turn 0")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_SOLAR_BEAM, 0); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 0); }
}

REPLAY_TEST("MOVE plays Solar Beam's hit on turn 1")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_SOLAR_BEAM, 1); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_SOLAR_BEAM, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 1); }
}

REPLAY_TEST("MOVE plays Brick Break through a screen on turn 1")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_BRICK_BREAK, 1); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_BRICK_BREAK, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 1); }
}

REPLAY_TEST("MOVE plays Future Sight's hit on turn 1")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_FUTURE_SIGHT, 1); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_FUTURE_SIGHT, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 1); }
}

REPLAY_TEST("MOVE plays Swallow after one Stockpile on turn 1")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_SWALLOW, 1); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_SWALLOW, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 1); }
}

REPLAY_TEST("MOVE plays Swallow after two Stockpiles on turn 2")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_SWALLOW, 2); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_SWALLOW, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 2); }
}

REPLAY_TEST("MOVE plays Swallow after three Stockpiles on turn 3")
{
    STREAM { PlayMoveOnAnimTurn(SPECIES_WOBBUFFET, MOVE_SWALLOW, 3); }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_SWALLOW, nearMon); }
    THEN { EXPECT_EQ(ReplayTest_AnimMoveTurnAtOpStart(MOVE_OP + 1), 3); }
}

// MOVE_TYPE (#89): the type the next MOVE's animation reads, as the engine sets
// gBattleStruct->dynamicMoveType before Ivy Cudgel's or Tera Blast's animation picks its look
// (GetBattleMoveType). MOVE clears it once its animation has played, and TURN clears one that no
// MOVE took. Ops 3 and 4 are MOVE_TYPE and the op after it.
#define MOVE_TYPE_OP 3

REPLAY_TEST("MOVE_TYPE gives the next MOVE its type and MOVE clears it")
{
    STREAM
    {
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_OGERPON_WELLSPRING, 100);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_MoveType(TYPE_WATER);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_IVY_CUDGEL);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_IVY_CUDGEL, nearMon); }
    THEN
    {
        EXPECT_EQ(ReplayTest_MoveTypeAtOpStart(MOVE_TYPE_OP), TYPE_NONE);
        EXPECT_EQ(ReplayTest_MoveTypeAtOpStart(MOVE_TYPE_OP + 1), TYPE_WATER);
        EXPECT_EQ(ReplayTest_MoveTypeAtOpStart(MOVE_TYPE_OP + 2), TYPE_NONE);
        EXPECT_EQ(gBattleStruct->dynamicMoveType, TYPE_NONE);
    }
}

// Headless tests skip move animations, so this one plays them and reads the type on the frame
// Ivy Cudgel's animation starts, before its script picks its look.
REPLAY_TEST("MOVE's animation reads the type of the MOVE_TYPE before it")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        ReplayStream_Mon(REPLAY_SIDE_NEAR, 0, SPECIES_OGERPON_WELLSPRING, 100);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_MoveType(TYPE_WATER);
        ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_IVY_CUDGEL);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_IVY_CUDGEL, nearMon); }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT_EQ(ReplayTest_MoveTypeAtMoveAnim(), TYPE_WATER);
    }
}

REPLAY_TEST("TURN clears a MOVE_TYPE that no MOVE took")
{
    STREAM
    {
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_MoveType(TYPE_FIRE);
        ReplayStream_Turn(2);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        EXPECT_EQ(ReplayTest_MoveTypeAtOpStart(MOVE_TYPE_OP + 1), TYPE_FIRE);
        EXPECT_EQ(ReplayTest_MoveTypeAtOpStart(MOVE_TYPE_OP + 2), TYPE_NONE);
    }
}
