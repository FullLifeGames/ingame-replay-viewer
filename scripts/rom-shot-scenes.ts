// The named scenes of a screenshot run (plan section 7): where in a stream each scene lies, which
// frames the shot tool takes for it, and what its probe expects. A shot is taken `frames` frames
// after the first frame on which the interpreter plays (gReplayProgress.playing) and
// gReplayProgress.done equals `done`: the frame between op `done - 1` and op `done`, or `frames`
// into op `done`.
import type { Instruction, Stream } from '../src/gen3/stream/instructions.ts'
import type { Side } from '../src/script/types.ts'

import { ballScene } from './rom-shot-balls.ts'
import { SCREEN } from './rom-shot-probes.ts'
import type { Check, Region } from './rom-shot-probes.ts'
import { weatherScene } from './rom-shot-weather.ts'

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

// The screen fades in from black while the slide starts: measured on the hand-made run (fix step),
// the first 20 frames after the interpreter takes over show one colour, frame 24 three and frame
// 32 thirteen, with the scene drawn and still sliding. The frame after INTRO has both trainers in
// place.
const INTRO_SLIDE_FRAMES = 32

function introScene(input: Input): Scene | undefined {
  const at = firstOf(input, 'intro')
  if (at < 0) return undefined
  const shots = [
    { name: 'intro-before', done: at, frames: INTRO_SLIDE_FRAMES },
    { name: 'intro', done: at + 1, frames: 0 },
  ]
  const check: Check = {
    probe: 'differs',
    before: 'intro-before',
    after: 'intro',
    beforeDrawn: true,
  }
  return { name: 'intro', shots, check }
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
    check: {
      probe: 'blank',
      shot: shot.name,
      region: SCREEN.nearHpDigits,
      colour: SCREEN.healthboxBackground,
    },
  }
}

