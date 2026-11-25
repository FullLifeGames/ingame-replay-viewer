// The emulator page (#8): wires the controls of emulator.html to the session. The user's dump
// stays in this tab; nothing is stored, and the only requests are same-origin GETs and Showdown's
// replay.
import { type AudioHandOver, audioHandOver, loadEmulator } from './emulator'
import { act, emulatorPresses } from './emulator-presses'
import { environmentProblem } from './environment'
import { fetchBytes, fetchJson } from './fetch'
import { wireReplays } from './replay-view'
import { createSession, type Session } from './session'
import * as say from './status'
import { findView, type View } from './view'
import { environmentLine } from './visitor'

function wireRun(session: Session, view: View, audio: AudioHandOver): void {
  view.dump.addEventListener('change', () => {
    const file = view.dump.files?.[0]
    if (file === undefined) return
    view.status(say.CHECKING_LINE)
    act(view, async () => {
      const dump = await session.pickDump(new Uint8Array(await file.arrayBuffer()))
      if (dump !== undefined) view.status(say.dumpLine(dump))
    })
  })
  const presses = emulatorPresses(session, view, audio)
  view.start.addEventListener('click', presses.start)
  view.restart.addEventListener('click', presses.restart)
}

const view = findView()
const problem = environmentProblem({ isSecureContext, crossOriginIsolated })
if (problem === undefined) {
  const audio = audioHandOver()
  const session = createSession({
    fetchBytes,
    fetchJson,
    loadEmulator: () => loadEmulator(view.canvas, audio),
    onCrash: (line) => {
      view.status(line)
      view.restart.disabled = true
    },
  })
  view.status(say.READY_LINE)
  wireReplays(session, view)
  wireRun(session, view, audio)
} else {
  view.showOnly(environmentLine(problem, location))
}
