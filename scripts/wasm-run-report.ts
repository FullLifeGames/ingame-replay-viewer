// The streams of one wasm:run, one after the other, and their report (#66).
import type { RunReport, ShotPlan } from './rom-shot.ts'

/** Plays one stream and reports it. */
export type PlayStream = (plan: ShotPlan) => Promise<RunReport>

/** Plays the streams in their order. */
export async function playStreams(
  plans: readonly ShotPlan[],
  play: PlayStream,
): Promise<RunReport[]> {
  const reports: RunReport[] = []
  for (const plan of plans) reports.push(await play(plan))
  return reports
}
