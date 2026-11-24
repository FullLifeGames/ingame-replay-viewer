#ifndef GUARD_REPLAY_OPS_H
#define GUARD_REPLAY_OPS_H

// The step functions of the ROM interpreter's ops (replay_interpreter.c) that live in files of
// their own, and what they share with it. A step function plays one step of its op and returns
// TRUE when the op is done; the interpreter calls the next step once no controller is busy and no
// wait runs.

typedef bool32 (*ReplayOpFunc)(const volatile u8 *operands, u32 step);

// The battler of a REPLAY_SIDE_*.
u32 Replay_GetBattler(u32 side);

// Waits this many frames before the op's next step.
void Replay_Wait(u32 frames);

// A party mon takes the field: its party slot gets the species of the stream's team table, the
// HP, at most its max HP, and the status (REPLAY_STATUS_*), and the battler's battle mon is made
// from it.
void Replay_PutMonOnField(u32 battler, u32 slot, u32 hp, u32 status);

// The status1 of a REPLAY_STATUS_*.
u32 Replay_GetStatus1(u32 status);

// Puts text (EOS-terminated, in the game's charset) into the text box, as a battle script's
// printstring does, and waits until it is printed and then this many frames, as waitmessage does.
// Returns FALSE when a headless test draws nothing and waits for nothing.
bool32 Replay_PrintText(const volatile u8 *text, u32 frames);

// Empties the text box as a battle script's flushtextbox does: printstring STRINGID_EMPTYSTRING3,
// then waitmessage 1. FLUSH_TEXT_BOX and ITEM_POP_UP share it. Returns as Replay_PrintText.
bool32 Replay_FlushTextBox(void);

// replay_ops_damage.c
bool32 Replay_OpMove(const volatile u8 *operands, u32 step);
bool32 Replay_OpHit(const volatile u8 *operands, u32 step);
bool32 Replay_OpHp(const volatile u8 *operands, u32 step);
bool32 Replay_OpFaint(const volatile u8 *operands, u32 step);
bool32 Replay_OpShowMon(const volatile u8 *operands, u32 step);

// replay_ops_switch.c
bool32 Replay_OpWithdraw(const volatile u8 *operands, u32 step);
bool32 Replay_OpSwitchIn(const volatile u8 *operands, u32 step);

// replay_ops_state.c
bool32 Replay_OpStatus(const volatile u8 *operands, u32 step);
bool32 Replay_OpStat(const volatile u8 *operands, u32 step);
bool32 Replay_OpItem(const volatile u8 *operands, u32 step);
bool32 Replay_OpItemPopUp(const volatile u8 *operands, u32 step);
bool32 Replay_OpFormChange(const volatile u8 *operands, u32 step);

// replay_anims.c
bool32 Replay_OpAnim(const volatile u8 *operands, u32 step);
bool32 Replay_OpTrapTurn(const volatile u8 *operands, u32 step);

// replay_ops_field.c
bool32 Replay_OpWeather(const volatile u8 *operands, u32 step);
bool32 Replay_OpVolatile(const volatile u8 *operands, u32 step);
bool32 Replay_OpAbility(const volatile u8 *operands, u32 step);

// replay_outro.c, the end of a replay (#20).
// Called by the PRINT right before END with END's outcome (REPLAY_OUTCOME_*): a win of either side
// starts the victory music.
void Replay_StartVictoryMusic(u32 outcome);
// Called by END: from the next frame the outro is gBattleMainFunc. sidesOut has a bit for each
// REPLAY_SIDE_* whose battler is out.
void Replay_StartOutro(u32 outcome, u32 sidesOut);
// For the outro, once the screen is black: the interpreter holds it or leaves the battle, as
// Replay_Load's end says.
void Replay_EndOutro(void);

#endif // GUARD_REPLAY_OPS_H
