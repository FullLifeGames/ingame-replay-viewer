# Ingame Replay Viewer

Plays Pokémon Showdown replays back inside real Pokémon games, shown through the games' own battle presentation instead of Showdown's web client.

## Sources

**Replay**:
A saved Showdown battle: its battle log plus metadata such as the players, their avatars and the format.
_Avoid_: battle video, recording (those are the games' own format)

**Battle log**:
The ordered protocol lines of a replay (`|switch|`, `|move|`, `|-damage|`, …), describing what a spectator saw.
_Avoid_: input log, replay log

**Simulator**:
Showdown's battle engine, whose results the battle log records. The only source of truth for every outcome.
_Avoid_: server, engine

**Battle recording**:
A game's own saved battle (Emerald's Frontier recorded battle, Platinum's Vs. Recorder, BW's Battle Videos). It stores what the game needs to re-run the battle, not a battle log.
_Avoid_: replay

## Games

**Target game**:
A game this project renders into: pokeemerald-expansion first, then Black 2/White 2, later a Gen 9 game.
_Avoid_: base game, host game

**Renderer**:
A target game made to show only the battle it is told about: animations, text, HP bars, switches. It decides nothing itself.
_Avoid_: player, emulator

**Battle engine**:
The part of a game that computes battle outcomes. The renderer skips it.
_Avoid_: simulator (that is Showdown's)

**Controller**:
The part of a game's battle system that turns commands from the battle engine into what is on screen.
_Avoid_: UI, frontend

**Base ROM**:
The user's own copy of the unmodified retail game, which the patch is applied to.
_Avoid_: ROM, dump

**Patch**:
The distributed difference that turns a base ROM into a ROM the renderer can run in. Only target games that have to be built from source need one.
_Avoid_: hack, mod

## Presentation

**Near side**:
The replay side drawn at the bottom of the screen, with back sprites. Player 1 unless the view is flipped.
_Avoid_: player side, own side

**Far side**:
The other replay side, drawn at the top facing the viewer. The game's text calls its Pokémon "Foe".
_Avoid_: opponent, enemy

## Pipeline

**Battle script**:
The game-neutral, ordered list of presentation events derived from a battle log.
_Avoid_: timeline, playback script

**Game backend**:
The per-target-game translation of a battle script into that game's instruction stream, in its own species and move numbers and its own text.
_Avoid_: driver, port

**Instruction stream**:
The compact, game-specific sequence the renderer consumes.
_Avoid_: bytecode, opcodes

**Replay slot**:
The reserved empty area of a built ROM image that holds one replay's instruction stream.
_Avoid_: buffer, mailbox

**ROM interpreter**:
Whatever inside the target game reads the instruction stream and hands each instruction to the controller. That's either the game's own code or a small piece of ours.
_Avoid_: engine, VM

## Scope

**Era-matched replay**:
A replay whose format's generation is no newer than the target game's, so every species, move and mechanic in it exists in that game.
_Avoid_: native replay

**Dropped line**:
A battle log line deliberately not shown in the game, such as chat or timer messages. Every line is either shown or a dropped line, never silently skipped.
_Avoid_: ignored line, skipped event

**Content gap**:
Anything in a replay that the target game lacks: a species, move, ability, mechanic or animation. Each one needs a fallback.
_Avoid_: missing data

**Fallback**:
What the renderer shows in place of a content gap, such as a generic animation for the move's type or a text line.
_Avoid_: placeholder, substitute (a move)

**Live play**:
The later goal: using a target game's own menus to play a battle on Showdown in real time.
_Avoid_: online mode, reverse mode
