import { describe, expect, it } from 'vitest'
import { loudnessEnvelope, wavFromSamples } from './wav'

describe('an utterance as a WAV file', () => {
  it('writes a 16-bit mono header and the samples, clamped', () => {
    const wav = new DataView(wavFromSamples(new Float32Array([0, 0.5, -1, 2]), 16_000))
    const ascii = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(offset + i)))
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(wav.getUint32(4, true)).toBe(36 + 8)
    expect([wav.getUint16(20, true), wav.getUint16(22, true), wav.getUint32(24, true), wav.getUint32(28, true), wav.getUint16(34, true)]).toEqual([1, 1, 16_000, 32_000, 16])
    expect(wav.getUint32(40, true)).toBe(8)
    expect([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(48, true), wav.getInt16(50, true)]).toEqual([0, 16_384, -32_767, 32_767])
  })
})

describe('how loud a WAV file is over time', () => {
  it('gives one value per step: silence, then a tone', () => {
    const samples = new Float32Array(1_600)
    for (let i = 800; i < 1_600; i += 1) samples[i] = i % 2 === 0 ? 0.5 : -0.5
    const envelope = loudnessEnvelope(wavFromSamples(samples, 16_000), 50)
    expect(envelope).toHaveLength(2)
    expect(envelope[0]).toBe(0)
    expect(envelope[1]).toBeCloseTo(0.5, 2)
  })

  it('is empty for anything that is no such file', () => {
    expect(loudnessEnvelope(new ArrayBuffer(10), 50)).toEqual([])
    expect(loudnessEnvelope(new TextEncoder().encode('ID3 this is an mp3, certainly not a wave file, but long enough').buffer as ArrayBuffer, 50)).toEqual([])
  })
})
