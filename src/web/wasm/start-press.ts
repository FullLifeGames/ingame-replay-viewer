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
 */
export function pressStart<T>(
  button: Pressed,
  play: () => Promise<T | undefined>,
): Promise<T | undefined> {
  if (button.disabled) return Promise.resolve(undefined)
  button.disabled = true
  return play().finally(() => {
    button.disabled = false
  })
}
