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

/**
 * Starts a static file server rooted at `rootDir`, falling back to `index.html` for any
 * path that doesn't resolve to a real file (Expo's web export is a single-page bundle).
 * Resolves once the server is actually listening.
 */
export function startStaticServer(rootDir, port, host = '127.0.0.1') {
  const fileCache = new Map()

  async function loadAsset(filePath) {
    const cached = fileCache.get(filePath)
    if (cached) return cached

    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat || fileStat.isDirectory()) return null

    const body = await readFile(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`
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
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('Not found')
        return
      }

      const cacheControl = isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache'

      if (req.headers['if-none-match'] === asset.etag) {
        res.writeHead(304, {
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
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end(`Internal error: ${String(error)}`)
    }
  })

  return new Promise((promiseResolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => promiseResolve(server))
  })
}

// CLI entry point — `node static-server.mjs --root <dir> --port <n> [--host <h>]`.
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

  startStaticServer(root, port, host)
    .then(() => {
      console.log(`[static-server] serving ${root} at http://${host}:${port}`)
    })
    .catch((error) => {
      console.error(`[static-server] failed to start: ${String(error)}`)
      process.exit(1)
    })
}
