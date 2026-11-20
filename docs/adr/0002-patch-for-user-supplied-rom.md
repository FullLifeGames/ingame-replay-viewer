# Distribute a patch for a user-supplied ROM; never host ROMs

The public tool on fulllifegames.com/Tools/ asks each user once for their own base ROM and runs the emulator in the page. For pokeemerald-expansion it applies the patch in the browser first; Black 2/White 2 runs unmodified (ADR 0007). No ROM, and no ROM with the patch already applied, is ever hosted or distributed: the games' code and assets belong to Nintendo, which takes down sites that host them. Patches applied to a user-supplied ROM are how the ROM hacking scene publishes its work.

Savestates count as ROM-derived, because they hold the game's RAM, including code loaded from the ROM. They are never hosted or shipped either. Any savestate the tool needs is built in the user's browser from their own ROM, plus a save file if needed. A save file holds only player data and may be shipped.
