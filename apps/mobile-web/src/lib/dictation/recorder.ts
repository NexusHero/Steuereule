/**
 * Microphone capture for dictation (#451 slice 5, decision 14): the sound stays in memory, is
 * decoded to 16 kHz mono samples for the model and is never stored or sent.
 */
export interface Recording {
  /** Ends the recording and returns the samples; the microphone is released either way. */
  stop(): Promise<Float32Array>
  cancel(): void
}

export const DICTATION_SAMPLE_RATE = 16_000

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const release = () => stream.getTracks().forEach((track) => track.stop())
  recorder.start()

  return {
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            const context = new AudioContext({ sampleRate: DICTATION_SAMPLE_RATE })
            const audio = await context.decodeAudioData(await new Blob(chunks).arrayBuffer())
            await context.close()
            resolve(audio.getChannelData(0))
          } catch (error) {
            reject(error)
          } finally {
            chunks.length = 0
          }
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
      chunks.length = 0
    },
  }
}
