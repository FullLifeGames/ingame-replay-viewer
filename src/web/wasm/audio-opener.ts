// The viewer's audio context (#47, #57): opened on the first Start, the user's gesture that lets a
// page play sound. DOM-free apart from the context's type, so a Node spec holds it with a fake
// context; run.ts hands it the factory that opens the real one.
import { messageOf } from '../message'

/** The page's audio context, or the line that says why a run plays without sound. */
export type Sound = AudioContext | string

/**
 * The page's one audio context. When it fails to open, the run plays without sound, and the next
 * Start tries again.
 */
export class AudioOpener {
  private readonly create: () => Promise<AudioContext>
  private context: Promise<AudioContext> | undefined

  constructor(create: () => Promise<AudioContext>) {
    this.create = create
  }

  async open(): Promise<Sound> {
    this.context ??= this.create()
    let opened: AudioContext
    try {
      opened = await this.context
    } catch (error: unknown) {
      this.context = undefined
      return `the page could not open its audio: ${messageOf(error)}`
    }
    return opened.resume().then(
      () => opened,
      (error: unknown) => `the audio did not start: ${messageOf(error)}`,
    )
  }
}
