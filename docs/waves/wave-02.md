# Wave 2: the wave 1 tester's game fixes and the boost at +6

Issues #14, #21, #22, #23 and #24 of milestone M2, picked by the user at the wave 1 gate (answer 3a, 21.11.2026). One stage with two lanes side by side goes to `master` in pull request #34 (S1, closes #14, #21, #22, #23, #24).

`wave/02` started from `master` at bbc2498 (wave 1 and its gate record) on 21.11.2026. The working files sit under `.waves/02/` (gitignored); this booking keeps what lasts.

## Goal

The game fixes the wave 1 tester found in 994052, plus wave 1's rest R1: a replay with a boost already at +6 no longer fails, a move that fails at once plays no animation, weather from an ability shows its animation, the intro's ball display counts every team member, and the interpreter waits for the KO animation as the game does.

## Delivered

### S1, lane a: the Gen 3 backend (#14, #22, #23)

- #14: a zero-stage boost or drop (`|-boost|…|0`) becomes the new event `statLimit` with its direction. The backend prints the expansion's "won't go any higher!" or "won't go any lower!" line and writes no STAT op. Intimidate into a Pokémon at -6 keeps its pop-up over the line.
- #23: a move that does nothing in the game plays no animation. The backend follows the expansion's `MOVE_RESULT_NO_EFFECT`: a `-fail`, an `-immune` or a block (Protect, Mist, Safeguard and the other `-block` lines) right after the move, and a stat move whose own lines hold only limits on its target. Swagger and Flatter that still confuse, and Memento, keep their animation.
- #23: Substitute with too little HP (`-fail|…|[weak]`) prints the expansion's "But it does not have enough HP left to make a substitute!" and plays no animation. It was a dropped line before.
- #22: weather that an ability starts (Sand Stream, Drizzle, Drought) plays its weather animation after the line, inside the pop-up, as `BattleScript_WeatherAbilityActivates` does.
- #22: the screenshot run checks the sky 60 frames into that animation (scene `weather-start`). The scene takes only a start's own three ops in a row: the weather, its line and the animation.

### S1, lane b: the ROM (#21, #24)

- #21: the ROM fills the empty party slots up to the logged team size, at most 6, with a copy of the side's first revealed Pokémon, so the ball display shows one ball per team member. The stream already carried the team size, so the format keeps version 1. A `rom:shots` check counts the balls on both sides of every replay.
- #24: the blue stays, because it is the pinned expansion's own look (S1-1). The interpreter now waits for the KO animation before the op after the faint line, as the engine's `waitanimation` does, and only that faint line prints during it. The diagnosis below gives the cause.
- #24: FAINT sets the Pokémon's HP to 0 first. Without it an Explosion double KO stalled 994086 and 994176: the user's HP stayed above 0, because the log has no HP line for it.
- A test hook `ReplayTest_AtOpStart`, only in test builds, lets the in-ROM tests read the KO animation state when each op starts.

### The #24 diagnosis

The tester saw Suicune turn solid blue for about 2 s during "The opposing Metagross fainted!" and "The opposing Aerodactyl fainted!" in 994052, both after a Surf KO.

- Cause: when a Pokémon faints, the pinned expansion plays the back animation of the survivor on the other side (`B_ANIMATE_MON_AFTER_KO TRUE`, `include/config/battle.h:362`). Suicune's is `BACK_ANIM_SHAKE_GLOW_BLUE`: it shakes and blends its palette toward blue, up to 12/16 and back, over 128 frames (2.1 s). Suicune plays the same glow at every send-out, in vanilla Emerald too. The colour returns to normal by itself.
- Surf and the paralysis play no part. Surf's animation blends a background layer and clears its blend registers at the end, and Suicune's three Surfs that KO nothing show no blue.
- The frames of a `rom:shots` probe show the glow's curve: it starts 70 frames into FAINT, peaks during the faint line and ends 4 to 19 frames into the next op.
- The engine prints the faint line while the animation runs and then waits for it (`BattleScript_FaintBattler`: `dofaintanimation`, `printstring`, `waitanimation`). Our interpreter had no such wait and started the next op early. In 994052 that op is a PRINT, so nothing showed; an op that moves or recolours the survivor would have clashed with the glow.
- The unmodified pinned expansion shows the same blue for the same 128 frames, then waits. Vanilla Emerald has no KO animation, so no blue. We read both from the sources (the pinned tree and pret/pokeemerald) and did not run an unmodified build. None of our three patches touches the faint path.

