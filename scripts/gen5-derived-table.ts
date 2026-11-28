// The derivation table of the check (scripts/gen5-derived.ts says why): one row per derivation
// that the specs run on a fixture, by its name, the exported functions it runs, the function on
// the fixture and the same function on build/gen5/bw2.json. The inputs come from fixtures modules,
// so the row runs what the specs run; the inputs of ours (the routine's build, the parties' bytes,
// a PID, an adapter's address) are the same on both sides. The numbers equal by construction
// stand in scripts/gen5-derived-ours.ts.
import { type AdapterNumbers, adapterNumbers } from '../src/gen5/adapter.ts'
import { ADAPTER_LAYOUT } from '../src/gen5/adapter.fixtures.ts'
import { printedCommand } from '../src/gen5/backend/printed.ts'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from '../src/gen5/backend/replay.ts'
import { REPLAY_NUMBERS } from '../src/gen5/backend/replay.fixtures.ts'
import { battleRefs } from '../src/gen5/battle-check.ts'
import { CHECK_NUMBERS } from '../src/gen5/battle-check.fixtures.ts'
import type { GaugeNumbers } from '../src/gen5/bw2-gauge-numbers.ts'
import type {
  Bw2Numbers,
  EntryNumbers,
  PkmNumbers,
  ServerCmdTable,
} from '../src/gen5/bw2-numbers.ts'
import { directEntry } from '../src/gen5/direct-entry.ts'
import { ENTRY, ROUTINE } from '../src/gen5/direct-entry.fixtures.ts'
import { park } from '../src/gen5/direct-park.ts'
import { partyChecks, partyWrites } from '../src/gen5/direct-party.ts'
import { takeover } from '../src/gen5/direct-takeover.ts'
import { gaugeChecks, hideWrites } from '../src/gen5/hp-numbers.ts'
import { GAUGE } from '../src/gen5/hp-numbers.fixtures.ts'
import { blockPlaces } from '../src/gen5/pkm-cipher.ts'
import { PKM, ROW_0_PID, ROW_2_PID } from '../src/gen5/pkm.fixtures.ts'
import { replayPlan } from '../src/gen5/replay-plan.ts'
import { armWrites, formattedCheck, pageWrites, textBox } from '../src/gen5/text-box.ts'
import { partyRefs } from './gen5-moment-party.ts'
import { PARTY_NUMBERS } from './gen5-moment-party.fixtures.ts'

/** A derivation: its name, the functions it runs as `file name`, the function on the fixture and
 * on the generated file, and the keys beyond the role keys whose numbers count. */
export interface Derivation {
  readonly name: string
  readonly functions: readonly string[]
  readonly ours: () => unknown
  readonly real: (file: Bw2Numbers) => unknown
  readonly keys?: readonly string[]
}

/** Two sides of an entry's parties, as many Pokémon as the specs write, of the layout's size. */
function partiesOf(entry: EntryNumbers) {
  const size = entry.layouts.PartyPkm?.size ?? 0
  const pkm = (seed: number) => Uint8Array.from({ length: size }, (_, i) => (seed + i) % 256)
  return { player: [pkm(1), pkm(2)], opponent: [pkm(3)] }
}

const NAMES = { player: 'Ann', opponent: 'Bo' }

/** The direct entry of `entry` with the gauge's hide of the HP numbers, after no battle check. */
const entryOf = (entry: EntryNumbers, hpNumbers: GaugeNumbers) =>
  directEntry(
    entry,
    ROUTINE,
    { names: NAMES, parties: partiesOf(entry), style: 'single', hpNumbers },
    [],
  )

/** The park of `entry` after its takeover. */
const parkOf = (entry: EntryNumbers) =>
  park(
    entry,
    takeover(entry, ROUTINE),
    { names: NAMES, parties: partiesOf(entry), style: 'single' },
    [],
  )

/** The adapter's numbers of the replay plan's spec: its layout, battle-check's commands. */
const OUR_ADAPTER = { ...adapterNumbers(CHECK_NUMBERS), layout: ADAPTER_LAYOUT }

/** The address at which the specs' adapter sits, and a pin of the replay; ours on both sides. */
const ADAPTER_AT = 0x02134000
const PIN = 'c0ffee'

/** The numbers a replay plan with a printed block reads. */
type PrintTable = ServerCmdTable & Pick<Bw2Numbers, 'text' | 'textBox'>

/** One party slot per side for the moment's refs, at addresses of the run's own. */
const PARTY_START = {
  near: { client: 1, slots: 0x02180010, mons: [{ monId: 20, species: 1 }] },
  far: { client: 2, slots: 0x02180100, mons: [{ monId: 40, species: 4 }] },
}

const BLOCKS = ['PkmBlockA', 'PkmBlockB', 'PkmBlockC', 'PkmBlockD']

/** The block places of the cipher spec's PIDs, and of one PID of each of the fixture's rows. */
const PIDS = [
  ROW_0_PID,
  ROW_2_PID,
  ...PKM.blockOffsets.map((_, row) => ((row << PKM.selector.shift) | 0x0005_0001) >>> 0),
]

const placesOf = (pkm: PkmNumbers) => PIDS.map((pid) => blockPlaces(pid, pkm))

const file = (path: string, name: string) => `${path} ${name}`
const GEN5 = 'src/gen5/'

