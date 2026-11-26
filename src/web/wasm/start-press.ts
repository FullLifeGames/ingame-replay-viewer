// A press on Start in the viewer (#69). DOM-free, so a Node spec covers it; main.ts hands it the
// page's Start button.

/** What a press reads and sets of the button: the page's HTMLButtonElement has it. */
interface Pressed {
  disabled: boolean
}

/**
 * Runs `play` for a press on `button`. The button stays disabled from the press until the play
 * begins its run or fails, so a second press during the build starts no second run. A press
 * after the run began restarts it, as before. A press on a disabled button plays nothing.
 *
 * `clicks` is the click's `detail`: 1 for a click, 0 for a key press. The second click of a
 * double click (2 or more) plays nothing, as the run its first click began would start over (#90).
 */
export function pressStart<T>(
  button: Pressed,
  play: () => Promise<T | undefined>,
  clicks: number,
): Promise<T | undefined> {
  if (button.disabled || clicks >= 2) return Promise.resolve(undefined)
  button.disabled = true
  return play().finally(() => {
    button.disabled = false
  })
}
