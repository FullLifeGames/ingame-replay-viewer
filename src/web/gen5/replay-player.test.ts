import { describe, expect, it } from 'vitest'

import JSON_OF from '../../../test/fixtures/replays/gen5ou-2718717830.json'
import { REPLAY_NUMBERS } from '../../gen5/backend/replay.fixtures'
import type { Bw2Numbers } from '../../gen5/bw2-numbers'
import { ENTRY, ROUTINE } from '../../gen5/direct-entry.fixtures'
import type { RunPlan, RunReport } from '../../gen5/hook'
import { pkmFormat } from '../../gen5/pkm-members'
import { entryRun, MOMENT_GAP, playRun } from '../../gen5/replay-run'
import { loadReplay } from './replay-load'
import { type PlayerDeps, replayPlayer } from './replay-player'
import {
  endLine,
  entryFailedLine,
  everyRefused,
  loadFailedLine,
  loadingLine,
  OUTSIDE_RUN,
  playingLine,
  SAVE_REFUSED,
  stoppedLine,
} from './replay-words'

// Invented numbers: two symbols, two adapter commands, an adapter state, the adapter's address
// in sAdapters and the frame of the mark battle. None comes from the game.
const ADAPTERS = 0x0213a5c0
const ADAPTER = 0x022f4100
const BATTLE_FRAME = 4321
const FORMAT = pkmFormat(REPLAY_NUMBERS)
const LAYOUTS = { ...ENTRY.layouts, ...FORMAT.pkm.layouts }
/** The fixture's party with room for the test replay's six Pokémon of the format's size. */
const PARTY = LAYOUTS.PokeParty
const ROOM = 6 * (LAYOUTS.PartyPkm?.size ?? 0)
const NUMBERS = {
  ...REPLAY_NUMBERS,
  entry: {
    ...ENTRY,
    layouts: {
      ...LAYOUTS,
      PokeParty: PARTY && {
        ...PARTY,
        fields: { ...PARTY.fields, pkms: { offset: 0x10, size: ROOM } },
      },
    },
  },
  symbols: {
    sAdapters: { name: 'sAdapters', kind: 'bss', address: ADAPTERS, module: 'ov1' },
    sCommMode: { name: 'sCommMode', kind: 'bss', address: 0x0213a5b8, module: 'ov1' },
  },
  adapterCommands: { BTL_ACMD_SELECT_ACTION: 0x2e, BTL_ACMD_SERVER_CMD: 0x31 },
  adapterStates: { BTL_ADAPTER_STATE_IDLE: 0x07 },
} as unknown as Bw2Numbers

const ID = 'gen5ou-2718717830'
const LABEL = 'Gen 5 OU: isolatedstar vs abc2158 (2718717830)'
const LOADED = loadReplay(JSON_OF, NUMBERS)
const BLOCKS = LOADED.replay.blocks.length
const CHOICE = { id: ID, label: LABEL, load: () => Promise.resolve(JSON_OF) }
const MARKS = [
  { name: 'takeover', frame: 120 },
  { name: 'battle', frame: BATTLE_FRAME },
].map((mark) => ({ ...mark, pageFrame: mark.frame, wallMs: 0, stateBytes: 0, values: '' }))

/** A hook that keeps the plans queued and lets a spec end the run in hand. */
function setup(more: Partial<PlayerDeps> = {}) {
  const plans: RunPlan[] = []
  const said: string[] = []
  const report: RunReport = { status: 'idle', frame: 0, step: 0, marks: [], watch: [], jumps: 0 }
  const listeners: ((report: RunReport) => void)[] = []
  const ticks: { tick?: () => void; stopped: boolean } = { stopped: false }
  const deps: PlayerDeps = {
    hook: {
      queueRun: (plan) => {
        plans.push(plan)
        report.status = 'queued'
      },
      runReport: () => report,
      onRunEnd: (listener) => {
        listeners.push(listener)
      },
    },
    read32: (address) => (address === ADAPTERS ? ADAPTER : 0),
    say: (text) => {
      said.push(text)
    },
    buildFiles: () => Promise.resolve({ numbers: NUMBERS, routine: ROUTINE }),
    repeat: (tick) => {
      ticks.tick = tick
      return () => {
        ticks.stopped = true
      }
    },
    ...more,
  }
  const player = replayPlayer(deps)
  const end = (status: 'done' | 'failed', failed?: string) => {
    report.status = status
    if (failed !== undefined) report.failed = failed
    for (const listener of listeners) listener(report)
  }
  return { player, plans, said, report, end, ticks }
}

