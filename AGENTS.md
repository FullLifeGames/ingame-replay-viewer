# AGENTS.md

Rules for agents working on the Ingame Replay Viewer. Claude Code reads this file through `CLAUDE.md`.

- `GLOSSARY.md` names every concept.
- `docs/adr/` holds the decisions, and `docs/plan.md` holds the other decisions and the roadmap.
- Every task is a GitHub issue. The milestones are the roadmap steps, and the board "Ingame Replay Viewer" (project 3) carries the wave in hand.

## The project

The viewer plays Pokémon Showdown replays back inside real Pokémon games. A game backend turns each replay into an instruction stream that the target game plays: pokeemerald-expansion first, then Black 2/White 2.

- `src/script/`: battle log to battle script (game-neutral), plain TypeScript.
- `src/gen3/`: the Gen 3 game backend (battle script to instruction stream), plain TypeScript.
- `src/web/`: the pages and the emulator.
- `rom/gen3/`: our C files and the list of changes against the pinned pokeemerald-expansion. The build scripts are `scripts/rom-*`. The upstream checkout (`.cache/rom/`) and the build outputs (`build/rom/`) stay out of the tracked tree.
- `rom/gen3/wasm/`: the WebAssembly build (#35, #43, `docs/wasm-spike.md`): its config, glue C files, shadow headers, our platform layer in `layer/` with its native test harness in `layer/host/`, and the patches against copies of upstream files. The build scripts are `scripts/wasm-*`. The outputs (`build/wasm/`) stay out of the tracked tree.
- `src/patch/`: the BPS codec that the build and the page share, plain TypeScript.
- `src/gen5/`, `src/web/gen5/`, `scripts/gen5-*`: the Gen 5 spike (#72, `docs/gen5-spike.md`), not a game backend. `src/gen5/` is plain TypeScript with no DOM and no Node; the page in `src/web/gen5/` runs Black 2 in EmulatorJS's melonDS. The spike's checkouts and outputs (`.cache/gen5/`, `build/gen5/`) stay out of the tracked tree.
- `src/web/gen5/saves/`: the saves we made from New Game, the one kind of game file the tree may hold (ADR 0002, #78). `docs/gen5-save.md` records each one.
- `test/fixtures/replays/`: the test replays as Showdown's replay JSON. Unit specs sit next to their source as `*.test.ts`.
- `docs/waves/`: one booking per wave.

## Working with the user

- The user writes in English and often dictates, so a word can arrive misheard. Confirm an odd name or an answer that reads two ways before acting on it.
- Code, comments, docs, commit messages, issues and pull requests are in English.
- Gates: numbered questions, a short scene per question, options a/b/c in one or two sentences each, the recommendation marked, answer format "1a 2a 3a".
- Gate questions reach the user as a review page (user, 21.11.2026, as in ps-dashboard-2): a private Artifact with only the open questions, one card per question with its scene, the options, the recommendation marked and a note field. The page stores each answer with the `db` capability, one document per question under `answers/<id>` with `choice`, `note` and `at`, and shows the answer line with a copy button as a fallback. One free-text field after the last question stores `answers/_free` with `note` and `at`, for feedback that fits no question. The chat carries the link and one line on what is open. Once the user says the page is filled, the integrator reads the answers from its store and records them in the booking.
- Every gate and every decision put to the user comes as a review page with things to show (user, 24.11.2026): links the user opens on their own devices over Tailscale, such as a gallery of frames, a preview of the page or a running spike. Each question whose subject shows on screen carries pictures of it on the page, for the user to approve what they see, and names what else to look at. The pictures go on the private page alone, never into the repository (ADR 0002). The links stay in the chat and out of tracked files.
- Detail questions do not stop a wave. The integrator decides them by the recommendation and records each in the booking's section "Decided without the user": the scene, the options, the choice and what a reversal costs. A blocker that no recommendation settles goes to the user.
- Tracked documents and every user-facing string go through the `stop-slop` skill. Exceptions: technical invariants with "never" or "always", and quotes of program output.
- Commits: English, imperative, no attribution lines (no Co-Authored-By, no "Generated with"). The same holds for issues, pull requests and comments. Write messages with quotes to a file and use `git commit -F <file>`.
- The repository is public. Pushing wave and lane branches and opening their pull requests is part of this workflow (user, 20.11.2026). A merge into `master` needs the user's okay, and an okay covers the named state only. Deleting branches or files you did not create, and any release or deploy, each need an okay of their own.
- Never commit a ROM, a savestate, a built ROM, a patch, or anything extracted from a ROM (ADR 0002). The user's dumps live in `~/roms/`.

## Rules for the code

- Species, moves, abilities, items and rules come from the @pkmn libraries (`@pkmn/protocol`, `@pkmn/client`, `@pkmn/dex`, `@pkmn/data`). Our code reads library data and never lists names by hand. A mapping to a target game's own numbers is generated from that game's pinned sources and checked by a spec.
- `src/script/`, `src/gen3/`, `src/gen5/` and `src/patch/` import no DOM, no browser API and no emulator, and `src/patch/` and `src/gen5/` import nothing from Node; the import zones in `eslint.config.js` hold it.
- No silent drops: every battle log line becomes events or a dropped line, and an unknown line fails the specs.
- Formats that cross into the game carry a version: the instruction stream starts with one, and the ROM interpreter refuses a version it does not know.
- One rule lives in one module; every other place imports it.
- Ceilings for TypeScript: 300 lines per file, 60 per function, complexity 10, depth 3, 4 parameters. Split a file instead of exempting it. Specs keep the file ceiling and drop the function ceiling.
- C code in `rom/gen3/` follows the expansion's own style. Changes to upstream files stay as few and small as the work allows; new behaviour goes into our own files.
- Dependencies track their latest registry versions. Exception: TypeScript stays on 6.0 until typescript-eslint admits 7.x. A package joins `package.json` with the first code that uses it, because knip rejects unused ones.

## Checks before commit and push

- `npm run check` runs lint, `tsc -b`, the Prettier check, knip and the unit specs with coverage. Run it before every push; CI runs the same.
- Coverage of `src/script/`, `src/gen3/`, `src/gen5/` and `src/patch/` stays at 90 % of lines and branches or more.
- CI fetches pokebw2 at its pin (depth 1, partial and sparse: the files in `POKEBW2_FILES` alone), generates `build/gen5/bw2.json` with `node scripts/gen5-bw2.ts --quiet` and runs the Gen 5 code on it in `scripts/gen5-bw2-real.test.ts`. Without the file that spec skips on your machine and fails under CI. CI's log is public, so the quiet report and the spec's assertions show no number of pokebw2. The fallback, a committed table, goes to a gate when CI cannot fetch the pin on two runs at least a day apart, or when the fetch and the generator add more than 30 s to the check job (the median of five runs against the five before).
- Test first: a red test that fails for the right reason, then the code.
- lefthook runs Prettier and ESLint on staged files before each commit.
- devbox: one heavy check at a time (the full suite, a ROM build, the expansion's `make check`, e2e, a dev server for a tester). Vitest runs with at most 4 workers. Long runs go to the background. Another session may share the machine: read `free -g` before a heavy run.

## Change classes

Every change gets a class before work starts: the integrator proposes it, and the user can move it.

| Class      | What it is                                             | Process                                                             |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Small fix  | A bug or small task with a known cause and a local fix | Red test, fix, green; collected in a batch wave                     |
| Larger bug | The cause is unclear or spans modules                  | A written diagnosis first, then its issue, then the fix, test first |
| Feature    | New behaviour for the viewer                           | An issue inside a wave                                              |

## Issues and the board

- Every task is an issue with acceptance criteria. Its labels give its status (`approved`; `parked` with its trigger in the text; `needs triage`), its class (`small fix`, `larger bug`, `feature`) and its area (`area: script`, `area: gen3`, `area: rom`, `area: web`, `area: gen5`, `area: tooling`, `area: docs`). Its milestone names the roadmap step.
- The board gives each issue its Status (Approved, In wave, Gate, Done), its Wave and its Lane.
- A new issue needs the user's approval at a gate. A report from elsewhere stays at `needs triage` until a gate rules on it.

## Waves

- A wave runs as stages with no gate between them. A stage holds at most two lanes side by side; a stage that the rest depends on holds one. Each lane owns one issue or a few, its own branch, worktree and files, and runs planner, builders, reviewer and fixes before it merges.
- Branches: `wave/NN` from `master`. A stage's lanes branch from it as `wave/NN-s<k>a` and `wave/NN-s<k>b`, in the worktrees `~/code/ingame-replay-viewer-wa` and `-wb`, each with its own `node_modules`.
- A lane merges into the wave branch after its review. Each stage reaches `master` through a pull request that closes the stage's issues (`Closes #N`); CI runs on it. Its head is the wave branch frozen at the stage's end as `wave/NN-s<k>` (a one-lane stage uses its lane branch), so later stages stay out of a pull request that waits for its okay.
- The integrator queues heavy checks and runs one at a time.
- A wave ends with one gate: a table over its stages and lanes, the decisions taken without the user, and, once there is a page, a preview link on devbox over Tailscale (`tailscale ip -4`).
- Booking: `docs/waves/wave-NN.md` (goal, delivered, evidence, decided without the user, gate, rests). Documentation moves with the change in the same pull request.
- Rests become issue proposals at the gate; only approved ones become issues.

## Agents

- Roles in `.claude/agents/`:
  - `wave-planner`: plans a step that needs judgment; no commit.
  - `wave-builder`: builds one step, test first.
  - `wave-reviewer`: checks claims against the code.
  - `wave-scout`: finds and counts.
  - `wave-tester`: tries a page in a real browser.
- One fresh agent per step. It starts from the wave's brief, the lane's plan and ledger, and `git log`, and writes its step into the ledger before it stops.
- Briefs, plans and ledgers live in `.waves/NN/`, which is gitignored; the booking in `docs/waves/` keeps what lasts.
- Never sleep or poll for a result; a background task or a monitor reports the end.
