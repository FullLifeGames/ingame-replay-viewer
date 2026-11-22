// The trainer pic of each side from the player's Showdown avatar (#20, rulings U4 a, I6 a, I12 a).
// The rule runs over the trainer pic constants of the pinned expansion and lists no name: an
// avatar finds the pic whose name it spells, whole or by a tail of the name's words. The near
// side shows a back pic, so it takes only a pic that has one; without a match the near side
// shows Brendan and the far side May.
import type { Side } from '../../script/types'
import counts from './counts.json'
import backPics from './trainer-back-pics.json'
import trainerPics from './trainer-pics.json'

const FALLBACK: Readonly<Record<Side, number>> = {
  near: trainerPics.TRAINER_PIC_BRENDAN,
  far: trainerPics.TRAINER_PIC_MAY,
}

const BACK_PICS: ReadonlySet<number> = new Set(Object.values(backPics))

/** Whether `pic` can stand on `side`: the near side draws a back pic, the far side a front pic. */
export const fitsSide = (side: Side, pic: number): boolean => side === 'far' || BACK_PICS.has(pic)

/** Lowercase letters and digits only: `Aqua_Grunt-F` and `aquagruntf` share a key. */
const keyOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

interface Found {
  /** Lower ranks win: a Hoenn pic over a FRLG one, a whole name over a tail. */
  readonly rank: number
  readonly pics: ReadonlySet<number>
}

// Each pic's keys and their ranks: `LEADER_WATTSON` gives `leaderwattson` and `wattson`,
// `SWIMMER_M` also `swimmer`, `RS_BRENDAN` only `brendanrs`.
function keysOf(constant: string): [string, number][] {
  const name = constant.replace(/^TRAINER_PIC_/, '')
  const rs = /^RS_(.+)$/.exec(name)
  if (rs !== null) return [[`${keyOf(rs[1] ?? '')}rs`, 0]]
  const frlg = name.endsWith('_FRLG') ? 1 : 0
  const words = name.replace(/_FRLG$/, '').split('_')
  return words.flatMap((_, start): [string, number][] => {
    const tail = words.slice(start)
    const keys = [keyOf(tail.join(''))]
    if (tail.length > 1 && tail.at(-1) === 'M') keys.push(keyOf(tail.slice(0, -1).join('')))
    return keys.map((key): [string, number] => [key, frlg + 2 * start])
  })
}

function put(index: Map<string, Found>, key: string, rank: number, pic: number): void {
  const known = index.get(key)
  if (known === undefined || rank < known.rank) index.set(key, { rank, pics: new Set([pic]) })
  else if (rank === known.rank) index.set(key, { rank, pics: new Set([...known.pics, pic]) })
}

const INDEX: ReadonlyMap<string, Found> = (() => {
  const index = new Map<string, Found>()
  for (const [constant, pic] of Object.entries(trainerPics)) {
    if (pic === trainerPics.TRAINER_PIC_NONE || pic >= counts.TRAINER_PIC_COUNT) continue
    for (const [key, rank] of keysOf(constant)) put(index, key, rank, pic)
  }
  return index
})()

/** The one pic a key finds; a key two pics share at the same rank (`maniac`, `m`) finds none. */
function picOfKey(key: string): number | undefined {
  const found = INDEX.get(key)
  return found?.pics.size === 1 ? [...found.pics][0] : undefined
}

// A custom avatar (`#…`) is no name. `wattson-gen3` and `magmagruntf-rse` try their whole name,
// then the part before the first `-`.
function picOfAvatar(avatar: string): number | undefined {
  if (avatar.startsWith('#')) return undefined
  return picOfKey(keyOf(avatar)) ?? picOfKey(keyOf(avatar.split('-')[0] ?? ''))
}

/** The trainer pic `side` shows for a player with this avatar. */
export function trainerPicOf(side: Side, avatar: string | undefined): number {
  const pic = avatar === undefined ? undefined : picOfAvatar(avatar)
  return pic !== undefined && fitsSide(side, pic) ? pic : FALLBACK[side]
}
