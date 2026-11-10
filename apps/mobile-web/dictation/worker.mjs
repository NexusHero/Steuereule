// On-device dictation worker (#451 slice 5, ADR-0061). Served from the app's own origin under
// /dictation/, next to a pinned transformers.js build and the ONNX runtime it needs. It never
// fetches a model itself: every model file comes from the verified Cache Storage entries the
// main thread wrote after checking their SHA-256, and remote loading is switched off. The audio
// arrives as samples in memory and leaves only as text.
import { env, pipeline } from './transformers.min.js'

const MODEL_CACHE = 'steuereule-dictation-model-v1'
const cacheKey = (path) => `${self.location.origin}/__dictation-model__/${path}`

let transcriber = null

// A worker answers its own page; there is no target origin, the options form names the transfer list.
const reply = (message) => self.postMessage(message, { transfer: [] })

function configure(files) {
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = '/__dictation-offline__/'
  env.useBrowserCache = false
  env.useWasmCache = false
  env.useCustomCache = true
  env.customCache = {
    async match(key) {
      const request = typeof key === 'string' ? key : key.url
      const file = files.find((path) => request.endsWith(`/${path}`))
      if (!file) return undefined
      const cache = await caches.open(MODEL_CACHE)
      return (await cache.match(cacheKey(file))) ?? undefined
    },
    async put() {
      // Only the main thread writes, and only verified bytes.
    },
  }
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL('./ort/ort-wasm-simd-threaded.asyncify.mjs', self.location.href).href,
    wasm: new URL('./ort/ort-wasm-simd-threaded.asyncify.wasm', self.location.href).href,
  }
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'load') {
      configure(data.files)
      transcriber = await pipeline('automatic-speech-recognition', data.repo, {
        revision: data.revision,
        device: 'webgpu',
        dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      })
      reply({ type: 'ready' })
    } else if (data.type === 'transcribe') {
      if (!transcriber) throw new Error('model not loaded')
      const out = await transcriber(data.audio, { language: 'german', task: 'transcribe' })
      reply({ type: 'result', id: data.id, text: String(out.text ?? '').trim() })
    }
  } catch (error) {
    reply({ type: 'error', id: data.id, message: error instanceof Error ? error.message : String(error) })
  }
})
