# Wave 1: M1 "First replay", from battle log to the expansion ROM in the browser

Issues #1 to #8 of milestone M1, built in issue order (user, 20.11.2026: "build the issues in order"), in five stages. Each stage goes to `master` in its own pull request:

- #9 (S1, merge 2002665, 21.11.2026, closes #1)
- #10 (S2, 692773a, 21.11.2026, closes #2, #3, #4)
- #11 (S3, 55ff879, 21.11.2026, closes #5)
- #12 (S4, merge 1144628, 21.11.2026, closes #6, #7)
- #13 (S5, merge 539f662, 21.11.2026, closes #8)

`wave/01` started from `master` at ec8d645 (the design docs) on 20.11.2026. The working files sit under `.waves/01/` (gitignored); this booking keeps what lasts.

## Goal

One real ADV OU singles replay plays start to finish in a pokeemerald-expansion ROM, watched on a bare page served from devbox over Tailscale: the intro and send-outs, move animations with their text, HP bars at the logged percentages, switches, faints, status, stat changes, weather and the closing win message (plan, Roadmap 1).

## Delivered

### S1, lane a: project setup (#1)

- TypeScript 6.0 on Node 24 with project references and strict settings, ESLint with the ceilings and import zones of `AGENTS.md`, Prettier, knip, lefthook, vitest with coverage, and CI running `npm run check` on every pull request.
- A bare page in `src/web/` under Vite, and the workflow files: `AGENTS.md`, `CLAUDE.md`, the agent roles in `.claude/agents/`.

### S2, lane a: test replays and the battle script (#2, #3)

- Five ADV OU tournament replays from Showdown's replay search as fixtures (`smogtours-gen3ou-994052`, `-994086`, `-994128`, `-994141`, `-994176`). Together they hold switches, drags, Baton Pass, faints, all five statuses, stat changes, rain and sand, Spikes and Rapid Spin, crits, misses, nicknames and both endings.
- `src/script/` turns a battle log into the game-neutral battle script on `@pkmn/protocol` and `@pkmn/client`. Each log line becomes events, folds into the hit it belongs to, or becomes a dropped line with its reason, exactly once. A snapshot per replay and a line count guard it.

### S2, lane b: the expansion build (#4)

- `npm run rom:build` builds pokeemerald-expansion 1.17.2 (79dd436) from a clone in `.cache/rom/`, with our patch series and our C files, and writes the ROM, a BPS patch against the user's US Emerald and `replay-slot.json` to `build/rom/`. Git tracks none of them.
- The replay slot: 128 KiB at ROM offset 0x3000, placed through upstream's own `KEEP_SECTION` (ADR 0008).
- `src/patch/`: our BPS codec, shared by the build and the page.
- `npm run rom:repro` builds twice from clean and compares. Every recursive delete in the build scripts goes through one guard that allows only paths inside `.cache/rom/` and `build/rom/`.

### S3, lane a: the Gen 3 game backend (#5)

- `src/gen3/` turns a battle script into instruction stream v1: a header with the version first, both trainers and their teams, then one instruction per step.
- `npm run gen3:tables` generates the species, move, ability, item and trainer pic numbers and the expansion's counts from the pinned tree. A spec ties the tables to `build.json`'s commit, and a devbox spec regenerates and compares them.
- Each line is finished text in the expansion's own wording (S3-1). 151 templates each name the expansion string they copy, and a devbox spec checks them against the pinned `battle_message.c`, which stays out of the repo (S3-2).
- `replay_stream.h` is the C side of the format; a spec holds both sides equal. The decoder refuses every stream the ROM refuses.

### S4, lane b: the ROM interpreter and its tests (#6, #7)

