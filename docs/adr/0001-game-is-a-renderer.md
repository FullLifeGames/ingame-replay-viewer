# The game is a renderer; the Showdown log is the only truth

A replay's battle log is a spectator's record of events (who used what, how much HP was lost, critical hits). It is not the seed and inputs a game's battle recording re-runs from, and a game's damage formula and random rolls would never reproduce the simulator's results anyway. So the target game's battle engine is skipped entirely. Every battle log event is translated into commands for the game's controller (animations, text, HP bars). In Gen 5 that's the layer the battle server's command queue feeds; in a link battle, the second DS runs only that layer. In Gen 3 both consoles run the battle engine even in a link battle, so the seam is the controller buffer that the engine's commands fill, and a stand-in for the engine has to fill it instead.

## Considered options

- **Rigged engine**: run the game's own battle engine with the log's choices and force every random outcome and damage number to match. That would give the game's own message order for free, but it desyncs on every mechanic the game lacks or computes differently: newer generations, Showdown clauses, formula differences.
- **The game's battle recording player**: it re-runs a battle from stored inputs, which a replay doesn't contain.

## Consequences

- The game's mechanics stop mattering; only its content does. A Gen 3 game can render every Gen 1–3 format, and pokeemerald-expansion can render modern ones too.
- Live play uses the same seam in reverse: Showdown's events drive the controller, and the player's menu choices go back to Showdown. That goal shapes the seam and the transport now, but nothing for it is built until replays work.
