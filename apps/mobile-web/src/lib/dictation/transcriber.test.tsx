import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DICTATION_WORKER_URL, disposeTranscriber, loadTranscriber, transcribe } from './transcriber'

type Listener = (event: { data: unknown }) => void

class FakeWorker {
  static instances: FakeWorker[] = []
  listeners: Listener[] = []
  posted: { message: { type: string; id?: number }; options?: unknown }[] = []
  terminated = false
  constructor(readonly url: string, readonly options: unknown) {
    FakeWorker.instances.push(this)
  }
  addEventListener(_: string, l: Listener) {
    this.listeners.push(l)
  }
  postMessage(message: { type: string; id?: number }, options?: unknown) {
    this.posted.push({ message, options })
  }
  terminate() {
    this.terminated = true
  }
  emit(data: unknown) {
    this.listeners.forEach((l) => l({ data }))
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  disposeTranscriber()
  vi.unstubAllGlobals()
})

const current = () => FakeWorker.instances[FakeWorker.instances.length - 1]!

describe('the dictation transcriber worker', () => {
  it('starts the self-hosted worker once and asks it to load the pinned model', async () => {
    const first = loadTranscriber()
    const second = loadTranscriber()
    expect(second).toBe(first)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(current().url).toBe(DICTATION_WORKER_URL)
    expect(current().posted[0]!.message.type).toBe('load')
    current().emit({ type: 'ready' })
    await first
  })

  it('returns the text of the matching result and ignores answers for other ids', async () => {
    const load = loadTranscriber()
    current().emit({ type: 'ready' })
    await load
    const text = transcribe(new Float32Array(4))
    await Promise.resolve()
    await Promise.resolve()
    const request = current().posted.find((p) => p.message.type === 'transcribe')!
    current().emit({ type: 'result', id: 999, text: 'fremd' })
    current().emit({ type: 'result', id: request.message.id, text: 'Hallo Eule' })
    expect(await text).toBe('Hallo Eule')
  })

  it('treats a result without text as an empty transcript', async () => {
    const load = loadTranscriber()
    current().emit({ type: 'ready' })
    await load
    const text = transcribe(new Float32Array(1))
    await Promise.resolve()
    await Promise.resolve()
    const id = current().posted.find((p) => p.message.type === 'transcribe')!.message.id
    current().emit({ type: 'result', id })
    expect(await text).toBe('')
  })

  it('rejects the one request that failed and keeps the worker', async () => {
    const load = loadTranscriber()
    current().emit({ type: 'ready' })
    await load
    const text = transcribe(new Float32Array(1))
    await Promise.resolve()
    await Promise.resolve()
    const id = current().posted.find((p) => p.message.type === 'transcribe')!.message.id
    current().emit({ type: 'error', id, message: 'kaputt' })
    await expect(text).rejects.toThrow('kaputt')
    expect(current().terminated).toBe(false)
  })

  it('fails the load, with a default message, and drops the worker so the next try starts fresh', async () => {
    const load = loadTranscriber()
    const worker = current()
    worker.emit({ type: 'error' })
    await expect(load).rejects.toThrow('Diktat fehlgeschlagen.')
    await Promise.resolve()
    expect(worker.terminated).toBe(true)
    void loadTranscriber().catch(() => {})
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('rejects requests still waiting when the transcriber is disposed', async () => {
    const load = loadTranscriber()
    current().emit({ type: 'ready' })
    await load
    const text = transcribe(new Float32Array(1))
    await Promise.resolve()
    await Promise.resolve()
    disposeTranscriber()
    await expect(text).rejects.toThrow('Diktat beendet.')
    expect(current().terminated).toBe(true)
  })

  it('does nothing when there is no worker to dispose', () => {
    expect(() => disposeTranscriber()).not.toThrow()
  })
})
