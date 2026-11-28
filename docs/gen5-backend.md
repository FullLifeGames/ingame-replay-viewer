# The Gen 5 game backend (#106 to #111)

The Gen 5 backend turns a battle script into a Gen 5 replay, and the run script plays that replay in Black 2 (USA) from power-on to the last scene. Since #110 both Gen 5 OU test replays play start to finish, and since #111 the Gen 5 page plays a test replay by itself. The emulator, the direct entry and the way into a battle are the spike's record in `docs/gen5-spike.md`; this document covers the path from the battle script to the run.

The game runs unmodified (ADR 0007). The page writes into the emulator's memory; nothing patches the dump, and no state leaves the build machine (ADR 0002).

## From the battle script to a Gen 5 replay

`buildGen5Replay` (`src/gen5/backend/replay.ts`) gives a `Gen5Replay`: its format version (2), the pokebw2 pin its numbers come from, both trainers' names, both parties, the blocks of server commands, and the fallbacks.

- **The rules.** `src/gen5/backend/rules.ts` gives every kind of battle script event one rule, in a table that tsc holds complete: `park` (the direct entry writes it, such as the trainers and the teams), `game` (the game plays it by itself: each event before the first turn that would play, such as the leads' send-outs and Drizzle), `boundary` (it parts the blocks), `play` (the writer plays it), `unplayed` (Black 2 does not play it yet) and `line` (Black 2 has no line for it, and nothing shows). A new kind in the battle script fails the build until it has a rule.
- **The parties.** `teams.ts` writes each side's members in party order (`GLOSSARY.md`, "Party order") with what the log reveals of each (`revealed.ts`) and defaults for the rest: nature Hardy, the species' first ability, no item. `names.ts` maps Showdown's names to the game's numbers through @pkmn's Gen 5 data, natures by name from the generated list. `font.ts` writes "?" for a character the battle's font lacks. Every Pokémon has 100 HP, as the user's interim answer on `gen5-hp-numbers` asks.
- **Actions and blocks.** `blocks.ts` cuts the battle script into actions: a move, a `cant` or a switch-in after the leads opens one, and the next one or the turn closes it. Between a turn's last spacer line and its `|upkeep|` line each event is an action of its own. Each action's commands pack into blocks named `b1`, `b2` and so on, each at most the room of the adapter's `sendCmd.data` and the client's queue (`blockRoom`).
- **The sequences.** Each event that plays gives the server commands that pokebw2's server puts for it, in the server's order, and each module names the server function it copies: `moves.ts` (the move's line and look), `hits.ts` (hit, miss, failure, immunity, Leftovers), `switches.ts` (switch, drag, send-in), `faints.ts`, `effects.ts` with `status.ts`, `stats.ts`, `field.ts`, `items.ts`, `abilities.ts`, `substitute.ts` and `move-effects.ts`, and `charge.ts` (Solar Beam in sun, which charges and fires in one turn). `battle-state.ts` and `party-state.ts` keep which Pokémon stand in front, their mon IDs and the HP the game shows.
- **The lines.** `lines.ts` and `effect-lines.ts` name each line of the game's text banks by its label and the C that puts it. The generator holds each label to the message IDs its function puts, so a pin that moves a line fails by the line's label.
- **The fallbacks.** `fallbacks.ts` lists what the game cannot show as the log has it, each with its log line (`GLOSSARY.md`, "Gen 5 fallback"): the party's `form`, `character`, `moves` and `game`, and the events' `unplayed`, `line` and `plain`. `not-shown.ts` counts them by kind and by event kind. The run's log, the replay spec and the page's list beside the game read the same list.
- **The numbers.** No number of pokebw2 sits in the tree. `scripts/gen5-bw2.ts` generates `build/gen5/bw2.json` from the pinned checkout at run time, and the backend takes every command, message ID, constant and layout from it. CI generates the file too, and `scripts/gen5-replay-real.test.ts` builds both test replays on it: their not-shown lists equal the replay spec's, every block fits the real room, and the plan builds.

## From a Gen 5 replay to the game

`src/gen5/replay-plan.ts` turns a replay into the page's frame steps in two plans. Both refuse a replay of another version or another pin before any step.

- **The entry.** `replayEntry` seals both parties and writes them with both trainers' names through the direct entry (`src/gen5/direct-entry.ts`), from power-on to the first action menu.
- **The read.** At the action menu the run script reads main RAM once: the player's adapter and both parties as the game holds them. The second plan starts 600 frames after the mark `battle`, at a fixed frame, so the read costs no frame and two runs start alike.
- **The hold and the menu.** `replayPlan` first writes the hold: the adapter's state stays idle, which the server never counts as a reply, so it waits for the player's action for good and sends nothing of its own. The player answers the first action menu by A, and the mark `hp-before` follows.
- **The blocks.** For each block the plan writes the block into the adapter, waits until the client has answered it (`returned`), at most 3,000 frames, and marks `<block>-answered`. A frame of the screen is taken every few frames while a block waits (30 in the run script). No write after the hold asks for the player's action, so the client shows no menu and no trainer's hint line until the end. A block wider than the client's queue fails by its name and its script lines before any step.
- **The end.** After the last block the plan marks `end`, writes nothing more, holds the scene for 300 frames and marks `last-scene`. The game keeps showing the last block's scene, as the user's interim answer on `gen5-battle-end` asks. `src/gen5/backend/end.ts` gives the winner or a tie and the simulator's messages after the last turn, such as a forfeit; the run's log names them, and the page says them above its list at the play's end.

## The run script

`GEN5_DUMP=<path> node scripts/gen5-replay.ts --replay <id>` plays a test replay in headless Chromium through the page and EmulatorJS's melonDS. Options: `--run <n>` names the run (label `nosave-direct-<id>-replay-r<n>`), `--every <frames>` sets the frames between two pictures of a waiting block (30), `--blocks <n>` plays the first n blocks for a smoke run, `--against <marks file>` compares the marks with an earlier run's, and `--minutes <n>` sets the deadline (90).

The log holds:

- the fallbacks of the team and the commands of every block, with each line's label;
- every mark with its emulated frame and the SHA-256 of main RAM there;
- one line per block: its answer frame, its frames against the limit, and the battle log lines it showed;
- both parties' order at every answer, read from the game's memory and compared with the backend's;
- the winner and the messages the game does not show;
- the not-shown list;
- a summary: blocks answered, the longest block against its limit, the frames from `hp-before` to `last-scene` and the wall time.

The marks go to `build/gen5/runs/<label>.json`, the pictures to `build/gen5/frames/<label>-*.png`; both stay out of the tracked tree. The run exits 1 on any of six causes: a failed or unfinished run, a party that differs from the backend's, a hash still pending after its polls, a mark that differs from the earlier run's, a request the page must not make, or storage left behind in the browser.

## Equal runs

The emulator's clock follows its emulated frames, input lands on exact frames, and the play starts at a fixed frame after the entry. So two runs of the same replay agree mark by mark: `--against` compares every mark of both runs by name, its frame and its hash of main RAM. The pictures follow wall time and stay out of the comparison.

## The page plays a replay

Since #111 the Gen 5 page plays a test replay by itself, with no plan from outside.

- **The picker.** Above the file input the page offers the Gen 5 test replays by label, with "None: start the game only" first, so a run script that queues its own plan still gets the bare game. A replay plays from power-on with no save: the page refuses one with `?save=` in the address, and a run queued from outside wins over the picker.
- **The build files.** On the pick the page fetches the generated numbers and the built routine from its own server under `/gen5-build/` (`src/web/gen5/build-load.ts`). Both servers answer `bw2.json` and `routine.json` there from `build/gen5/` and nothing else, and the page's build output holds neither file. The page refuses a numbers file of another pokebw2 pin with a sentence that names both pins (`src/gen5/build-files.ts`), and for a file the server lacks it names the script that makes it.
- **The two runs.** The page builds the battle script, the Gen 5 replay and the direct entry in the browser, and queues the entry before the emulator starts (`src/web/gen5/replay-player.ts`, `src/gen5/replay-run.ts`). At the action menu it reads the player's adapter and queues the play 600 frames after the mark `battle`, the frame the run script uses, so the marks of both compare. A waiting block marks its first frame alone, and `?every=<n>` asks for a frame every n frames.
- **The list and the end.** From 56rem wide up the page lists every dropped line and every fallback beside the game, each by its log line counted from 1, with the counts above, as the Gen 3 page does. On a narrower screen the list stands under the game. At the play's end the line above the list names the winner and the messages after the last turn, and says that Black 2 holds the last scene.
- **The shot scene.** `GEN5_DUMP=<path> node scripts/gen5-shot.ts --scene replay --replay <id> --against <marks file>` picks the replay in the page and follows it; `--built` runs the production build that `scripts/gen5-built.ts` serves. The scene asks the page for a frame every 30 frames, as the run script does, and lifts the speed cap once the play begins. Its log names every mark and block, the end, the page's end line and list against the rows of the Node replay, and the summary. It exits 1 on a play that failed or did not end, a row that differs from the Node replay's, a hash still pending or a mark that differs from the earlier run's, beside the shot's own causes: a request the page must not make or storage left behind.

## What plays, and what is listed

Every event of both test replays plays, except the lines Black 2 has none for and the forms. The not-shown lists:

| Replay                    | `line`                             | `form`  |
| ------------------------- | ---------------------------------- | ------- |
| `gen5ou-2718717830`       | 10 weather turns, 1 message, 1 win | 1 party |
| `smogtours-gen5ou-862240` | 15 weather turns, 1 message, 1 win | 2 party |

The weather turns are lines such as "The sunlight is strong.", for which the game's server puts no line. The message is the forfeit, and the win is the winner's line; the run's log names both, and the page lists both beside the game. The forms: Thundurus-Therian and Landorus-Therian show in their base forms.

What neither test replay holds stays `unplayed` until an issue plays it. The kinds: a hit count, a one-hit KO, a move with no target, an HP set by a move, Transform, a forme change and Terastallization. The causes inside a kind that plays: a called move; a hit on the move's own user; a failure or a miss outside a move; a miss or an immunity of a Pokémon other than the move's target; a charge turn spent on its own, a charge skip of a move with no generated charge line, and a release that misses; a look alone; and an effect that no module writes, such as Frisk's item and Mummy's ability.

## The record

Three runs on the build machine on 27 November 2026, each from power-on, each alone:

| Run                              | Blocks answered | Longest block       | Frames from `hp-before` to `last-scene` | Wall time |
| -------------------------------- | --------------- | ------------------- | --------------------------------------- | --------- |
| `gen5ou-2718717830`, run 1       | 58 of 58        | 875 of 3,000 frames | 25,606                                  | 22.6 min  |
| `gen5ou-2718717830`, run 2       | 58 of 58        | 875 of 3,000 frames | 25,606                                  | 23.9 min  |
| `smogtours-gen5ou-862240`, run 1 | 76 of 76        | 948 of 3,000 frames | 31,454                                  | 29.1 min  |

- Run 2 compared its marks with run 1's: all 968, from the takeover to `last-scene`, agree by frame and by the hash of main RAM.
- In every run both parties held the backend's order at every block's answer, no hash stayed pending, and the not-shown lists equal the replay spec's.
- `gen5ou-2718717830` ends on Tentacruel hurt by Stealth Rock, with "isolatedstar forfeited." and abc2158's win in the log. `smogtours-gen5ou-862240` ends on Jirachi's faint, with "Monai forfeited." and tizio potente ao's win.
- The frames (the intro, a switch, a faint, the weather and the last scene of each replay, and Solar Beam's charge) stay on the build machine.

Two shot runs of the page's own replay on 28 November 2026, each from power-on, each alone:

| Run                                         | Blocks answered | Longest block       | Frames from `hp-before` to `last-scene` | Wall time |
| ------------------------------------------- | --------------- | ------------------- | --------------------------------------- | --------- |
| `gen5ou-2718717830`, page on the dev server | 58 of 58        | 875 of 3,000 frames | 25,606                                  | 23.6 min  |
| `gen5ou-2718717830`, production build       | 58 of 58        | 875 of 3,000 frames | 25,606                                  | 21.7 min  |

- Both runs compared their marks with run 1's: all 968 agree by frame and by the hash of main RAM. The page plays what the run script played.
- The page listed 137 rows, 124 dropped lines and 13 fallbacks, each equal to the row the page's modules give for the replay built in Node. Its end line read "abc2158 won. isolatedstar forfeited. Black 2 holds the last scene."
- The production build fetched both build files from `/gen5-build/` and holds neither in its output. Neither run made a request off the machine or left storage behind.
