# Logic lives outside the ROM

Everything that can run outside the game does, in TypeScript: reading the battle log, resolving the battle state, choosing what to show and planning fallbacks for content gaps. The pipeline has two stages. The battle log becomes a game-neutral battle script, and a game backend turns that into the target game's instruction stream. Inside the game, a ROM interpreter hands the stream to the controller. In Black 2/White 2 that's the game's own battle client, so no code of ours runs in the game. In Gen 3 it's a small piece of our own code (ADR 0007).

The reason: code outside the ROM carries over from Gen 3 to Gen 5 and later targets. Code inside the ROM is rewritten for every target game, and it is hardest to write for games without a full decompilation.
