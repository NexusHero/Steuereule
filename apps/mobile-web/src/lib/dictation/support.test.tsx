import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectDictationSupport } from './support'

const nav = (over: Record<string, unknown>) => ({ gpu: { requestAdapter: async () => ({}) }, deviceMemory: 8, mediaDevices: { getUserMedia: () => {} }, ...over })

afterEach(() => vi.unstubAllGlobals())

describe('detectDictationSupport (#451 slice 5)', () => {
  it('needs WebGPU', async () => {
    expect(await detectDictationSupport(nav({ gpu: undefined }))).toEqual({ supported: false, reason: 'no-webgpu' })
    expect(await detectDictationSupport(nav({ gpu: { requestAdapter: async () => null } }))).toEqual({ supported: false, reason: 'no-webgpu' })
  })

  it('needs enough memory, but does not punish a browser that reports none', async () => {
    expect(await detectDictationSupport(nav({ deviceMemory: 2 }))).toEqual({ supported: false, reason: 'low-memory' })
    vi.stubGlobal('caches', {})
    vi.stubGlobal('Worker', function Worker() {})
    expect(await detectDictationSupport(nav({ deviceMemory: undefined }))).toEqual({ supported: true })
  })

  it('needs a microphone API', async () => {
    expect(await detectDictationSupport(nav({ mediaDevices: undefined }))).toEqual({ supported: false, reason: 'no-microphone' })
  })
})
