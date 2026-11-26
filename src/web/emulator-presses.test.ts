// The emulator page's Start and Restart (#8, #51, #69), over a session that runs the real adapter
// on a fake mGBA core. Firefox may refuse an audio resume that runs after the click handler first
// yields, so each press calls the sound before it returns.
import { describe, expect, it } from 'vitest'

import { audioHandOver, createEmulator, NOT_STARTED_LINE } from './emulator'
import { fakeAudioContext, fakeCore } from './emulator-testing'
import { emulatorPresses, type PressView } from './emulator-presses'
import { SessionError } from './replay-choice'
import { ready, world } from './session-testing'
import type { StatusLine } from './status'

/** A page whose status line and failures land in `shown`. */
function fakeView() {
  const shown: (string | StatusLine | Error)[] = []
  const view: PressView = {
    start: { disabled: false },
    restart: { disabled: true },
    status: (line) => shown.push(line),
    failure: (error) => shown.push(error as Error),
  }
  return { view, shown }
}

/** The page after its dump, 994052 and a Start that ran: the adapter holds the tap's context. */
async function started() {
  const context = fakeAudioContext('tap', 'suspended')
  const core = fakeCore()
  const audio = audioHandOver(() => context)
  const { session } = world(createEmulator(core, audio))
  await ready(session)
  const page = fakeView()
  const presses = emulatorPresses(session, page.view, audio)
  presses.start()
  const askedInClick = [...context.asked]
  await expect.poll(() => page.view.restart.disabled).toBe(false)
  return { askedInClick, context, core, presses, ...page }
}

describe('the emulator page', () => {
  it('opens the sound inside the Start click and names the replay by its label once it runs', async () => {
    const { askedInClick, view, shown } = await started()
    expect(askedInClick).toEqual(['resume'])
    expect(view.start.disabled).toBe(false)
    expect(shown).toEqual([
      'Starting the emulator.',
      'Started Gen 3 OU: A Welcome Guest vs xXEricXx (994052).',
    ])
  })

  // The pick's counts under "Details" hold the stream's bytes (#90), so no status line repeats
  // them there: the page showed "6692 bytes of instruction stream." over "494 instructions, 6692
  // bytes of instruction stream." after Start.
  it('writes no bytes of the stream under "Details" after Start or Restart', async () => {
    const { presses, shown } = await started()
    presses.restart()
    const details = shown.map((one) =>
      typeof one === 'object' && 'detail' in one ? one.detail : '',
    )
    expect(details.filter((detail) => detail.includes('bytes'))).toEqual([])
    expect(shown.at(-1)).toBe(
      'Restarted Gen 3 OU: A Welcome Guest vs xXEricXx (994052) from the beginning.',
    )
  })

  it('resumes the sound inside the Restart click, before the handler first yields', async () => {
    const { context, core, presses, shown } = await started()
    // A browser suspends a running context, as Chrome does when the tab plays nothing for a while.
    context.state = 'suspended'
    context.asked.length = 0
    presses.restart()
    expect(context.asked).toEqual(['resume'])
    expect(core.calls.at(-1)).toBe('quickReload')
    expect(shown.at(-1)).toBe(
      'Restarted Gen 3 OU: A Welcome Guest vs xXEricXx (994052) from the beginning.',
    )
  })

  it('shows the refusal of a Restart before any Start', () => {
    const { session } = world()
    const page = fakeView()
    emulatorPresses(
      session,
      page.view,
      audioHandOver(() => fakeAudioContext('tap', 'running')),
    ).restart()
    expect(page.shown).toEqual([new SessionError(`Could not restart: ${NOT_STARTED_LINE}`)])
  })
})
