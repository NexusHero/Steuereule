import { DICTATION_MODEL } from './modelLock'

/**
 * Download, verification and storage of the on-device dictation model (#451 slice 5, ADR-0061).
 * Only after consent, only from the pinned Hugging Face commit, and only bytes whose SHA-256
 * matches the lock land in Cache Storage. The cache holds no user data; it is the one
 * documented exception to ADR-0008 and is removed with „Sprachmodell löschen“.
 */
export const DICTATION_MODEL_CACHE = 'steuereule-dictation-model-v1'

export interface ModelFile {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

export interface ModelStoreDeps {
  readonly fetch: typeof fetch
  readonly caches: CacheStorage
  readonly subtle: SubtleCrypto
  readonly origin: string
  readonly model?: { readonly repo: string; readonly revision: string; readonly files: readonly ModelFile[] }
}

export class ModelChecksumError extends Error {
  constructor(readonly path: string) {
    super(`Prüfsumme von ${path} stimmt nicht.`)
    this.name = 'ModelChecksumError'
  }
}

export function defaultModelStoreDeps(): ModelStoreDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    caches: globalThis.caches,
    subtle: globalThis.crypto.subtle,
    origin: globalThis.location.origin,
  }
}

/** The key a verified file is stored under; dictation/worker.mjs reads the same keys. */
export function modelCacheKey(origin: string, path: string): string {
  return `${origin}/__dictation-model__/${path}`
}

export function modelDownloadUrl(repo: string, revision: string, path: string): string {
  return `https://huggingface.co/${repo}/resolve/${revision}/${path}`
}

async function sha256Hex(subtle: SubtleCrypto, bytes: ArrayBuffer): Promise<string> {
  const digest = await subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function isDictationModelCached(deps: ModelStoreDeps = defaultModelStoreDeps()): Promise<boolean> {
  const model = deps.model ?? DICTATION_MODEL
  if (!(await deps.caches.has(DICTATION_MODEL_CACHE))) return false
  const cache = await deps.caches.open(DICTATION_MODEL_CACHE)
  for (const file of model.files) {
    if (!(await cache.match(modelCacheKey(deps.origin, file.path)))) return false
  }
  return true
}

/**
 * Loads every missing file, checks it and stores it. A single mismatch deletes the whole cache:
 * nothing half-verified is ever left for the worker to load.
 */
export async function ensureDictationModel(
  onProgress: (loadedBytes: number, totalBytes: number) => void = () => {},
  deps: ModelStoreDeps = defaultModelStoreDeps(),
): Promise<void> {
  const model = deps.model ?? DICTATION_MODEL
  const total = model.files.reduce((sum, f) => sum + f.size, 0)
  const cache = await deps.caches.open(DICTATION_MODEL_CACHE)
  let loaded = 0
  try {
    for (const file of model.files) {
      const key = modelCacheKey(deps.origin, file.path)
      if (!(await cache.match(key))) {
        const res = await deps.fetch(modelDownloadUrl(model.repo, model.revision, file.path), {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        })
        if (!res.ok) throw new Error(`Download von ${file.path} fehlgeschlagen (HTTP ${res.status}).`)
        const bytes = await res.arrayBuffer()
        if ((await sha256Hex(deps.subtle, bytes)) !== file.sha256) throw new ModelChecksumError(file.path)
        await cache.put(key, new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } }))
      }
      loaded += file.size
      onProgress(loaded, total)
    }
  } catch (error) {
    await deps.caches.delete(DICTATION_MODEL_CACHE)
    throw error
  }
}

export async function deleteDictationModel(deps: ModelStoreDeps = defaultModelStoreDeps()): Promise<void> {
  await deps.caches.delete(DICTATION_MODEL_CACHE)
}
