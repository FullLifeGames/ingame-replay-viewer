# No forks: Gen 5 is driven from outside, Gen 3 is built from pinned upstream

No target game gets a fork on GitHub.

Black 2/White 2 runs unmodified. The tool controls it from outside by writing into its memory, for example by placing command blocks where the game's own battle client already reads them. pokebw2 is used only to know where things sit in memory. Our own C code, injected into free RAM while the game runs, is the fallback if memory writes alone can't do something.

pokeemerald-expansion has to be built as a ROM, because its modern content doesn't exist in retail Emerald. The build takes a pinned upstream commit plus our own files and a short list of changes kept in this repo, and is shipped as a patch (ADR 0002).

A later Gen 5 counterpart of the expansion (ADR 0003) would be built the same way, from a pinned pokebw2 commit. pokebw2 is GPL-3.0, so that ROM and our changes to it would be published under the GPL. This repo's own code stays MIT, which the GPL allows.

The reasons: no fork means nothing decompiled is republished under this project's name, which matters since Nintendo's 2026 takedown of the Rhythm Tengoku decompilation and its forks. It also means no fork to keep in sync with upstream.
