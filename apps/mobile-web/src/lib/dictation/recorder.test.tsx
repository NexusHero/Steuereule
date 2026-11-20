import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DICTATION_SAMPLE_RATE, startRecording } from './recorder'

const track = { stop: vi.fn() }
let recorders: FakeMediaRecorder[] = []
const current = () => recorders[recorders.length - 1]!
let decodeAudioData: ReturnType<typeof vi.fn>
const close = vi.fn(async () => {})

class FakeMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void | Promise<void>) | null = null
  constructor(readonly stream: unknown) {
    recorders.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    void this.onstop?.()
  }
}

beforeEach(() => {
  recorders = []
  track.stop.mockClear()
  close.mockClear()
  decodeAudioData = vi.fn(async () => ({ getChannelData: () => new Float32Array([0.5]) }))
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  // jsdom's Blob has no arrayBuffer(); the recorder only needs that one method of the joined chunks.
  vi.stubGlobal(
    'Blob',
    class {
      constructor(readonly parts: unknown[] = []) {}
      get size() {
        return this.parts.length
      }
      async arrayBuffer() {
        return new ArrayBuffer(this.parts.length)
      }
    },
  )
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return { decodeAudioData, close }
    }),
  )
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('startRecording (the sound stays in memory)', () => {
  it('asks for a mono microphone stream and decodes the take at 16 kHz', async () => {
    const recording = await startRecording()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    current().ondataavailable?.({ data: new Blob(['abc']) })
    current().ondataavailable?.({ data: new Blob([]) })
    const samples = await recording.stop()
    expect(Array.from(samples)).toEqual([0.5])
    expect(AudioContext).toHaveBeenCalledWith({ sampleRate: DICTATION_SAMPLE_RATE })
    expect(track.stop).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('still releases the microphone when decoding fails and reports the error', async () => {
    decodeAudioData.mockRejectedValue(new Error('undecodable'))
    const recording = await startRecording()
    await expect(recording.stop()).rejects.toThrow('undecodable')
    expect(track.stop).toHaveBeenCalled()
  })

  it('cancel stops a running recording without decoding and frees the microphone', async () => {
    const recording = await startRecording()
    recording.cancel()
    expect(current().state).toBe('inactive')
    expect(track.stop).toHaveBeenCalled()
    expect(decodeAudioData).not.toHaveBeenCalled()
  })

  it('cancel after the recorder already stopped only releases the microphone', async () => {
    const recording = await startRecording()
    current().state = 'inactive'
    expect(() => recording.cancel()).not.toThrow()
    expect(track.stop).toHaveBeenCalled()
  })
})