/** The page after the entry ended at the action menu, with the play queued. */
async function playing(search = '') {
  const page = setup()
  await page.player.start(CHOICE, search)
  page.report.marks.push(...MARKS)
  page.end('done')
  return page
}

const stepOf = (plan: RunPlan | undefined, kind: string, name: string) =>
  plan?.steps.findIndex((step) => step.kind === kind && 'name' in step && step.name === name) ?? -1

// Scene: the visitor picks a test replay and the dump; the page queues the direct entry before
// the emulator starts, so the entry plays from boot's first frame.
/** The progress of a replay refused before anything loaded, so window.gen5.replay() reads why. */
const refused = (failed: string) => ({ phase: 'failed', replay: ID, block: 0, blocks: 0, failed })

describe('replayPlayer.start', () => {
  it('queues the entry before the emulator starts', async () => {
    const { player, plans, said } = setup()
    await expect(player.start(CHOICE, '')).resolves.toBe(true)
    expect(plans).toEqual([entryRun(LOADED.replay, NUMBERS, ROUTINE).plan])
    expect(said).toEqual([loadingLine(LABEL)])
    expect(player.progress()).toEqual({ phase: 'entry', replay: ID, block: 0, blocks: BLOCKS })
  })

  // Scene: the list beside the game shows the loaded replay's rows before the emulator starts.
  it('gives the loaded replay, its end and its lines once the entry is queued', async () => {
    const { player } = setup()
    expect(player.loaded()).toBeUndefined()
    await player.start(CHOICE, '')
    expect(player.loaded()).toEqual(LOADED)
  })

  // Scene: a script queued its own run before the pick; the page leaves it alone (D14).
  it('lets a run queued from outside win', async () => {
    const { player, plans, said, report } = setup()
    report.status = 'queued'
    await expect(player.start(CHOICE, '')).resolves.toBe(true)
    expect(plans).toEqual([])
    expect(said).toEqual([OUTSIDE_RUN])
    expect(player.progress()).toBeUndefined()
  })

  // Scene: the entry starts from power-on with no save, so a save in the address stops it (D15).
  it('refuses a replay with ?save= before anything loads', async () => {
    for (const search of ['?save=new-game', '?save=Not_A_Name']) {
      const { player, plans, said } = setup()
      await expect(player.start(CHOICE, search)).resolves.toBe(false)
      expect(plans).toEqual([])
      expect(said).toEqual([SAVE_REFUSED])
      expect(player.progress()).toEqual(refused(SAVE_REFUSED))
    }
  })

  it('refuses a frame count that is no whole number above 0', async () => {
    const { player, plans, said } = setup()
    await expect(player.start(CHOICE, '?every=0')).resolves.toBe(false)
    expect(plans).toEqual([])
    expect(said).toEqual([everyRefused('0')])
    expect(player.progress()).toEqual(refused(everyRefused('0')))
  })

  it('says why the build files are missing and does not start', async () => {
    const problem = 'The server has no build/gen5/bw2.json.'
    const { player, plans, said } = setup({ buildFiles: () => Promise.resolve({ problem }) })
    await expect(player.start(CHOICE, '')).resolves.toBe(false)
    expect(plans).toEqual([])
    expect(said.at(-1)).toBe(problem)
    expect(player.progress()).toMatchObject({ phase: 'failed', failed: problem })
  })

  it('says why the replay did not build and does not start', async () => {
    const { player, plans, said } = setup()
    const bad = { ...CHOICE, load: () => Promise.resolve('no replay') }
    await expect(player.start(bad, '')).resolves.toBe(false)
    expect(plans).toEqual([])
    expect(said.at(-1)).toBe(loadFailedLine(LABEL, 'replay JSON is not an object'))
  })
})

