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

const FRAME_SECONDS = 0.05
/** A frame counts as sound above this level (about -40 dBFS): a quiet room and a microphone's own noise stay below it. */
const SOUND_RMS = 0.01
/** Three such frames, 150 ms, are the shortest word. */
const SOUND_FRAMES = 3

/**
 * Whether a 16-bit WAV file has anything in it that could be a word. A speech model asked to write down
 * silence invents a sentence (measured 28.11.2026), so silence never reaches one.
 */
export function hasSound(wav: Buffer): boolean {
  if (!isWav(wav) || wav.readUInt16LE(34) !== 16) return true
  const channels = Math.max(1, wav.readUInt16LE(22))
  const frame = Math.max(1, Math.round(wav.readUInt32LE(24) * FRAME_SECONDS)) * channels
  const samples = Math.floor((wav.length - HEADER_BYTES) / 2)
  let loud = 0
  for (let start = 0; start + frame <= samples; start += frame) {
    let sum = 0
    for (let i = start; i < start + frame; i += 1) {
      const value = wav.readInt16LE(HEADER_BYTES + i * 2) / 32_768
      sum += value * value
    }
    if (Math.sqrt(sum / frame) > SOUND_RMS && ++loud >= SOUND_FRAMES) return true
  }
  return false
}
