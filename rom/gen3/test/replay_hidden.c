#include "global.h"
#include "battle.h"
#include "battle_anim.h"
#include "sprite.h"
#include "replay_ops.h"
#include "test/battle.h"
#include "test/replay_test.h"
#include "constants/battle.h"
#include "constants/battle_anim.h"
#include "constants/moves.h"
#include "constants/species.h"

// The hidden user of Fly, Dig, Dive and Bounce (#65). The charge turn's animation hides the user's
// sprite, and the hit's animation shows it again. A hit turn that plays no animation shows it
// through the controller's sprite invisibility command (MoveEndAttackerVisible). Headless tests
// skip move animations, so these force them (FORCE_MOVE_ANIM, upstream's switch for its
// animation tests) and read the sprite's invisible flag after the battle.

static bool32 IsSpriteHidden(u32 battler)
{
    return gSprites[gBattlerSpriteIds[battler]].invisible;
}

#define PLAYER_BATTLER GetBattlerAtPosition(B_POSITION_PLAYER_LEFT)

SINGLE_BATTLE_TEST("Replay: engine: Fly's charge leaves its user hidden")
{
    FORCE_MOVE_ANIM(TRUE);
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FLY); }
    }
    SCENE
    {
        MESSAGE("Wobbuffet flew up high!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(IsSpriteHidden(PLAYER_BATTLER));
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Fly into Protect shows its user again")
{
    FORCE_MOVE_ANIM(TRUE);
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FLY); }
        TURN { MOVE(opponent, MOVE_PROTECT); SKIP_TURN(player); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_PROTECT, opponent);
        MESSAGE("The opposing Wobbuffet protected itself!");
        NOT ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(!IsSpriteHidden(PLAYER_BATTLER));
    }
}

SINGLE_BATTLE_TEST("Replay: engine: Dig into a Flying type shows its user again")
{
    FORCE_MOVE_ANIM(TRUE);
    GIVEN
    {
        ASSUME(GetMoveType(MOVE_DIG) == TYPE_GROUND);
        ASSUME(IsSpeciesOfType(SPECIES_PIDGEY, TYPE_FLYING));
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_PIDGEY) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_DIG); }
        TURN { SKIP_TURN(player); }
    }
    SCENE
    {
        MESSAGE("Wobbuffet burrowed its way under the ground!");
        ANIMATION(ANIM_TYPE_MOVE, MOVE_DIG, player);
        MESSAGE("It doesn't affect the opposing Pidgey…");
        NOT ANIMATION(ANIM_TYPE_MOVE, MOVE_DIG, player);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(!IsSpriteHidden(PLAYER_BATTLER));
    }
}

// SKIP_TURN takes no rigged roll, so the hit turn's paralysis comes from the trials: the turn
// passes when the paralysis stops the move. The charge turn's roll is rigged to let Fly start.
SINGLE_BATTLE_TEST("Replay: engine: a full paralysis on Fly's hit turn shows its user again")
{
    PASSES_RANDOMLY(1, 4, RNG_PARALYSIS);
    FORCE_MOVE_ANIM(TRUE);
    GIVEN
    {
        WITH_CONFIG(B_PARALYSIS_CHANCE, GEN_9);
        PLAYER(SPECIES_WOBBUFFET) { Status1(STATUS1_PARALYSIS); Speed(2); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(5); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FLY, WITH_RNG(RNG_PARALYSIS, FALSE)); }
        TURN { SKIP_TURN(player); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
        MESSAGE("Wobbuffet couldn't move because it's paralyzed!");
        NOT ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(!IsSpriteHidden(PLAYER_BATTLER));
    }
}

// Gust hits a mon in the air, and the hit leaves it hidden: the hit animation skips an invisible
// sprite.
SINGLE_BATTLE_TEST("Replay: engine: Gust on a Fly user leaves it hidden")
{
    FORCE_MOVE_ANIM(TRUE);
    GIVEN
    {
        PLAYER(SPECIES_WOBBUFFET) { Speed(2); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(1); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FLY); MOVE(opponent, MOVE_GUST); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
        ANIMATION(ANIM_TYPE_MOVE, MOVE_GUST, opponent);
        HP_BAR(player);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(IsSpriteHidden(PLAYER_BATTLER));
    }
}

// The battle ends on the hit turn before the hit: the faster foe's Explosion misses the Fly user
// and knocks out the foe's last mon. The user is still hidden, so the turn's start shows nothing.
SINGLE_BATTLE_TEST("Replay: engine: a Fly user stays hidden into its hit turn")
{
    FORCE_MOVE_ANIM(TRUE);
    GIVEN
    {
        ASSUME(IsExplosionMove(MOVE_EXPLOSION));
        PLAYER(SPECIES_WOBBUFFET) { Speed(1); }
        OPPONENT(SPECIES_WOBBUFFET) { Speed(2); }
    }
    WHEN
    {
        TURN { MOVE(player, MOVE_FLY); }
        TURN { MOVE(opponent, MOVE_EXPLOSION); SKIP_TURN(player); }
    }
    SCENE
    {
        ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
        MESSAGE("The opposing Wobbuffet used Explosion!");
        MESSAGE("Wobbuffet avoided the attack!");
        MESSAGE("The opposing Wobbuffet fainted!");
        NOT ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, player);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(IsSpriteHidden(PLAYER_BATTLER));
    }
}

// The replay tests: MOVE plays the game's own animation, so a charge that hides its user in the
// game hides it in the replay.
static void PlayFlysCharge(void)
{
    ReplayStream_Intro();
    ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
    ReplayStream_Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR, MOVE_FLY);
}

REPLAY_TEST("MOVE plays Fly's charge, which hides its user")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        PlayFlysCharge();
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, nearMon); }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(IsSpriteHidden(Replay_GetBattler(REPLAY_SIDE_NEAR)));
    }
}

REPLAY_TEST("SHOW_MON shows a mon that Fly's charge hid")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        PlayFlysCharge();
        ReplayStream_ShowMon(REPLAY_SIDE_NEAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    SCENE { ANIMATION(ANIM_TYPE_MOVE, MOVE_FLY, nearMon); }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(!IsSpriteHidden(Replay_GetBattler(REPLAY_SIDE_NEAR)));
    }
}

REPLAY_TEST("SHOW_MON leaves a visible mon visible")
{
    STREAM
    {
        FORCE_MOVE_ANIM(TRUE);
        ReplayStream_Intro();
        ReplayStream_SendOut(REPLAY_SIDE_FAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_SendOut(REPLAY_SIDE_NEAR, 0, 100, REPLAY_STATUS_NONE);
        ReplayStream_ShowMon(REPLAY_SIDE_FAR);
        ReplayStream_End(REPLAY_OUTCOME_NEAR_WON);
    }
    THEN
    {
        FORCE_MOVE_ANIM(FALSE);
        EXPECT(!IsSpriteHidden(Replay_GetBattler(REPLAY_SIDE_FAR)));
    }
}