- Three patches to upstream, a few lines each: the interpreter takes over the battle main loop after the intro (0001), the HP numbers stay hidden (0002), and the ROM boots straight into the replay with no title screen, save file or button press (0003). The rest lives in our files under `rom/gen3/`.
- The interpreter checks the whole stream, then plays the 18 ops of v1 through the expansion's battle controllers and holds the last scene after END. A refused stream shows a dark red screen.
- `npm run rom:check` runs the expansion's headless test runner over our 80 tests, with upstream's matchers.
- `npm run rom:shots` plays streams in headless mGBA through libmgba and checks nine scenes per replay with pixel probes.

### S5, lane b: the dev page (#8)

- The page reads the user's US Emerald in the tab, checks its SHA1, applies the patch, builds the stream of a test replay or of a replay link from replay.pokemonshowdown.com, writes it into the slot and runs the ROM in `@thenick775/mgba-wasm`. It lists every line the game does not show.
- The dev server sends COOP and COEP and serves only the patch and the slot description from `build/rom/`; the built ROM and the user's dump stay unreachable.
- The ROM stays in memory: no IndexedDB, no autosave, no save state.
- A Playwright e2e runs on devbox (S5-4), and a tester played the page in a real browser.

## Evidence

- `npm run check` on the merged branch after each stage: S2 362 specs, S3 735, S4 841, S5 999. From S3 on, another 138 specs skip, because they need the pinned tree. Coverage of `src/script/`, `src/gen3/` and `src/patch/` stays above 98 % of lines and branches.
- Reproducible build (S2): two clean builds, the second in a fresh worktree, gave ROM SHA1 `7d80a8116fcfa7c10c431c423405e628f0068c84` (1 h 36 min). That build had an empty patch series.
- The ROM at the wave's end: SHA1 `4f825a8028e3dbabef2f90a62c0f15882aa996da` with patches 0001 to 0003; patch 18 389 774 bytes, round trip passed.
- `npm run rom:check`: 80 of 80. The first run builds the test tree in about 20 minutes on devbox; later runs take seconds.
- `npm run rom:shots`, each replay from boot to END with every scene passing:

  | Replay | Instructions | Frames  | Wall time |
  | ------ | ------------ | ------- | --------- |
  | 994052 | 461          | 39 564  | 45 s      |
  | 994086 | 1041         | 93 863  | 108 s     |
  | 994128 | 1040         | 89 373  | 106 s     |
  | 994141 | 1088         | 95 830  | 109 s     |
  | 994176 | 1807         | 152 686 | 163 s     |

- The page's e2e on devbox, on the final tree: 6 of 6 in 43 s. The tests cover the headers, the replay list and a 390 px page with no sideways scroll, the line on a page without the headers, a wrong file refused before the patch download, 994052 in the emulator with a second Start for 994086, and Load by link against a routed Showdown answer. The last test checks the status line after a new pick.
- The tester's run on the merged tree, headless Chromium at 1×, with the user's dump:
  - 994052 plays from Start to the win line in 11 min 2 s and matches its snapshot: the intro, every move with its animation and line, every switch, faint, status and stat change, sand and rain.
  - Read in all 393 frames, each HP bar shows the logged percentage of 48 pixels rounded down. The near HP numbers never show.
  - Restart brings the intro back within 4 s. A second Start runs 994086 with no page error.
  - The tester saw only same-origin GETs, plus Showdown's for a link. IndexedDB and local storage stayed empty.
  - The run found one broken path: after a failed Load, Start refused the replay the page still showed (S5-7).

## Decided without the user

Each entry gives the scene, the options, the choice and what a reversal costs.

### S1

- S1-1 Stage pull requests. `wave/01` kept moving while stage 1 waited for its okay. (a) a branch frozen at each stage's end, (b) the wave branch itself, which collects later stages. Chosen (a); `AGENTS.md` says so. Reversal: one line.
- S1-2 The pure zone. `src/script/` and `src/gen3/` (later `src/patch/`) may use `TextEncoder`, `TextDecoder`, `URL`, `URLSearchParams` and `structuredClone`, and no other browser global. Reversal: one list in `eslint.config.js`.

