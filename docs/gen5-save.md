# The Gen 5 save before a trainer

`src/web/gen5/saves/route-20.sav` is a battery save of Black 2 (USA), played from New Game on the build machine for the Gen 5 page (#78). The page loads it into melonDS before the game starts, so Continue puts the player two tiles from a trainer, and a short macro walks into his battle. ADR 0002 lets the file ship: a save holds player data alone. It is the one kind of game file the tracked tree may hold.

## The trainer

Youngster Terrell on Route 20. He fits the three rules of #78, read in pokebw2 by file and symbol:

- A single battle against one trainer. His record `res/trainers/data/youngster_terrell.json` sets `battle_style` to `BTL_STYLE_SINGLE`, with one Pokémon in his party. A double pair would name a partner through `GetPairMember2SCRIDFromTrainerID` (`src/field/script/trainer_script.c`); he has none.
- A regular class with the standard music and intro. His class is `TRAINER_CLASS_YOUNGSTER`. `EventBattleCall_DecideEnvTrainer` (`src/field/effect/enceff.c`) gives a trainer battle `SEQ_BGM_VS_TRAINER` and the encounter effect of the ground under the player, unless the class is one of `SPECIAL_TRAINER_CLASSES` (`src/system/tr_tool.c`, read through `GetTrainerClassSpecialId`). The Youngster is not among them, and his approach theme in `TRAINER_CLASS_RESOURCES` is one of the plain ones.
- A sight line the player enters within a few steps. In `res/field/events/route_20.json` he is an NPC of type `ACTOR_EVENT_TYPE_TRAINER`: he stands still, faces up and looks across the road from Floccesy Town. His script names him as a trainer through `GetNPCTrainerIDFromSCRID` (`src/field/script/trainer_script.c`). He is the first trainer on that road.

## Where the player stands

On Route 20, on the dirt road from Floccesy Town, two tiles west of the column Terrell looks up, facing east. The hiker who turns back a player without a badge stands further east. Two tiles east after Continue bring the player into Terrell's sight: he walks up, speaks, and the battle starts with "You are challenged by Youngster Terrell!" and then "What will Tepig do?".

## What the save holds

- The party: Tepig, which won the rival battle.
- The player IRV, a boy, and the rival Hugh, the name the game offers.
- The record at Continue: no badge, Pokédex 2, play time 0:14.
- The options: text speed fast, battle scene on, battle style shift, sound stereo.
- No C-Gear yet, so Continue asks no question about it. The season card "SPRING" slides out after Continue.

## The steps by hand

These steps follow the scenes that the build machine's macro played (below). Nobody has played them by hand yet. Anyone with their own dump can try them on the Gen 5 page:

1. New Game. Through Professor Juniper's talk, answer that you are a boy, name the player IRV and keep the rival's name Hugh.
2. In Aspertia City follow the story to the lookout: Hugh's talk, then Bianca's. Say yes to her Pokédex request, take Tepig and give it no nickname.
3. Win the battle against Hugh.
4. Follow Bianca's tour of the Pokémon Center, then Mom's scene with the Running Shoes and two Town Maps, one of them for Hugh.
5. Go north through the gate (the guard gives a Potion) onto Route 19. Watch Bianca's capture demo and meet Alder.
6. Follow Alder into Floccesy Town and up to his house. He sees the two Town Maps and sends the player along the road to Route 20, where Hugh trains.
7. Walk east along that road into Route 20 and stop two tiles west of Terrell's column, facing east.
8. In the field menu set the text speed to fast in Options, then Save.

## How the build machine made it

The spike's route (`src/gen5/route.ts`) played from New Game to the rival battle's action menu in pieces, each run starting from a state that an earlier run saved. From there `src/gen5/trainer-route.ts` played the battle and every step above to the save, and `scripts/gen5-route.ts --route trainer --take-save route-20` read the file out of the core once the game had written it. The play from the rival battle's menu to the save took 28,387 frames, and the game had saved 61,957 frames after New Game.

The stretch before the rival battle rests on states made under earlier versions of the spike's route (`docs/gen5-spike.md`, "Into a battle"). A remake from boot plays other frames, so it gives another file with another hash.

## The clock

The page's fixed clock (`src/gen5/clock.ts`) starts at noon on 1 January 2000 on every boot. The game saved under it, the save's record shows 1/1/2000, and the page loads it under the same clock.

## The file

`src/web/gen5/saves/route-20.sav`

- SHA-256: `2edd12a4f81aa942340f483e1441ba3c0adcb80a70cf302bdb8e71c678e9cf66`
- Size: 524288 bytes

`scripts/gen5-save-record.test.ts` holds both lines to the committed file, and `scripts/rom-tree.test.ts` refuses a save anywhere else in the tracked tree.

## What never joins it

States, frames, the dump or anything about it, a save from anywhere but our own play from New Game, the other saves of `build/gen5/saves/`, and pokebw2's numbers.