// Scene: once the entry stands at the action menu, the page reads the player's adapter and
// queues the play MOMENT_GAP frames after the mark battle, as the run script does.
describe('replayPlayer after the entry', () => {
  it('queues the play at battle + MOMENT_GAP with the adapter read', async () => {
    const { plans, player } = await playing()
    expect(plans[1]).toEqual(playRun(LOADED.replay, NUMBERS, { adapter: ADAPTER, marks: MARKS }))
    expect(plans[1]?.startAt).toBe(BATTLE_FRAME + MOMENT_GAP)
    expect(player.progress()).toMatchObject({ phase: 'play', block: 0 })
  })

  it('asks the play for a frame every ?every= frames', async () => {
    const { plans } = await playing('?every=30')
    const asked = playRun(LOADED.replay, NUMBERS, { adapter: ADAPTER, marks: MARKS, every: 30 })
    expect(plans[1]).toEqual(asked)
  })

  it('says a failed entry', async () => {
    const { player, end, said, plans } = setup()
    await player.start(CHOICE, '')
    end('failed', 'the frame hook threw: Error: x')
    expect(plans).toHaveLength(1)
    expect(said.at(-1)).toBe(entryFailedLine('the frame hook threw: Error: x'))
    expect(player.progress()).toMatchObject({ phase: 'failed' })
  })

  it('says an entry that ended with no mark battle', async () => {
    const { player, end, said } = setup()
    await player.start(CHOICE, '')
    end('done')
    expect(said.at(-1)).toBe(entryFailedLine('the entry ended with no mark battle'))
  })
})

// Scene: the play runs block by block; the page says which block plays, the end at the last
// scene, or the block where it stopped with its log lines.
describe('replayPlayer during the play', () => {
  it('says block N of M each tick', async () => {
    const { plans, report, ticks, said, player } = await playing()
    ticks.tick?.()
    expect(said.at(-1)).toBe(playingLine(LABEL, 0, BLOCKS))
    report.step = stepOf(plans[1], 'until', 'b3')
    ticks.tick?.()
    expect(said.at(-1)).toBe(playingLine(LABEL, 3, BLOCKS))
    expect(player.progress()).toMatchObject({ phase: 'play', block: 3 })
  })

  it('says the end line at the play’s end', async () => {
    const { end, said, player, ticks } = await playing()
    end('done')
    expect(said.at(-1)).toBe(endLine(LOADED.end))
    expect(player.progress()).toEqual({ phase: 'ended', replay: ID, block: BLOCKS, blocks: BLOCKS })
    expect(ticks.stopped).toBe(true)
  })

  // Scene: the list beside the game takes the end line at the play's end, and only then.
  it('hands the end line to the list at the play’s end alone', async () => {
    const ended: string[] = []
    const page = setup({ ended: (line) => ended.push(line) })
    await page.player.start(CHOICE, '')
    page.report.marks.push(...MARKS)
    page.end('done')
    expect(ended).toEqual([])
    page.end('failed', 'step 3 "b1" did not hold within 3000 frames')
    expect(ended).toEqual([])
    const done = setup({ ended: (line) => ended.push(line) })
    await done.player.start(CHOICE, '')
    done.report.marks.push(...MARKS)
    done.end('done')
    done.end('done')
    expect(ended).toEqual([endLine(LOADED.end)])
  })

  it('names a stuck block with its lines', async () => {
    const { plans, report, end, said, player } = await playing()
    const failed = 'step 40 "b12" did not hold within 3000 frames'
    report.step = stepOf(plans[1], 'until', 'b12')
    end('failed', failed)
    const line = stoppedLine(LOADED.replay.blocks[11], failed)
    expect(said.at(-1)).toBe(line)
    expect(player.progress()).toMatchObject({ phase: 'failed', block: 12, failed: line })
  })

  it('says a play that stopped outside a block', async () => {
    const { end, said } = await playing()
    end('failed', 'the run was to start at frame 4921, and the hook first saw frame 5000')
    expect(said.at(-1)).toBe(
      stoppedLine(
        undefined,
        'the run was to start at frame 4921, and the hook first saw frame 5000',
      ),
    )
  })

  it('hears no run when no replay was picked', () => {
    const { end, said, player } = setup()
    end('done')
    expect(said).toEqual([])
    expect(player.progress()).toBeUndefined()
  })
})
