import { DICTATION_MODEL } from './modelLock'

/** The self-hosted worker (copied by scripts/dictation-assets.mjs, ADR-0061). */
export const DICTATION_WORKER_URL = '/dictation/dictation-worker.mjs'

let worker: Worker | null = null
let ready: Promise<void> | null = null
let nextId = 1
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>()

/** Starts the worker and loads the (already verified, cached) model into it once. */
export function loadTranscriber(): Promise<void> {
  if (ready) return ready
  const w = new Worker(DICTATION_WORKER_URL, { type: 'module' })
  worker = w
  ready = new Promise<void>((resolve, reject) => {
    w.addEventListener('message', ({ data }: MessageEvent<{ type: string; id?: number; text?: string; message?: string }>) => {
      if (data.type === 'ready') resolve()
      else if (data.type === 'result' && data.id !== undefined) {
        pending.get(data.id)?.resolve(data.text ?? '')
        pending.delete(data.id)
      } else if (data.type === 'error') {
        const error = new Error(data.message ?? 'Diktat fehlgeschlagen.')
        if (data.id !== undefined) {
          pending.get(data.id)?.reject(error)
          pending.delete(data.id)
        } else reject(error)
      }
    })
  })
  ready.catch(() => disposeTranscriber())
  // A dedicated worker has no target origin; the options form names the (empty) transfer list.
  w.postMessage(
    { type: 'load', repo: DICTATION_MODEL.repo, revision: DICTATION_MODEL.revision, files: DICTATION_MODEL.files.map((f) => f.path) },
    { transfer: [] },
  )
  return ready
}

export async function transcribe(audio: Float32Array): Promise<string> {
  await loadTranscriber()
  const id = nextId++
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ type: 'transcribe', id, audio }, { transfer: [audio.buffer] })
  })
}

export function disposeTranscriber(): void {
  worker?.terminate()
  worker = null
  ready = null
  for (const { reject } of pending.values()) reject(new Error('Diktat beendet.'))
  pending.clear()
}
