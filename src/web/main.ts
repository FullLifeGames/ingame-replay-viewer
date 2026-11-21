// The dev page (#8): wires the controls of index.html to the session. The user's dump stays in
// this tab; nothing is stored, and the only requests are same-origin GETs and Showdown's replay.
import { loadEmulator } from './emulator'
import { environmentProblem } from './environment'
import { fetchBytes, fetchJson } from './fetch'
import { FIRST_REPLAY, TEST_REPLAYS } from './replays'
import { createSession, type ReplaySummary, type Session } from './session'
import * as say from './status'
import { findView, type View } from './view'

/** Runs a handler's work; a failure becomes the status line. */
function act(view: View, work: () => unknown): void {
  Promise.resolve()
    .then(work)
    .catch((error: unknown) => {
      view.status(say.errorLine(error))
    })
}

function wireReplays(session: Session, view: View): void {
  const show = (pending: Promise<ReplaySummary | undefined>): void => {
    act(view, async () => {
      const summary = await pending
      if (summary !== undefined) view.showReplay(summary)
    })
  }
  const pick = (id: string): void => {
    const replay = TEST_REPLAYS.find((test) => test.id === id)
    if (replay !== undefined) show(session.pickTestReplay(replay))
  }
  view.testReplay.addEventListener('change', () => {
    pick(view.testReplay.value)
  })
  view.replayForm.addEventListener('submit', (event) => {
    event.preventDefault()
    show(session.loadReplay(view.replayInput.value))
  })
  view.offer(
    TEST_REPLAYS.map((test) => test.id),
    FIRST_REPLAY,
  )
  pick(FIRST_REPLAY)
}

function wireRun(session: Session, view: View): void {
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
  const session = createSession({
    fetchBytes,
    fetchJson,
    loadEmulator: () => loadEmulator(view.canvas),
    onCrash: (line) => {
      view.status(line)
      view.restart.disabled = true
    },
  })
  view.status(say.READY_LINE)
  wireReplays(session, view)
  wireRun(session, view)
} else {
  view.showOnly(problem)
}
