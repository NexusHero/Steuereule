const HEADER_BYTES = 44

/** Mono samples (-1 to 1) as a 16-bit WAV file: the one format every speech provider reads. */
export function wavFromSamples(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + samples.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(HEADER_BYTES + i * 2, Math.round(clamped * 32_767), true)
  }
  return buffer
}

/**
 * How loud a 16-bit WAV file is over time: one RMS value (0 to 1) per `stepMs`. The line of a spoken
 * conversation follows it while the file plays. Empty for anything that is not such a file.
 */
export function loudnessEnvelope(wav: ArrayBuffer, stepMs: number): number[] {
  const view = new DataView(wav)
  if (wav.byteLength <= HEADER_BYTES || view.getUint32(0, false) !== 0x52494646 || view.getUint16(34, true) !== 16) return []
  const channels = Math.max(1, view.getUint16(22, true))
  const frame = Math.max(1, Math.round((view.getUint32(24, true) * stepMs) / 1000)) * channels
  const samples = Math.floor((wav.byteLength - HEADER_BYTES) / 2)
  const envelope: number[] = []
  for (let start = 0; start < samples; start += frame) {
    const end = Math.min(samples, start + frame)
    let sum = 0
    for (let i = start; i < end; i += 1) {
      const value = view.getInt16(HEADER_BYTES + i * 2, true) / 32_768
      sum += value * value
    }
    envelope.push(Math.sqrt(sum / (end - start)))
  }
  return envelope
}
