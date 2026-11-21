# Battle text: the game's own messages where it can print them, finished text otherwise

**Black 2/White 2**: battle messages use the game's own message banks. The battle client already prints a message from a message ID plus its arguments, so the game's exact wording costs no ROM code. Only lines BW2 has no message for come from outside as finished text in BW2's style: Showdown's custom messages, clauses, forfeits, and effects of later generations.

**Gen 3 (pokeemerald-expansion)**, as a starting point to revisit when Gen 3 begins: the game backend writes every message as finished text in the game's own phrasing and character set ("The opposing Skarmory used Spikes!"), and the renderer prints it as is. Wave 01 took the pinned expansion's wording for every line it shows, and a spec checks each line against the pinned sources. Gen 3's message templates are filled from battle engine state, which the renderer doesn't run, so using them would need our own ROM code for every message type.

On every target game, battle log lines with no in-game equivalent become plain text in the same style. Chat and timer lines are not shown in the game. English only at first: other language versions have different memory addresses.