// After both send-outs the far healthbox shows "Lv" and the level of the far mon; the probe looks
// for the "Lv" glyph alone, left of the digits.
function levelScene(input: Input): Scene | undefined {
  const sendOuts = input.stream.instructions.flatMap((instruction, at) =>
    instruction.op === 'sendOut' ? [{ at, instruction }] : [],
  )
  const second = sendOuts[1]?.at
  const far = sendOuts.find(({ instruction }) => instruction.side === 'far')?.instruction
  const level = far === undefined ? undefined : input.stream.parties.far[far.slot]?.level
  if (second === undefined || level === undefined) return undefined
  const { end, y, height, lvWidth, digitWidth } = SCREEN.farLevel
  const x = end - lvWidth - String(level).length * digitWidth
  const shot = { name: 'level', done: second + 1, frames: 0 }
  const region = { x, y, width: lvWidth, height }
  return { name: shot.name, shots: [shot], check: { probe: 'text', shot: shot.name, region } }
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

// The pixels an HP bar fills once it has moved to the new HP, as the engine counts them: the HP
// times the bar's width over the max HP, rounded down, and one pixel for a mon that has HP left
// (CalcBarFilledPixels, U/src/battle_interface.c:2359-2370, and GetScaledHPFraction, :2407-2414;
// U = .cache/rom/expansion at 79dd436).
function barPixels(hp: number, maxHp: number, width: number): number {
  if (hp <= 0) return 0
  return Math.max(1, Math.floor((hp * width) / maxHp))
}

// The far HP bar after a far HP change. The first change that leaves the bar partly filled tests
// the scale (a knock-out empties it, a full heal fills it); a stream with none takes its first far
// HP change.
function hpScene(input: Input): Scene | undefined {
  const changes = farHpChanges(input)
  const change = changes.find(({ hp, maxHp }) => hp > 0 && hp < maxHp) ?? changes[0]
  if (change === undefined) return undefined
  const filled = barPixels(change.hp, change.maxHp, SCREEN.farHpBar.width)
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

// After END the outro (rom/gen3/src/replay_outro.c) returns the mons still out, slides the
// winner's trainer in and holds the scene for 120 frames before it fades to black; 150 frames
// after END lie in that hold. BtlController_HandleTrainerSlide ends the trainer's 64x64 sprite
// centred on (80, 80) near and on (176 + 32, 40) far (U/src/battle_controllers.c:2516-2546).
// Near, that is where PlayerHandleDrawTrainerPic draws the trainer in the intro
// (U/src/battle_controller_player.c:1893-1947), over the same field: the region must match the
// intro frame pixel for pixel, which a frame with no trainer, a fading frame or a black one fails.
// Measured on the 994052 and hand-made frames of step 7: 0 pixels differ. Far, the intro draws the
// trainer at x 176 (U/src/battle_controller_opponent.c:374-413), 32 pixels left of the slide's
// end, and no frame of a run shows the field there without a trainer or a mon: the trainer's
// pixels match the intro's 32 pixels to the left on 2717564545, but the field behind it differs on
// 524 pixels. So far, the region differs from the win frame only because the winner's mon went
// back or its trainer came in, and the win line stays in the text box until the fade, so a frame
// with the box changed is fading or black. A tie or an unknown end has no winner: the outro holds
// the last line in the text box as the win frame shows it.
const OUTRO_FRAMES = 150
const TRAINER_REGIONS: Readonly<Record<Side, Region>> = {
  near: { x: 48, y: 48, width: 64, height: 64 },
  far: { x: 176, y: 8, width: 64, height: 64 },
}
type Outcome = Extract<Instruction, { op: 'end' }>['outcome']
const WINNERS: Readonly<Partial<Record<Outcome, Side>>> = { nearWon: 'near', farWon: 'far' }

function outroCheck(input: Input, outcome: Outcome): Check {
  const winner = WINNERS[outcome]
  const after = 'outro'
  if (winner === undefined) return { probe: 'same', before: 'win', after, region: SCREEN.message }
  const region = TRAINER_REGIONS[winner]
  if (winner === 'near' && introScene(input) !== undefined) {
    return { probe: 'same', before: 'intro', after, region }
  }
  return { probe: 'differs', before: 'win', after, region, kept: SCREEN.message }
}

function outroScene(input: Input): Scene | undefined {
  const { instructions } = input.stream
  const end = instructions.at(-1)
  if (winScene(input) === undefined || end?.op !== 'end') return undefined
  const shot = { name: 'outro', done: instructions.length, frames: OUTRO_FRAMES }
  return { name: shot.name, shots: [shot], check: outroCheck(input, end.outcome) }
}

const SCENES: readonly (readonly [string, (input: Input) => Scene | undefined])[] = [
  ['intro', introScene],
  ['near-balls', (input) => ballScene(input.stream, 'near')],
  ['far-balls', (input) => ballScene(input.stream, 'far')],
  ['send-outs', sendOutScene],
  ['level', levelScene],
  ['weather-start', (input) => weatherScene(input.stream)],
  ['first-move', moveScene],
  ['first-hp', hpScene],
  ['first-status', statusScene],
  ['first-switch', switchScene],
  ['first-faint', faintScene],
  ['win', winScene],
  ['outro', outroScene],
]

const inputOf = (stream: Stream): Input => ({ stream, active: activeSlots(stream.instructions) })

/** The scenes the stream holds, in the order of the plan; a scene it lacks is left out. */
export function scenesOf(stream: Stream): Scene[] {
  const input = inputOf(stream)
  return SCENES.flatMap(([, scene]) => scene(input) ?? [])
}

/** The names of the scenes the stream lacks, in the order of the plan. */
export function missingScenes(stream: Stream): string[] {
  const input = inputOf(stream)
  return SCENES.filter(([, scene]) => scene(input) === undefined).map(([name]) => name)
}

/**
 * A refused stream: the tool's last frame shows the refusal screen, its reason in text on the
 * refusal colour (CB2_ReplayRefused in rom/gen3/src/replay_boot.c, #30; the colour comes from
 * replay_progress.h through readProgressLayout). The probe needs no place for the text: the colour
 * must cover most of the screen, and the text's pixels stand on it.
 */
export function refusalScenes(colour: number): Scene[] {
  const check: Check = { probe: 'text', shot: 'final', region: SCREEN.screen, background: colour }
  return [{ name: 'refused', shots: [], check }]
}

/** The shot tool's arguments `<name>:<done>:<frames>`, one per shot. */
export function shotArgs(scenes: readonly Scene[]): string[] {
  return scenes.flatMap((scene) =>
    scene.shots.map((shot) => `${shot.name}:${String(shot.done)}:${String(shot.frames)}`),
  )
}
