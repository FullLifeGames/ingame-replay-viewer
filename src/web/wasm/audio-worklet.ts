// The audio worklet of the viewer (#35): one processor that plays the run's audio
// ring, resampled from the mixer's rate to the audio context's and held at the latency cap
// (RingReader in audio.ts). It runs on the audio thread and reads the ring the worker fills.
// The e2e covers it, as it covers the page's wiring.
import { AUDIO_PROCESSOR, AUDIO_STOP, type AudioProcessorOptions, RingReader } from './audio'

// The names of the AudioWorkletGlobalScope, which TypeScript's DOM library leaves out.
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(
  name: string,
  processor: new (options: { processorOptions: AudioProcessorOptions }) => AudioWorkletProcessor,
): void

// The page sends AUDIO_STOP when its run ends; a processor that returns false goes away.
class RingProcessor extends AudioWorkletProcessor {
  private readonly reader: RingReader

  constructor({ processorOptions }: { processorOptions: AudioProcessorOptions }) {
    super()
    this.reader = new RingReader(processorOptions, sampleRate)
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data === AUDIO_STOP) this.reader.stop()
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    return this.reader.process(outputs)
  }
}

registerProcessor(AUDIO_PROCESSOR, RingProcessor)