## Evidence

- `npm run check` on the merged branch, in the worktree that holds the pinned tree: 1179 specs, none skipped; coverage of lines 99.82 %, of branches 98.49 %. Without the pinned tree, 139 of them skip.
- `npm run rom:check`: 88 of 88 (80 from wave 1, T21-1 to T21-3, T24-1 to T24-5). Each new test but the guard T24-5 failed first for its own reason: T24-4 timed out on the Explosion double KO before the fix. Lane a changed no C file, so the merged tree runs the same tests.
- The ROM built from the merged tree: SHA1 `779ba38d6d0d70dbfd407d7c8acc5aba60d8c43c` with patches 0001 to 0003, the same as lane b's last build; patch 18 388 891 bytes, round trip passed.
- `npm run rom:shots` on the merged tree, each replay from boot to END with every scene passing, the ball counts and `weather-start` among them:

  | Replay    | Instructions | Frames  | Wall time |
  | --------- | ------------ | ------- | --------- |
  | 994052    | 461          | 40 259  | 57 s      |
  | 994086    | 1037         | 94 233  | 125 s     |
  | 994128    | 1037         | 89 628  | 118 s     |
  | 994141    | 1085         | 96 238  | 106 s     |
  | 994176    | 1808         | 153 577 | 150 s     |
  | hand-made | 34           | 3 523   | 4 s       |

- `weather-start` sees all 1960 pixels of its sky region change in every stream. 994052's frames show the sandstorm over the sky 60 frames into "A sandstorm kicked up!". With that animation swapped for a held item's sparkle, the scene fails with 0 pixels changed.

- A probe over 201 recent gen3ou ladder replays: 199 built before the lane; the two that failed had a zero-stage boost, and both build now.

## Decided without the user

Each entry gives the scene, the options, the choice and what a reversal costs.

