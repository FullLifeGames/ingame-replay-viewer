---
status: accepted for milestone 1; replaced if the WebAssembly spike (plan, milestone 1b) succeeds
---

# Gen 3 replays are written into the ROM image before the game starts

For pokeemerald-expansion, the page writes a replay's instruction stream into the replay slot, a reserved empty area of the patched ROM image, before the emulator boots it. The ROM interpreter reads the stream from there. This needs no access to the emulator's memory, so any GBA emulator works, and nothing is built per replay.

## Considered options

- **Compiling the replay into the ROM at build time**: needs a ROM build for every replay.
- **Writing into the game's memory while it runs**: the only way to do live play, and it comes with live play. For replays it would need an emulator that exposes memory access, and no browser GBA emulator does that out of the box.