### S2

- S2-1 A hit's crit and effectiveness fold into the hit, because the expansion prints them after the HP bar. (a) separate events, (b) folded. Chosen (b). Reversal: `hits.ts` and five snapshots.
- S2-2 `@pkmn/client` 0.7.4 pins `@pkmn/data` ^0.10, so npm nests 0.10.15 under it beside our 0.11. Accepted; types and runs pass. Reversal: pin data and dex to 0.10.
- S2-3 We store the fixtures as Prettier formats them; their parsed content equals the download. Reversal: a `.prettierignore` line and a fresh download.
- S2-4 A line the script cannot handle becomes a dropped `unsupported` line at run time instead of an error, so a public replay with Transform still plays. Specs still fail on it. Reversal: one throw.
- S2-5 994052 is the page's first replay. Reversal: one name.
- S2-6 The slot sits in `.text.consts` through `KEEP_SECTION`, 128 KiB, with no upstream edit. Reversal: two linker hunks and one constant.
- S2-7 The BPS codec is ours, in a pure folder with no Node import, so the page reuses it. Reversal: move one module.
- S2-8 A build on the shared devbox waits until 4 GiB are free, then runs make with three jobs. (a) wait, (b) start at once and risk earlyoom killing another session's browser, (c) ask. Chosen (a). Reversal: one setting.
- S2-9 Splash (`|-nothing`) stopped the script. (a) an event with no Pokémon that the game shows as "But nothing happened!", (b) a dropped line, (c) keep the error. Chosen (a). Reversal: one branch.
- S2-10 An undocumented variable could steer the build's deletes outside `.cache/rom/`. (a) drop it and guard every delete, (b) keep it with checks. Chosen (a). Reversal: one lookup.

### S3

- S3-1 Battle text. ADR 0005 quoted vanilla Emerald's "Foe SKARMORY used SPIKES!"; the pinned expansion prints "The opposing Skarmory used Spikes!". (a) the expansion's wording for every line, (b) vanilla's. Chosen (a); ADR 0005 quotes the new line. Reversal: the phrase modules and five snapshots.
- S3-2 The expansion has no license file. (a) our own templates, each naming the expansion string it copies and checked on devbox against the pinned source, nothing of it committed, (b) read the strings at build time. Chosen (a). Reversal: the phrase modules.
- S3-3 The intro line. The plan said "would like to battle!", which the expansion does not have; it prints "You are challenged by Bob!". (a) the expansion's line, (b) our own. Chosen (a); the plan follows. Reversal: one template.
- S3-4 Tables as committed JSON tied to the pin; the stream's enums ours; HP on the log's scale of 100; a party nickname cut to 12 characters and full in text; "X won the battle!" in our words; Brendan and May as trainer pics in M1; a missing move animation falls back to the lowest-numbered move of the same type and category; formats newer than Gen 3 refused until M3. Each as recommended. Reversal: one module each.
- S3-5 Leftovers. The expansion shows an item pop-up without text; stream v1 has no pop-up op. (a) keep a text line for M1, (b) add an op. Chosen (a). Reversal: one op on both sides.
- S3-6 Perish Song's silent counters in 994176 have no op in v1, and the game shows nothing for them either. (a) list them as fallbacks, (b) add an op. Chosen (a). Reversal: one op.
- S3-7 Event order follows the pinned battle scripts where the plan's sketch differed (a status: animation, text, then the icon). Rest always prints "slept and restored its HP!", as the pinned script does.
- S3-8 The review found streams the decoder took and the ROM refused. (a) add the checks, with the expansion's counts generated from the pin, (b) narrow the claim. Chosen (a). Reversal: each check drops alone.
- S3-9 "Content gap": the glossary counts a mechanic the game lacks as one; the predicate left it out. (a) rename the predicate, (b) change the glossary. Chosen (a). Reversal: one rename.

