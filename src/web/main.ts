// The emulator page (#8): wires the controls of emulator.html to the session. The user's dump
// stays in this tab; nothing is stored, and the only requests are same-origin GETs and Showdown's
// replay.
import { type AudioHandOver, audioHandOver, loadEmulator } from './emulator'
import { environmentProblem } from './environment'
import { fetchBytes, fetchJson } from './fetch'
import { messageOf } from './message'
import { wireReplays } from './replay-view'
import { createSession, type Session } from './session'
import * as say from './status'
import { findView, type View } from './view'

/** Runs a handler's work; a failure becomes the status line. */
function act(view: View, work: () => unknown): void {
  Promise.resolve()
    .then(work)
    .catch((error: unknown) => {
      view.status(messageOf(error))
    })
}

function wireRun(session: Session, view: View, audio: AudioHandOver): void {
  let running = ''
  view.dump.addEventListener('change', () => {
    const file = view.dump.files?.[0]
    if (file === undefined) return
    view.status(say.CHECKING_LINE)
    act(view, async () => {
      const dump = await session.pickDump(new Uint8Array(await file.arrayBuffer()))
      if (dump !== undefined) view.status(say.dumpLine(dump))
    })
  })
  view.start.addEventListener('click', () => {
    // Before any await: Firefox opens audio only while the tap's activation lasts (#51).
    audio.open()
    view.status(say.STARTING_LINE)
    view.start.disabled = true
    act(view, async () => {
      const started = await session.start().finally(() => {
        view.start.disabled = false
      })
      running = started.id
      view.status(say.startLine(started))
      view.restart.disabled = false
    })
  })
  view.restart.addEventListener('click', () => {
    act(view, () => {
      session.restart()
      view.status(say.restartLine(running))
    })
  })
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
  view.showOnly(problem)
}
