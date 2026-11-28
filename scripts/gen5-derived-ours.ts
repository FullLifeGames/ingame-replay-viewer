// The derived numbers of the table (scripts/gen5-derived-table.ts) that our code fixes: equal on
// both sides whatever pokebw2 holds, so the derivations' check (scripts/gen5-derived.ts) skips
// them by derivation, check and role key. Each carries its reason.
import { orderOffset } from '../src/gen5/routine-order.ts'
import type { OursDerived } from './gen5-derived.ts'

const ROUTINE_RUNS = ['takeover(ENTRY)', 'park(ENTRY)', 'directEntry(ENTRY, GAUGE)']
const COUNTS = ['partyChecks(ENTRY)', 'park(ENTRY)', 'directEntry(ENTRY, GAUGE)']

const ROUTES = ['newGameRoute(PLACES)', 'continueRoute(TRAINER)', 'trainerRoute(PLACES, TRAINER)']

/** The derived numbers that our code fixes, equal on both sides whatever pokebw2 holds. */
export const OURS_DERIVED: readonly OursDerived[] = [
  {
    derivations: ROUTINE_RUNS,
    check: /^routine code at \d+$/,
    key: 'oneOf',
    reason: "the routine's code words: ROUTINE is our build, the same on both sides",
  },
  {
    derivations: ROUTINE_RUNS,
    check: new RegExp(`^routine block at ${String(orderOffset('go'))}$`),
    key: 'oneOf',
    reason: "the block's go word, which the page writes clear before the routine runs",
  },
  ...['oneOf', 'noneOf'].map((key) => ({
    derivations: ROUTINE_RUNS,
    check: /^stage$/,
    key,
    reason: "the routine's stages, ROUTINE_STAGES of our C file",
  })),
  {
    derivations: ROUTINE_RUNS,
    check: /^manager\.queued$/,
    key: 'noneOf',
    reason: 'a queued proc: the word holds no null pointer',
  },
  {
    derivations: COUNTS,
    check: /^(player|opponent)\.party\.count$/,
    key: 'oneOf',
    reason: "a side's count: empty before the park, the parties' length after it",
  },
  {
    derivations: ['battleRefs(CHECK_NUMBERS)'],
    check: /^(sCommMode|returned)$/,
    key: 'oneOf',
    reason: "the battle checks' clear words: a local battle, a command not yet answered",
  },
  {
    derivations: ['replayPlan(REPLAY_NUMBERS, ADAPTER_LAYOUT)'],
    check: /^returned$/,
    key: 'value',
    reason: "the write that hands a block over clears returned, as BtlAdapter_SetCmd's last step",
  },
  {
    derivations: ROUTES,
    check: /^(player|field) [xz]$/,
    key: 'address',
    reason: "the player's tile, read at addresses of the routes' own (route.ts, trainer-route.ts)",
  },
  ...['oneOf', 'atMost'].map((key) => ({
    derivations: ROUTES,
    step: /^(lookout-row|plaza|stairs-foot|lookout-top|gate-column|gate-road)$/,
    check: /^player [xz]$/,
    key,
    reason: "a row or a column of the routes' own, read from RAM on the way, not generated",
  })),
  {
    derivations: ['partyRefs(PARTY_NUMBERS)'],
    check: /^(near|far)\.slot\d+$/,
    key: 'address',
    reason: "a slot's address, read from the run's RAM: the same start on both sides",
  },
]