export const DERIVED: readonly Derivation[] = [
  ...(
    [
      ['GAUGE', GAUGE],
      ['REPLAY_NUMBERS.gauge', REPLAY_NUMBERS.gauge],
    ] as const
  ).map(([label, gauge]) => ({
    name: `gaugeChecks(${label})`,
    functions: [file(`${GEN5}hp-numbers.ts`, 'gaugeChecks')],
    ours: () => gaugeChecks(gauge),
    real: (numbers: Bw2Numbers) => gaugeChecks(numbers.gauge),
  })),
  {
    name: 'hideWrites(GAUGE)',
    functions: [file(`${GEN5}hp-numbers.ts`, 'hideWrites')],
    ours: () => hideWrites(GAUGE),
    real: (numbers) => hideWrites(numbers.gauge),
  },
  {
    name: 'textBox(REPLAY_NUMBERS.textBox)',
    functions: ['textBox', 'armWrites', 'formattedCheck', 'pageWrites'].map((name) =>
      file(`${GEN5}text-box.ts`, name),
    ),
    ours: () => textParts(REPLAY_NUMBERS.textBox),
    real: (numbers) => textParts(numbers.textBox),
  },
  {
    name: 'takeover(ENTRY)',
    functions: [file(`${GEN5}direct-takeover.ts`, 'takeover')],
    ours: () => takeover(ENTRY, ROUTINE),
    real: (numbers) => takeover(numbers.entry, ROUTINE),
  },
  {
    name: 'partyChecks(ENTRY)',
    functions: [file(`${GEN5}direct-party.ts`, 'partyChecks')],
    ours: () => partyChecks(ENTRY, takeover(ENTRY, ROUTINE).layout),
    real: (numbers) => partyChecks(numbers.entry, takeover(numbers.entry, ROUTINE).layout),
  },
  {
    name: 'partyWrites(ENTRY)',
    functions: [file(`${GEN5}direct-party.ts`, 'partyWrites')],
    ours: () => partyWrites(ENTRY, takeover(ENTRY, ROUTINE).layout, partiesOf(ENTRY)),
    real: ({ entry }) => partyWrites(entry, takeover(entry, ROUTINE).layout, partiesOf(entry)),
  },
  {
    name: 'park(ENTRY)',
    functions: [
      file(`${GEN5}direct-park.ts`, 'park'),
      file(`${GEN5}direct-party.ts`, 'partyCounts'),
    ],
    ours: () => parkOf(ENTRY),
    real: (numbers) => parkOf(numbers.entry),
  },
  {
    name: 'directEntry(ENTRY, GAUGE)',
    functions: [
      file(`${GEN5}direct-entry.ts`, 'directEntry'),
      file(`${GEN5}hp-numbers.ts`, 'numbersSteps'),
    ],
    ours: () => entryOf(ENTRY, GAUGE),
    real: (numbers) => entryOf(numbers.entry, numbers.gauge),
  },
  {
    name: 'battleRefs(CHECK_NUMBERS)',
    functions: [file(`${GEN5}battle-check.ts`, 'battleRefs')],
    ours: () => battleRefs(CHECK_NUMBERS),
    real: (numbers) => battleRefs(numbers),
  },
  {
    name: 'replayPlan(REPLAY_NUMBERS, ADAPTER_LAYOUT)',
    functions: [
      ...['replayPlan', 'replaySteps', 'menuSteps', 'blockSteps', 'answered'].map((name) =>
        file(`${GEN5}replay-plan.ts`, name),
      ),
      ...['holdWrites', 'adapterWrites', 'commandWrites'].map((name) =>
        file(`${GEN5}adapter.ts`, name),
      ),
    ],
    ours: () => planOf(REPLAY_NUMBERS, OUR_ADAPTER),
    real: (numbers) => planOf(numbers, adapterNumbers(numbers)),
  },
  {
    name: 'blockPlaces(PKM)',
    functions: [file(`${GEN5}pkm-cipher.ts`, 'blockPlaces')],
    ours: () => placesOf(PKM),
    real: (numbers) => placesOf(numbers.pkm),
    keys: BLOCKS,
  },
  {
    name: 'partyRefs(PARTY_NUMBERS)',
    functions: [file('scripts/gen5-moment-party.ts', 'partyRefs')],
    ours: () => partyRefs({ parties: PARTY_START }, PARTY_NUMBERS),
    real: (numbers) => partyRefs({ parties: PARTY_START }, numbers),
  },
]

/** The text box's guard, arm, format check and page writes. */
function textParts(box: Bw2Numbers['textBox']) {
  return {
    box: textBox(box),
    arm: armWrites(box),
    formatted: formattedCheck(box),
    page: pageWrites(box, 'Go'),
  }
}

/** A replay of a plain block and a printed one through `numbers`' text box. */
const replayOf = (numbers: PrintTable): Gen5Replay => ({
  version: GEN5_REPLAY_VERSION,
  pin: PIN,
  trainers: NAMES,
  parties: { player: [], opponent: [] },
  blocks: [
    { name: 'b1', lines: [9], commands: [{ command: 'SC_UPDATE_HP_GAUGE', args: [1] }] },
    { name: 'b2', lines: [12], commands: [printedCommand(numbers)], print: 'Go' },
  ],
  textBox: numbers.textBox,
  fallbacks: [],
  dropped: [],
})

/** The whole play of that replay at the specs' adapter. */
const planOf = (numbers: PrintTable, adapter: AdapterNumbers) =>
  replayPlan(replayOf(numbers), {
    adapterNumbers: adapter,
    table: numbers,
    adapter: ADAPTER_AT,
    pin: PIN,
  })
