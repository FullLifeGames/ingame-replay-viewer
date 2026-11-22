---
status: accepted, 22.11.2026 (wave 3 gate, answer 2a); supersedes ADR 0008 for the WebAssembly build
---

# Gen 3 replays are written into the game's memory before it starts

In the WebAssembly build the worker writes a replay's instruction stream into the replay slot in linear memory after it instantiates the module and before it calls `AgbMain`. The slot keeps the layout of `rom/gen3/include/replay_slot.h`, so the page writes it through the same `writeReplaySlot`. Nothing is built per replay, and Restart starts a fresh instance with the stream again.

The emulator page, the fallback until our own platform layer ships (#43), keeps writing the stream into the ROM image as ADR 0008 says.

Because the worker owns the game's memory, live play (roadmap 7) can write instructions and keys while the game runs. ADR 0008 set that option aside because no browser GBA emulator exposes memory access; the module needs no emulator.

## Considered options

- **Keeping the ROM image route in the module**: the module has no ROM image to write into, since the game's data sits in linear memory from the start.
- **Writing while the game runs**: possible now, and live play will need it. A replay needs only the stream before the first frame.
