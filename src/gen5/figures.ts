// The one line of figures that the spike page's "Copy figures" button copies (#72), so the user's
// PC and phone runs can be set beside the build machine's. It holds no dump name and no path.
import type { Calibration } from './hook.ts'

export interface Figures {
  /** 'plain' or 'thread'. */
  core: string
  /** False while the page runs without the speed cap. */
  capped: boolean
  vsync: boolean
  calibration: Calibration | undefined
  fps5: number | undefined
  fps60: number | undefined
  frames: number
  userAgent: string
}

const NOT_YET = 'not measured yet'

const onOff = (on: boolean) => (on ? 'on' : 'off')

function deviceText(figures: Calibration | undefined): string {
  if (!figures) return `device ${NOT_YET}`
  const millions = (figures.loopTurns / 1e6).toFixed(1)
  return `${String(figures.cores)} logical cores; ${millions} million loop turns in ${String(figures.loopMs / 1000)} s`
}

const rateText = (fps: number | undefined, seconds: number) =>
  fps === undefined
    ? `fps over ${String(seconds)} s ${NOT_YET}`
    : `${fps.toFixed(1)} fps over ${String(seconds)} s`

export function figuresLine(figures: Figures): string {
  return [
    `Gen 5 spike figures: ${figures.core} core`,
    `speed cap ${onOff(figures.capped)}`,
    `vsync ${onOff(figures.vsync)}`,
    deviceText(figures.calibration),
    rateText(figures.fps5, 5),
    rateText(figures.fps60, 60),
    `${String(figures.frames)} frames`,
    figures.userAgent.replace(/\s+/g, ' '),
  ].join('; ')
}