### S4

- S4-1 S4 started from the S3 branch after its format step, so the hour-long test-tree build overlapped S3's text and translation steps. Reversal: none; S4 merged `wave/01` back in before its own merge.
- S4-2 One call in `BeginBattleIntro` hands over the main loop; the interpreter reuses the expansion's intro up to its text; a recorded link battle scrolls text by itself; the last scene holds after END; our own test runner uses upstream's matchers; a libmgba screenshot tool with pixel probes (an apt package); a plain refusal screen. About five upstream lines in three patches. Reversal: per item.
- S4-3 Upstream code in our C files. The reviewer found no copied function body, only short call sequences (a battle teardown that repeats the test runner's calls, one bit expression, the shape of upstream's `TEST` macro) and patches with three lines of context. (a) keep them as use of the engine's API, (b) rewrite them. Chosen (a). Reversal: a rewrite of a few functions.
- S4-4 The build copied our files with their old timestamps, so make could link a stale object. (a) fix now: copy only changed files and give them the current time, (b) a rest. Chosen (a). Reversal: none needed.
- S4-5 A switch after Baton Pass kept the old stages until the next move. The fix clears the last move at takeover and on each turn, with tests, and the same step closed the review's nine probe and assertion gaps.

### S5

- S5-1 S5 ran in the worktree that held the build outputs. Reversal: naming only.
- S5-2 The dev server plugin lives in `scripts/web-server.ts` with a spec. It serves only the two build files and keeps `/@fs/` away from the built ROM and every ROM file type. Reversal: one module.
- S5-3 The page never mounts the emulator's IndexedDB storage; the ROM stays in memory; autosave, restore and rewind are off; the keyboard is off; Restart resets the core. Reversal: one function each.
- S5-4 Tests without the user's dump: vitest with fakes and synthetic patches in CI, plus a devbox-only Playwright e2e that finds the dump by the build's rule and skips without it. Reversal: drop the e2e folder.
- S5-5 The replay link field is in M1; every dropped line and fallback is listed; SHA-1 through `crypto.subtle`; ports 5177 and 5178. Reversal: one module or line each.
- S5-6 The review found four wrong claims and two unclear ones; one fix step closed them, test first. The page checks the dump's SHA1 before it fetches the patch, so a wrong file costs no 18 MB download. The insecure-context line names `localhost` on devbox and the `tailscale serve` route. A `/rom/` file that vanishes mid-read answers 404. The deny list covers only the repository's own `build/` and `.cache/`, so `@pkmn`'s build folders load again. The e2e now checks that the build holds patch 0003, audits every request and covers Load and a second Start. That second Start caught mGBA's audio callback dividing by zero after `quitGame`; the page clears the callback first. Reversal: each fix drops alone.
- S5-7 A failed Load blocked Start: the session kept the failed pick as the current one. (a) a failed pick of either kind leaves the earlier one in place, (b) only a failed replay pick does, (c) the page clears its replay view on a failure. Chosen (b): the page still shows the earlier replay, so Start runs it, while a refused dump stays picked because the file input shows it. Reversal: one rule in `session.ts`.
- S5-8 The lane fixed the tester's page findings: the broken Load, an unclear word in the refusal, and the canvas overflowing a 390 px phone. The tester's findings in the ROM and the backend became rests R13 to R19, because #5 and #6 are closed and a new issue needs the user's approval. Reversal: none.

## Gate

After the gate on 21.11.2026:

| Stage | Lane | Issues | Pull request | State after the gate |
| ----- | ---- | ------ | ------------ | -------------------- |
| S1    | a    | #1     | #9           | merged, 2002665      |
| S2    | a    | #2, #3 | #10          | merged, 692773a      |
| S2    | b    | #4     | #10          | merged, 692773a      |
| S3    | a    | #5     | #11          | merged, 55ff879      |
| S4    | b    | #6, #7 | #12          | merged, 1144628      |
| S5    | b    | #8     | #13          | merged, 539f662      |

