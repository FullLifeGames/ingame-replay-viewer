// The named scenes of a screenshot run (plan section 7): where in a stream each scene lies, which
// frames the shot tool takes for it, and what its probe expects. A shot is taken `frames` frames
// after the first frame on which gReplayProgress.done equals `done`: the frame between op `done - 1`
// and op `done`, or `frames` into op `done`.
import type { Instruction, Stream } from '../src/gen3/stream/instructions.ts'
import type { Side } from '../src/script/types.ts'

import { SCREEN } from './rom-shot-probes.ts'
import type { Check, Region } from './rom-shot-probes.ts'

interface Shot {
  name: string
  done: number
  frames: number
}

export interface Scene {
  name: string
  shots: Shot[]
  check: Check
}

// A move animation runs for longer than this, so the frame shows it under way.
const MOVE_FRAMES = 20

type Active = Readonly<Record<Side, number | undefined>>

// The party slot on the field on each side before each instruction.
function activeSlots(instructions: readonly Instruction[]): Active[] {
  let active: Active = { near: undefined, far: undefined }
  return instructions.map((instruction) => {
    const before = active
    if (instruction.op === 'sendOut' || instruction.op === 'switchIn') {
      active = { ...active, [instruction.side]: instruction.slot }
    }
    return before
  })
}

interface Input {
  stream: Stream
  active: Active[]
}

// The frame before op `at` and the frame after it: the op changed what the screen shows.
function changeAt(name: string, at: number, region?: Region): Scene {
  const before = `${name}-before`
  const shots = [
    { name: before, done: at, frames: 0 },
    { name, done: at + 1, frames: 0 },
  ]
  const check: Check = { probe: 'differs', before, after: name }
  return { name, shots, check: region === undefined ? check : { ...check, region } }
}

const firstOf = (input: Input, op: Instruction['op']) =>
  input.stream.instructions.findIndex((instruction) => instruction.op === op)

function introScene(input: Input): Scene | undefined {
  const at = firstOf(input, 'intro')
  return at < 0 ? undefined : changeAt('intro', at)
}

// After both send-outs the near healthbox is drawn; its HP numbers stay hidden (patch 0002).
function sendOutScene(input: Input): Scene | undefined {
  const sendOuts = input.stream.instructions.flatMap((instruction, i) =>
    instruction.op === 'sendOut' ? [i] : [],
  )
  const second = sendOuts[1]
  if (second === undefined) return undefined
  const shot = { name: 'send-outs', done: second + 1, frames: 0 }
  return {
    name: shot.name,
    shots: [shot],
    check: { probe: 'blank', shot: shot.name, region: SCREEN.nearHpDigits },
  }
}

function moveScene(input: Input): Scene | undefined {
  const at = firstOf(input, 'move')
  if (at < 0) return undefined
  const shots = [
    { name: 'first-move-before', done: at, frames: 0 },
    { name: 'first-move', done: at, frames: MOVE_FRAMES },
  ]
  const check: Check = { probe: 'differs', before: 'first-move-before', after: 'first-move' }
  return { name: 'first-move', shots, check }
}

interface HpChange {
  at: number
  hp: number
  maxHp: number
}

// Each far HP change with the max HP of the far mon on the field.
function farHpChanges(input: Input): HpChange[] {
  const { instructions, parties } = input.stream
  return instructions.flatMap((instruction, at) => {
    const slot = input.active[at]?.far
    if (instruction.op !== 'hp' || instruction.side !== 'far' || slot === undefined) return []
    return [{ at, hp: instruction.hp, maxHp: parties.far[slot]?.maxHp ?? 0 }]
  })
}

// The far HP bar after a far HP change: the logged HP over the mon's max HP of 48 pixels. The first
// change that leaves the bar partly filled tests the scale (a knock-out empties it, a full heal
// fills it); a stream with none takes its first far HP change.
function hpScene(input: Input): Scene | undefined {
  const changes = farHpChanges(input)
  const change = changes.find(({ hp, maxHp }) => hp > 0 && hp < maxHp) ?? changes[0]
  if (change === undefined) return undefined
  const filled = Math.round((SCREEN.farHpBar.width * change.hp) / change.maxHp)
  const shot = { name: 'first-hp', done: change.at + 1, frames: 0 }
  return {
    name: shot.name,
    shots: [shot],
    check: { probe: 'bar', shot: shot.name, bar: SCREEN.farHpBar, filled },
  }
}

// A status on a mon on the field shows its icon in that side's healthbox.
function statusScene(input: Input): Scene | undefined {
  const at = input.stream.instructions.findIndex(
    (instruction, i) =>
      instruction.op === 'status' && input.active[i]?.[instruction.side] === instruction.slot,
  )
  const instruction = input.stream.instructions[at]
  if (instruction?.op !== 'status') return undefined
  return changeAt('first-status', at, SCREEN.healthbox[instruction.side])
}

function switchScene(input: Input): Scene | undefined {
  const at = firstOf(input, 'switchIn')
  return at < 0 ? undefined : changeAt('first-switch', at)
}

function faintScene(input: Input): Scene | undefined {
  const at = firstOf(input, 'faint')
  return at < 0 ? undefined : changeAt('first-faint', at)
}

// The last message, the backend's win line, stays in the text box after it has printed.
function winScene(input: Input): Scene | undefined {
  const at = input.stream.instructions.findLastIndex((instruction) => instruction.op === 'print')
  if (at < 0) return undefined
  const shot = { name: 'win', done: at + 1, frames: 0 }
  return {
    name: shot.name,
    shots: [shot],
    check: { probe: 'text', shot: shot.name, region: SCREEN.message },
  }
}

const SCENES = [
  introScene,
  sendOutScene,
  moveScene,
  hpScene,
  statusScene,
  switchScene,
  faintScene,
  winScene,
]

/** The scenes the stream holds, in the order of the plan; a scene it lacks is left out. */
export function scenesOf(stream: Stream): Scene[] {
  const input = { stream, active: activeSlots(stream.instructions) }
  return SCENES.flatMap((scene) => scene(input) ?? [])
}

// CB2_ReplayRefused (rom/gen3/src/replay_boot.c) shows RGB(12, 0, 0) alone; mGBA widens the five
// bits of each channel to eight.
const REFUSED_COLOUR = 0x630000

/** A refused stream: the tool's last frame shows the refusal screen, one colour. */
export function refusalScenes(): Scene[] {
  const check: Check = {
    probe: 'blank',
    shot: 'final',
    region: SCREEN.screen,
    colour: REFUSED_COLOUR,
  }
  return [{ name: 'refused', shots: [], check }]
}

/** The shot tool's arguments `<name>:<done>:<frames>`, one per shot. */
export function shotArgs(scenes: readonly Scene[]): string[] {
  return scenes.flatMap((scene) =>
    scene.shots.map((shot) => `${shot.name}:${String(shot.done)}:${String(shot.frames)}`),
  )
}
