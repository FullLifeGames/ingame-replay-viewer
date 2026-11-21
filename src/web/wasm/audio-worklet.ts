// The audio worklet of the WebAssembly spike page (#35): one processor that plays the run's audio
// ring, resampled from the mixer's rate to the audio context's (audio.ts). It runs on the audio
// thread and reads the ring the worker fills. The e2e covers it, as it covers the page's wiring.
import { AUDIO_PROCESSOR, type AudioProcessorOptions, Resampler } from './audio'
import { AudioRing } from './protocol'

// The names of the AudioWorkletGlobalScope, which TypeScript's DOM library leaves out.
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(
  name: string,
  processor: new (options: { processorOptions: AudioProcessorOptions }) => AudioWorkletProcessor,
): void

class RingProcessor extends AudioWorkletProcessor {
  private readonly resampler: Resampler

  constructor({ processorOptions }: { processorOptions: AudioProcessorOptions }) {
    super()
    const { ring, rate } = processorOptions
    this.resampler = new Resampler(new AudioRing(ring), rate, sampleRate)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0] ?? []
    if (left !== undefined) this.resampler.fill(left, right ?? new Float32Array(left.length))
    return true
  }
}

registerProcessor(AUDIO_PROCESSOR, RingProcessor)