The preview needs HTTPS or `localhost`, because mGBA runs on `SharedArrayBuffer`. The user chose `tailscale serve` (D1 (a), 21.11.2026). The tailnet had no HTTPS certificates at the gate, so the preview ran at `localhost` on devbox only.

The gate asked the user to merge #12 and #13, to pick the preview route, to rule on the rests and to settle R19. The user answered "1a 2a 3a 4a 5a" on 21.11.2026:

1. #12 merged at a0ab9a0 (merge 1144628).
2. #13 merged at fc06a2d (merge 539f662). Milestone M1 has no open issue left.
3. The user turns on HTTPS Certificates in the tailnet. Then the dev page runs behind `tailscale serve` for the user's own look.
4. The rests became issues: R1 to R7 and R13 to R17 approved for M2 (R16 as a larger bug), and R8 to R12, R18 and R20 parked with their triggers. The list below names each issue.
5. R19: the game keeps Showdown's "xXEricXx forfeited.", which names who forfeited. No issue.

## Rests

Proposals for issues, ruled at the gate (answer 4a). Each line names its issue.

- R1 (#14, high, M2): a stat boost already at +6 (Calm Mind, Curse) makes Showdown log a zero-stage boost, and the backend fails the whole replay. Common in Gen 3 OU; none of the five test replays has one.
- R2 (#15, M2): multi-hit moves (`-hitcount`: Rock Blast, Double Kick) show one unsupported line each.
- R3 (#16, M2): Wrap and Fire Spin damage (`[partiallytrapped]`) is dropped as unsupported.
- R4 (#17, M2): the patch is 18.4 MB (14.7 MB with xz): the public tool's download size.
- R5 (#18, M2): order rules for the instruction stream; today a stream that moves before its send-out passes both validators. The backend never writes one.
- R6 (#19, M2): an item pop-up op, so Leftovers shows as the expansion shows it.
- R7 (#20, M2): trainer pictures from the Showdown avatar, a battle background, victory music and an outro.
- R8 (#26, low): the script's `-activate` guard for a third argument; `lockedmove` in `calledBy`; `-formechange`.
- R9 (#27, low): a print after the win line, and an empty `|-message|`, fail the replay loudly; a drop check per event instead of per line.
- R10 (#28, low): the tree spec does not look inside zipped dumps; a pre-commit hook for it.
- R11 (#29, low): glossary words for team list, hit folding and weather phase.
- R12 (#30, low): a refusal screen with text in the ROM; the B button quits a held replay to a black screen in the emulator (the page turns the keyboard off).
- R13 (#21, M2): the intro's ball display shows a Pokémon the log never revealed as an empty slot (994052: `teamsize` 6, five revealed). The ROM sets up only the revealed Pokémon.
- R14 (#22, M2): weather that an ability starts (Sand Stream, Drizzle) shows its pop-up and line but no weather animation; the expansion plays one after the text.
- R15 (#23, M2): a move that fails at once (`-fail` after `move`: Thunder Wave on a paralyzed target) still plays its animation; the game skips it.
- R16 (#24, M2, larger bug): Suicune turns solid blue for about 2 s during the faint line after a Surf KO (994052 lines 355 and 369). Cause unknown.
- R17 (#25, M2): after the win line the status still says "Running …"; the page could read the ROM's progress and say the replay ended.
- R18 (#31, low): a chat line's raw HTML shows as written in the "Not shown" list (994086, row 268).
- R19 (question, settled by answer 5a: kept): "xXEricXx forfeited." is Showdown's own `-message` line, which the game prints as written; the expansion's line is "The match was forfeited." (S3-1 chose the expansion's wording for lines it has).
- R20 (#32, low): when a test replay's file fails to load, the select stays on the failed replay while the summary shows the earlier one.
