import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserAudioOutput } from './serverVoice'

class FakeAudio {
  static last: FakeAudio | null = null
  src = ''
  private readonly heard: Array<['ended' | 'error', () => void]> = []
  readonly started: string[] = []
  paused = 0
  refuse = false
  constructor() {
    FakeAudio.last = this
  }
  play(): Promise<void> {
    this.started.push(this.src)
    return this.refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()
  }
  pause(): void {
    this.paused += 1
  }
  addEventListener(type: 'ended' | 'error', listener: () => void): void {
    this.heard.push([type, listener])
  }
  fire(type: 'ended' | 'error'): void {
    for (const [heardType, listener] of this.heard) if (heardType === type) listener()
  }
}

function stubAudio() {
  vi.stubGlobal('Audio', FakeAudio)
  let made = 0
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++made}`)
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
  return { create, revoke, element: () => FakeAudio.last! }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  FakeAudio.last = null
})

describe('playing the owl\'s voice in the browser', () => {
  it('is absent where the browser has no audio element', () => {
    vi.stubGlobal('Audio', undefined)
    expect(browserAudioOutput()).toBeNull()
  })

  it('unlocks the element with silence when it is made, so audio that arrives later may play', () => {
    const { element, revoke } = stubAudio()
    browserAudioOutput()
    expect(element().started).toHaveLength(1)
    expect(element().started[0]).toMatch(/^data:audio\/wav;base64,/)
    // The end of that silence is the end of no piece.
    element().fire('ended')
    expect(revoke).not.toHaveBeenCalled()
  })

  it('plays a piece to its end and then lets go of it', async () => {
    const { element, revoke } = stubAudio()
    const output = browserAudioOutput()!
    const done = output.play(new Blob(['a']))
    expect(element().started[1]).toBe('blob:1')
    element().fire('ended')
    await expect(done).resolves.toBeUndefined()
    expect(revoke).toHaveBeenCalledWith('blob:1')
  })

  it('rejects when the device cannot play the piece or refuses to', async () => {
    const { element } = stubAudio()
    const output = browserAudioOutput()!
    const broken = output.play(new Blob(['a']))
    element().fire('error')
    await expect(broken).rejects.toThrow('audio playback failed')
    element().refuse = true
    await expect(output.play(new Blob(['b']))).rejects.toThrow('audio playback refused')
  })

  it('stop pauses and ends the piece for the caller, and a late end of it changes nothing', async () => {
    const { element, revoke } = stubAudio()
    const output = browserAudioOutput()!
    const done = output.play(new Blob(['a']))
    output.stop()
    await expect(done).resolves.toBeUndefined()
    expect(element().paused).toBe(1)
    expect(revoke).toHaveBeenCalledTimes(1)
    element().fire('ended')
    expect(revoke).toHaveBeenCalledTimes(1)
  })
})
