# Distribute a patch for a user-supplied ROM; never host ROMs

The public tool on fulllifegames.com/Tools/ asks each user once for their own base ROM and runs the emulator in the page. For pokeemerald-expansion it applies the patch in the browser first; Black 2/White 2 runs unmodified (ADR 0007). No ROM, and no ROM with the patch already applied, is ever hosted or distributed: the games' code and assets belong to Nintendo, which takes down sites that host them. Patches applied to a user-supplied ROM are how the ROM hacking scene publishes its work.

Savestates count as ROM-derived, because they hold the game's RAM, including code loaded from the ROM. They are never hosted or shipped either. Any savestate the tool needs is built in the user's browser from their own ROM, plus a save file if needed. A save file holds only player data and may be shipped.

## Amendment, 22.11.2026: the WebAssembly module

The WebAssembly spike (`docs/wasm-spike.md`) worked, and milestone 2 ships it (wave 3 gate, answers 2a and 4a).

For pokeemerald-expansion the page may build either a ROM image or a WebAssembly module from the user's base ROM. The module patch (`irv-emerald-wasm.bps`) turns the base ROM into the module, as the patch turns it into the ROM image. The module stays in the user's tab, like the patched ROM: no server hosts or ships a module, a ROM, or a module or ROM with the patch applied. The server serves the module patch and Emscripten's glue.

The module patch may carry what the ROM patch carries: the expansion's code and assets, compiled with ours, under the posture that this ADR and ADR 0007 take for the ROM patch. Any other code compiled into the module, the platform layer and the runtime libraries among it, needs a licence that lets us distribute it inside a patch.
