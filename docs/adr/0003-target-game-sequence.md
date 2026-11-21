# Target games: Gen 3 expansion first, then Gen 5, Gen 9 3D later

The first target game is pokeemerald-expansion (Gen 3, GBA). It's a product of its own, not a stepping stone:

- It already contains later generations' species, moves, mechanics, sprites and animations, so every generation's formats can be rendered without borrowed slots or third-party sprites.
- GBA emulation runs comfortably in a phone browser.
- A ROM built from it can start straight into the viewer, with no savestate.
- No one has built a Showdown renderer for it.

There is no vanilla pokeemerald stage: the expansion's battle code differs from vanilla's, so a vanilla renderer would only have to be ported.

Black 2/White 2 (Gen 5, NDS), the generation whose sprites Showdown's own client uses, is the second target game: first its own formats, then newer ones. A Gen 5 counterpart of the expansion, a Black 2/White 2 with later generations' content, is a later option. A 3D target (Gen 9, Scarlet/Violet) is on the roadmap after that. Pokémon Champions is out of scope as a target game unless a way to mod it turns up; its formats can still be rendered by the other target games.

## Considered options

- **Gen 5 first**: briefly chosen once a complete decompilation of Black 2/White 2 appeared (fuddlesworth/pokebw2, October 2026), because its battle server and client are cleanly split. It was dropped for four reasons:
  - showdown-bw2 already lets people watch Showdown battles in BW2 (ADR 0006).
  - BW2 at full speed in a phone browser is doubtful.
  - BW2 needs a battle already loaded, which means building a savestate in the user's browser (ADR 0002).
  - Newer formats in BW2 need borrowed slots and sprites from third parties.

## Consequences

- Game-side code does not carry over between target games; only what lives outside the ROM does (ADR 0004).
- On each target game, era-matched replays come first and newer formats follow.
