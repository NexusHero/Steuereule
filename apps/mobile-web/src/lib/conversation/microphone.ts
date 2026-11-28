import { loudness } from './voiceActivity'
import { wavFromSamples } from './wav'

/** How often the loudness of the microphone is measured. */
export const LEVEL_STEP_MS = 50
export const UTTERANCE_SAMPLE_RATE = 16_000

export interface MicrophoneSession {
  /** The last `lastMs` of what was recorded, as a WAV file; recording starts over. */
  take(lastMs: number): Promise<Blob>
  /** Forgets what was recorded and starts over. */
  restart(): void
  /** Releases the microphone. */
  close(): void
}

/** The microphone of a spoken conversation: open for the whole conversation, measured all the time. */
export interface Microphone {
  /** Asks for the microphone. `onLevel` gets its loudness (RMS, 0 to 1) every LEVEL_STEP_MS until it is closed. */
  open(onLevel: (level: number) => void): Promise<MicrophoneSession>
}

/** Whether this browser can record at all; the conversation is not offered where it cannot. */
export function canRecord(scope: { navigator?: { mediaDevices?: { getUserMedia?: unknown } }; MediaRecorder?: unknown; AudioContext?: unknown } = globalThis as never): boolean {
  return typeof scope.navigator?.mediaDevices?.getUserMedia === 'function' && typeof scope.MediaRecorder === 'function' && typeof scope.AudioContext === 'function'
}

/**
 * The browser's microphone. The sound stays in memory: it is measured for the line on screen, and one
 * utterance at a time leaves the device as a WAV file to be written down (ADR-0115).
 */
export const browserMicrophone: Microphone = {
  async open(onLevel) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    context.createMediaStreamSource(stream).connect(analyser)
    const block = new Float32Array(analyser.fftSize)
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(block)
      onLevel(loudness(block))
    }, LEVEL_STEP_MS)

    let chunks: Blob[] = []
    let recorder = record()
    function record(): MediaRecorder {
      const next = new MediaRecorder(stream)
      const mine: Blob[] = []
      chunks = mine
      next.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) mine.push(event.data)
      })
      next.start()
      return next
    }
    const stopped = (which: MediaRecorder): Promise<void> =>
      new Promise((resolve) => {
        if (which.state === 'inactive') return resolve()
        which.addEventListener('stop', () => resolve(), { once: true })
        which.stop()
      })

    return {
      async take(lastMs) {
        const finished = recorder
        const recorded = chunks
        await stopped(finished)
        recorder = record()
        const decoder = new AudioContext({ sampleRate: UTTERANCE_SAMPLE_RATE })
        try {
          const audio = await decoder.decodeAudioData(await new Blob(recorded).arrayBuffer())
          const samples = audio.getChannelData(0)
          const wanted = Math.round((lastMs / 1000) * audio.sampleRate)
          return new Blob([wavFromSamples(samples.subarray(Math.max(0, samples.length - wanted)), audio.sampleRate)], { type: 'audio/wav' })
        } finally {
          await decoder.close()
        }
      },
      restart() {
        const finished = recorder
        recorder = record()
        void stopped(finished)
      },
      close() {
        clearInterval(timer)
        void stopped(recorder)
        chunks = []
        for (const track of stream.getTracks()) track.stop()
        void context.close()
      },
    }
  },
}
