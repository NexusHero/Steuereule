import { webcrypto, createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { DICTATION_MODEL_CACHE, ModelChecksumError, deleteDictationModel, ensureDictationModel, isDictationModelCached, modelCacheKey, type ModelStoreDeps } from './modelStore'
import { DICTATION_MODEL } from './modelLock'

/** A Map-backed CacheStorage, enough for the store. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, store)
    return {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, res: Response) => void store.set(key, res),
    } as unknown as Cache
  }
  return {
    stores,
    caches: {
      open,
      has: async (name: string) => stores.has(name),
      delete: async (name: string) => stores.delete(name),
    } as unknown as CacheStorage,
  }
}

const bytes = (text: string) => new TextEncoder().encode(text)
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const model = {
  repo: 'onnx-community/whisper-base',
  revision: 'abc123',
  files: [
    { path: 'config.json', size: 2, sha256: sha('{}') },
    { path: 'onnx/encoder.onnx', size: 5, sha256: sha('model') },
  ],
}

function deps(body: (url: string) => string, store = fakeCaches()): { deps: ModelStoreDeps; fetch: ReturnType<typeof vi.fn>; store: ReturnType<typeof fakeCaches> } {
  const fetchFn = vi.fn(async (url: string) => new Response(bytes(body(url))))
  return { deps: { fetch: fetchFn as unknown as typeof fetch, caches: store.caches, subtle: webcrypto.subtle as SubtleCrypto, origin: 'https://app.test', model }, fetch: fetchFn, store }
}

describe('dictation model store (#451 slice 5, AC 8)', () => {
  it('downloads every file from the pinned Hugging Face commit and stores verified bytes', async () => {
    const { deps: d, fetch } = deps((url) => (url.endsWith('config.json') ? '{}' : 'model'))
    const progress = vi.fn()
    await ensureDictationModel(progress, d)
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'https://huggingface.co/onnx-community/whisper-base/resolve/abc123/config.json',
      'https://huggingface.co/onnx-community/whisper-base/resolve/abc123/onnx/encoder.onnx',
    ])
    expect(fetch.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(progress).toHaveBeenLastCalledWith(7, 7)
    expect(await isDictationModelCached(d)).toBe(true)
  })

  it('refuses a file whose checksum does not match and keeps nothing', async () => {
    const { deps: d, store } = deps((url) => (url.endsWith('config.json') ? '{}' : 'tampered'))
    await expect(ensureDictationModel(() => {}, d)).rejects.toBeInstanceOf(ModelChecksumError)
    expect(store.stores.has(DICTATION_MODEL_CACHE)).toBe(false)
    expect(await isDictationModelCached(d)).toBe(false)
  })

  it('does not download again once the model is cached', async () => {
    const store = fakeCaches()
    const first = deps((url) => (url.endsWith('config.json') ? '{}' : 'model'), store)
    await ensureDictationModel(() => {}, first.deps)
    const second = deps(() => 'never', store)
    await ensureDictationModel(() => {}, second.deps)
    expect(second.fetch).not.toHaveBeenCalled()
  })

  it('stores under the keys the worker reads', () => {
    expect(modelCacheKey('https://app.test', 'onnx/encoder.onnx')).toBe('https://app.test/__dictation-model__/onnx/encoder.onnx')
  })

  it('„Sprachmodell löschen“ removes the cache', async () => {
    const { deps: d } = deps((url) => (url.endsWith('config.json') ? '{}' : 'model'))
    await ensureDictationModel(() => {}, d)
    await deleteDictationModel(d)
    expect(await isDictationModelCached(d)).toBe(false)
  })

  it('pins a real commit and a SHA-256 for every model file', () => {
    expect(DICTATION_MODEL.revision).toMatch(/^[0-9a-f]{40}$/)
    for (const file of DICTATION_MODEL.files) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(DICTATION_MODEL.totalBytes).toBeLessThan(90_000_000)
  })
})