- S1-1 (#24) Suicune's blue is the pinned expansion's KO animation; vanilla Emerald has none. (a) keep the animation and wait for it, (b) patch 0004 turns it off for a vanilla look, (c) both. Chosen (a). Reversal: one patch, a build and a shot check.
- S1-2 Both lanes add shot scenes to `scripts/rom-shot-scenes.ts`. (a) one module per lane's scene, lane b merges first, (b) lane b writes #22's probe after lane a, (c) the ball probe later. Chosen (a). Reversal: none.
- S1-3 (#21) A team size above 6, which no Gen 3 format sends. (a) the ROM caps it at 6, (b) the ROM and the backend refuse it. Chosen (a). Reversal: one check on each side.
- S1-4 (#14) A stat already at its limit. (a) a new event `statLimit` with its direction, text only, (b) a `direction` field on every stat change, (c) on zero ones only. Chosen (a), and no STAT op for it. Reversal: one event kind.
- S1-5 (#14) No test fixture has a zero-stage boost; two recent ladder replays do. (a) hand-written lines in the specs, copied from them, (b) a sixth fixture from the ladder, (c) wait for a tournament replay. Chosen (a). Reversal: one fixture.
- S1-6 (#23) Which failures skip the animation. (a) every case the expansion's `MOVE_RESULT_NO_EFFECT` covers (`-fail`, `-immune`, Protect, stat moves at the limit), (b) `-fail` only. Chosen (a). Reversal: one predicate.
- S1-7 (#22) Where the ability's weather animation plays. (a) after its line, inside the pop-up, as the expansion's script, (b) after the pop-up hides. Chosen (a). Reversal: one order.
- S1-8 (#24) Which ops may start while the KO animation runs. (a) every PRINT, (b) only the faint line right after FAINT, as `BattleScript_FaintBattler` prints it between `dofaintanimation` and `waitanimation`. Chosen (b). Reversal: one condition in `Replay_WaitsForKOAnimation`.
- S1-9 Lane a's review found Swagger and Flatter at the limit, Substitute's `[weak]` failure and the limit check's target. Substitute's `[weak]` was an older gap, and #23 covers the cases the expansion treats alike. (a) fix them in the lane, (b) rests. Chosen (a). Reversal: none.
- S1-10 (#24) An Explosion double KO stalled two replays: the user's HP stays above 0, and the far faint then starts a KO animation on a freed sprite. (a) the ROM's FAINT sets HP to 0 first, (b) the backend writes an HP 0 op before such a FAINT. Chosen (a): it fixes the cause inside the ROM and moves no snapshot. Reversal: one line.
- S1-11 Lane b's review found a test whose name claims an order its check cannot see, a counter comment that does not hold behind a Substitute, and a comment pointing at gitignored notes. It also asked for a faint behind a Substitute. (a) fix them in the lane and add the test, (b) rests. Chosen (a). Reversal: none. T24-2 now checks the counter when the next two ops start; it failed with the wait removed. The new T24-5 passed at once, so the wait holds behind a Substitute too.
- S1-12 (#22) The first merged screenshot run passed `weather-start`, but so did its red run without the Sand Stream animation: the scene had skipped to the rain that Rain Dance starts and measured the next turn's rain animation. (a) the scene takes the start's three ops in a row, test first, and the red run swaps the animation for one that is not weather, (b) keep the loose rule. Chosen (a). Reversal: one function.
- S1-13 No tester this wave. The page did not change, the screenshot run checks the game's new scenes with pixel probes, and the preview lets the user watch 994052. (a) skip the tester, (b) a tester plays 994052 for 11 minutes on devbox. Chosen (a). Reversal: one tester run.

## Gate

After the gate on 21.11.2026:

| Stage | Lane | Issues        | Pull request | State after the gate |
| ----- | ---- | ------------- | ------------ | -------------------- |
| S1    | a    | #14, #22, #23 | #34          | merged, 7fa0bb6      |
| S1    | b    | #21, #24      | #34          | merged, 7fa0bb6      |

The dev page ran behind `tailscale serve` for the user's own look at 994052 and stopped after the gate.

The gate asked the user five questions on a review page. The user answered "1a 2a 3a 4a 5a" on 21.11.2026, with no notes:

1. #34 merged at 5ecdf9e (merge 7fa0bb6). #14, #21, #22, #23 and #24 are closed.
2. The expansion's KO animation stays. The viewer shows the game it builds on, so Suicune glows blue after a KO as in the unmodified expansion.
3. The rests became issues: R1 to R4 approved for M2 as small fixes, R5 parked with its trigger. The list below names each issue.
4. Wave 3 takes the M1b WebAssembly spike, filed as #35. Its answer decides where the speed-up options go and how #17 gets solved.
5. The user files the speed-up issue from the draft; the integrator sent its text in the chat.

After the gate the user reported that gen3customgame-2115579570 fails on the page with "sendOut hp 100.00000000000001 is no u16" and asked for a fix in the next round. A custom game logs exact HP, and `scaleHp` turned 319/319 into 100.00000000000001. It became #41, approved for M2 as a small fix, and joins wave 3.

## Rests

Proposals for issues, ruled at the gate (answer 3a). None of the five test replays hits one. Each line names its issue.

- R1 (#36, M2, small fix): Volt Absorb and Water Absorb log `-heal` when they absorb a move, so the move plays its animation; the game skips it.
- R2 (#37, M2, small fix): Own Tempo's `-immune|…|confusion` becomes a dropped line.
- R3 (#38, M2, small fix): Substitute when one is already up prints "But it failed!"; the expansion says "Dugtrio already has a substitute!".
- R4 (#39, M2, small fix): Destiny Bond and Perish Song KO a Pokémon with HP left. Showdown logs no HP line before their `faint`, so our HP bar vanishes at its old width; the game drains it first.
- R5 (#40, parked until the speed-up work): the stream has no pause op, and the game waits `B_WAIT_TIME_SHORT` before an ability pop-up. Timing only.
- R6 (no issue): Perish Song is the only Gen 1-3 move with `TARGET_ALL_BATTLERS`, which the expansion animates even when it does nothing. Showdown logs that failure with `[still]`, so the stream already matches the game.
- R7 (no issue): the expansion starts each KO animation twice, one frame apart; both end on the same frame.
- R8 (no issue): `rom:shots` end frames differ by a few dozen frames between runs of the same stream and ROM (994052: 39 564 and 39 592). No check keys on them.
