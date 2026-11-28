const HEADER_BYTES = 44

export const isWav = (bytes: Buffer): boolean => bytes.length > HEADER_BYTES && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE'

/** Wraps 16-bit mono PCM in a WAV header. */
export function wavFromPcm(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'latin1')
  header.write('fmt ', 12, 'latin1')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'latin1')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** The sample rate a provider names in `audio/L16;rate=24000`, else the 24 kHz the speech models answer in. */
export function sampleRateOf(mimeType: string | undefined, fallback = 24_000): number {
  const rate = /rate=(\d{4,6})/.exec(mimeType ?? '')?.[1]
  return rate === undefined ? fallback : Number.parseInt(rate, 10)
}
