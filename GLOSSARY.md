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
A game this project renders into: pokeemerald-expansion first, then Black 2/White 2, later the 3D games Pokémon XD and a Gen 9 game.
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
The other replay side, drawn at the top of the screen, with front sprites. The game's text names its Pokémon with "The opposing", as in "The opposing Skarmory used Spikes!".
_Avoid_: opponent, enemy

**Intro**:
The opening of a battle before the first turn: the challenge line ("You are challenged by Bob!"), both teams shown as Poké Balls, and the first send-outs.
_Avoid_: lead-in, opening

**Side condition**:
An effect that lasts on one side of the field, such as Spikes or Reflect.
_Avoid_: hazard (only some are), field effect

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

**Instruction**:
One step of an instruction stream: a line of text, a move animation, an HP bar moving to a new value, a switch.
_Avoid_: command, opcode

**Team table**:
The start of an instruction stream that names both trainers and their teams, so the renderer can set up the battle before the first instruction.
_Avoid_: header, roster

**Replay slot**:
The reserved empty area of a built ROM image that holds one replay's instruction stream.
_Avoid_: buffer, mailbox

**ROM interpreter**:
Whatever inside the target game reads the instruction stream and hands each instruction to the controller. That's either the game's own code or a small piece of ours.
_Avoid_: engine, VM

**Refusal screen**:
What the game shows for an instruction stream it refuses: the reason in words and the error's number.
_Avoid_: error screen, red screen

## The WebAssembly build

**WebAssembly build**:
The expansion with our C files, compiled by Emscripten into a WebAssembly module that the viewer runs in a worker, without an emulator (#35, #43, `docs/wasm-spike.md`).
_Avoid_: native build, port, recompilation

**Platform layer**:
The C code that stands in for the GBA's hardware in the WebAssembly build: the BIOS calls, DMA, the interrupts, the frame driver, the scanline renderer and the sound. Ours lives in `rom/gen3/wasm/layer/` under the repository's MIT licence (#43). It took the place of the files the spike borrowed from pokeemerald-multiplatform.
_Avoid_: emulator, HAL, backend (a game backend is ours)

**Glue**:
Our C files for the WebAssembly build only (`rom/gen3/wasm/src/`). They have the platform layer run each frame, pass each interrupt to the game, hand frames and sound to JavaScript, stub the hardware the viewer does not use, and stop a run that must not go on. Emscripten's own JavaScript runtime is "Emscripten's glue".
_Avoid_: shim, wrapper

**Stub list**:
The stubs of the glue that a replay run may call: the calls the game makes at boot to set up its wireless adapter. A call to any other stub stops the run with the stub's name (#46).
_Avoid_: allow list, whitelist

**Module patch**:
The BPS patch from the base ROM to the WebAssembly module (`irv-emerald-wasm.bps`). The page applies it to the user's dump, as it applies the patch for the ROM image.
_Avoid_: wasm patch, module download

**Sanitized module**:
A WebAssembly module built with one of clang's runtime checks, so that a replay run reports every place in the game's C that breaks the check (#44: shifts). It stays on devbox beside the module the page loads and has no module patch.
_Avoid_: debug build, test module

**Overlay patch**:
A change to a copy of an upstream file that only the WebAssembly build compiles. The ROM build never sees it.
_Avoid_: wasm patch (that name fits the module patch too)

**Shadow header**:
Our header that the WebAssembly build finds before the upstream header of the same name. It includes upstream's and adds to it, mostly defines.
_Avoid_: override, stub header

## The pages

**Viewer**:
The page at `/`. It runs the WebAssembly build in a worker and plays the replay there, without an emulator.
_Avoid_: WebAssembly page, spike page (its names before it moved to `/`); for a person who watches, say visitor

**Emulator page**:
The page at `/emulator.html`, the fallback. It patches the base ROM with the patch and plays the replay in mGBA.
_Avoid_: old page, mGBA page

## Scope

**Era-matched replay**:
A replay whose format's generation is no newer than the target game's, so every species, move and mechanic in it exists in that game.
_Avoid_: native replay

**Dropped line**:
A battle log line deliberately not shown in the game, such as chat or timer messages. Every line is either shown or a dropped line, never silently skipped. Each dropped line carries its reason; the reason `state` marks a line whose state a later line shows, such as the recharge turn that the next turn's "must recharge" line tells.
_Avoid_: ignored line, skipped event

**Kind census**:
The check that walks every kind of battle log line the protocol library knows and finds each exactly one place: a rule, a drop reason or the named list.
_Avoid_: coverage list

**Named list**:
The kinds of battle log line the battle script has no rule for, in three groups, each with its reason: kinds a replay's log never holds, kinds of formats the viewer refuses, and kinds with no rule yet.
_Avoid_: named gap list, allow list

**Content gap**:
Anything in a replay that the target game lacks: a species, move, ability, mechanic or animation. Each one needs a fallback.
_Avoid_: missing data

**Fallback**:
What the renderer shows in place of a content gap, such as a generic animation for the move's type or a text line.
_Avoid_: placeholder, substitute (a move)

**Live play**:
The later goal: using a target game's own menus to play a battle on Showdown in real time.
_Avoid_: online mode, reverse mode
