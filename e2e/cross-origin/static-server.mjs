// Minimal static file server for the exported web bundle (`expo export --platform web`).
// Deliberately dependency-free (no `serve`/`http-server` package) — this only needs to
// answer plain GETs for the handful of file types Metro's web export produces, on its
// own origin/port, so the cross-origin gate (run.mjs) can prove real browser-enforced
// CORS between two distinct localhost origins (API vs web), not same-origin.
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.wasm'])

// Hosts the on-device dictation downloads its model from (src/lib/dictation/modelStore.ts); the file
// hosts redirect to the CDN names below.
const MODEL_HOSTS = ['https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co']

/**
 * Headers every response carries. The Content-Security-Policy is only sent when the API origin is known
 * (production: the Dockerfile and the deploy pass it): without it the page cannot be told which origin
 * it may call, and the local E2E servers that start without it keep running unrestricted.
 *
 * Why each source (index.html has no inline script, the bundle no eval):
 *  - style-src 'unsafe-inline': react-native-web writes its styles into <style> tags at runtime.
 *  - script-src 'wasm-unsafe-eval': Tesseract (OCR) and onnxruntime (dictation) compile WebAssembly.
 *  - worker-src 'self' blob:: workers are served from /ocr and /dictation; the OCR library may wrap one in a blob.
 *  - connect-src: the API origin, plus the model host for the dictation download.
 *  - img-src data: blob:: inlined icons and receipt previews.
 */
export function securityHeaders(apiOrigin) {
  const headers = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(self), microphone=(self), geolocation=(), payment=()',
  }
  if (apiOrigin) {
    headers['content-security-policy'] = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${apiOrigin} ${MODEL_HOSTS.join(' ')}`,
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  }
  return headers
}

/** The origin of a URL ("https://api.example.org/x" -> "https://api.example.org"), or null when it is none. */
export function originOf(value) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Starts a static file server rooted at `rootDir`, falling back to `index.html` for any
 * path that doesn't resolve to a real file (Expo's web export is a single-page bundle).
 * Resolves once the server is actually listening.
 */
export function startStaticServer(rootDir, port, host = '127.0.0.1', options = {}) {
  const baseHeaders = securityHeaders(originOf(options.apiOrigin))
  const fileCache = new Map()

  async function loadAsset(filePath) {
    const cached = fileCache.get(filePath)
    if (cached) return cached

    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat || fileStat.isDirectory()) return null

    const body = await readFile(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`
    const gzipBody = COMPRESSIBLE_EXTENSIONS.has(ext) && body.length >= 256 ? gzipSync(body) : null

    const asset = { body, gzipBody, contentType, etag }
    fileCache.set(filePath, asset)
    return asset
  }

  const server = createServer(async (req, res) => {
    try {
      const requestPath = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://placeholder').pathname))
      const safeSuffix = requestPath.replace(/^(\.\.[/\\])+/, '')
      const candidatePath = join(rootDir, safeSuffix)

      let isImmutableAsset = requestPath.startsWith('/_expo/static/')
      let asset = await loadAsset(candidatePath)
      if (!asset) {
        isImmutableAsset = false
        asset = await loadAsset(join(rootDir, 'index.html'))
      }
      if (!asset) {
        res.writeHead(404, { ...baseHeaders, 'content-type': 'text/plain' })
        res.end('Not found')
        return
      }

      const cacheControl = isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache'

      if (req.headers['if-none-match'] === asset.etag) {
        res.writeHead(304, {
          ...baseHeaders,
          etag: asset.etag,
          'cache-control': cacheControl,
        })
        res.end()
        return
      }

      const acceptEncoding = String(req.headers['accept-encoding'] ?? '')
      const useGzip = asset.gzipBody !== null && /\bgzip\b/.test(acceptEncoding)
      const payload = useGzip ? asset.gzipBody : asset.body

      const headers = {
        ...baseHeaders,
        'content-type': asset.contentType,
        'content-length': payload.length,
        'cache-control': cacheControl,
        etag: asset.etag,
        vary: 'Accept-Encoding',
      }
      if (useGzip) {
        headers['content-encoding'] = 'gzip'
      }

      res.writeHead(200, headers)
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(payload)
    } catch (error) {
      res.writeHead(500, { ...baseHeaders, 'content-type': 'text/plain' })
      res.end(`Internal error: ${String(error)}`)
    }
  })

  return new Promise((promiseResolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => promiseResolve(server))
  })
}

// CLI entry point — `node static-server.mjs --root <dir> --port <n> [--host <h>] [--api-origin <url>]`.
// The API origin (for the CSP connect-src) may also come from the env API_ORIGIN.
// Used by CI/local scripts to boot the exported web bundle as its own background
// process (pidfile-tracked), symmetric with how the compiled API is booted, so both
// halves of the cross-origin pair are killed by PID only (#114), never a blanket kill.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const args = process.argv.slice(2)
  const getArg = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index === -1 ? fallback : args[index + 1]
  }

  const root = resolve(getArg('--root', 'dist'))
  const port = Number(getArg('--port', '4173'))
  const host = getArg('--host', '127.0.0.1')

  const apiOrigin = getArg('--api-origin', process.env.API_ORIGIN)
  if (apiOrigin && !originOf(apiOrigin)) {
    console.error(`[static-server] API origin is not a URL: ${apiOrigin}`)
    process.exit(1)
  }

  startStaticServer(root, port, host, { apiOrigin })
    .then(() => {
      console.log(`[static-server] serving ${root} at http://${host}:${port}${apiOrigin ? ` (CSP for API ${originOf(apiOrigin)})` : ' (no CSP: API origin unknown)'}`)
    })
    .catch((error) => {
      console.error(`[static-server] failed to start: ${String(error)}`)
      process.exit(1)
    })
}
