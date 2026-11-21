// Frames of the page's canvas for the e2e. A frame shows the game, which is ROM-derived, so it
// stays in memory: the screenshot gets no path, and only counts and booleans leave this module.
import type { Page } from '@playwright/test'

import { countColours } from '../scripts/png-colours.ts'

export interface Frame {
  readonly png: Buffer
  /** Distinct colours in the frame, counted up to 16. */
  readonly colours: number
}

/** The canvas as it shows now. */
export async function frame(page: Page): Promise<Frame> {
  const png = await page.locator('canvas').screenshot()
  return { png, colours: countColours(png, 16) }
}

/** Whether two frames show different pictures. */
export const differ = (a: Frame, b: Frame): boolean => !a.png.equals(b.png)
