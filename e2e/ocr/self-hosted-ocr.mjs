// Self-hosted on-device OCR smoke (ADR-0060, #444 review point 2).
//
// The unit tests mock tesseract.js, and the bundle gate only proves the pinned files are in the
// export. This gate proves the part neither can: that in a REAL Chromium, against the REAL static
// server that ships the web bundle, the worker, the WASM core and the German language data load
// from OUR origin and actually read text — and that not a single request leaves that origin.
//
// It needs no account: it loads the exported app's origin, injects the very tesseract.js build the
// app bundles (same node_modules package), and calls createWorker with the same self-hosted paths
// as apps/mobile-web/src/lib/documentOcr.ts (selfHostedOcrPaths). The image is a rendered LStB
// row, so the check is "a certificate line comes back as text", not just "files return 200".
//
//   WEB_ORIGIN=http://localhost:4173 node e2e/ocr/self-hosted-ocr.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const WEB_ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:4173').replace(/\/$/, '')
const appRequire = createRequire(fileURLToPath(new URL('../../apps/mobile-web/package.json', import.meta.url)))
const TESSERACT_UMD = readFileSync(appRequire.resolve('tesseract.js/dist/tesseract.min.js'), 'utf8')
const OCR_TIMEOUT_MS = 120_000

function fail(message) {
  console.error(`[self-hosted-ocr] FAIL — ${message}`)
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  const requested = []
  context.on('request', (request) => requested.push(request.url()))
  const page = await context.newPage()

  await page.goto(`${WEB_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.addScriptTag({ content: TESSERACT_UMD })

  const text = await page.evaluate(
    async ({ origin, timeoutMs }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1400
      canvas.height = 160
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#000000'
      ctx.font = '56px Arial, sans-serif'
      ctx.fillText('3. Bruttoarbeitslohn 48.000,00', 30, 100)

      const base = `${origin}/ocr`
      const work = (async () => {
        const worker = await globalThis.Tesseract.createWorker('deu+eng', 1, {
          workerPath: `${base}/worker.min.js`,
          corePath: `${base}/core`,
          langPath: `${base}/lang`,
          gzip: true,
          workerBlobURL: false,
        })
        try {
          const result = await worker.recognize(canvas)
          return result.data.text
        } finally {
          await worker.terminate()
        }
      })()
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timed out')), timeoutMs))
      return Promise.race([work, timeout])
    },
    { origin: WEB_ORIGIN, timeoutMs: OCR_TIMEOUT_MS },
  )

  if (!/Bruttoarbeitslohn/i.test(text) || !/48[.,]?000/.test(text)) {
    fail(`OCR did not read the certificate row back (got ${JSON.stringify(text)}).`)
  }

  const foreign = requested.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== WEB_ORIGIN)
  if (foreign.length > 0) {
    fail(`requests left the app origin (ADR-0060): ${[...new Set(foreign)].join(', ')}`)
  }

  for (const expected of ['/ocr/worker.min.js', '/ocr/core/', '/ocr/lang/deu.traineddata.gz']) {
    if (!requested.some((url) => url.startsWith(`${WEB_ORIGIN}${expected}`))) {
      fail(`expected a same-origin request for ${expected}; got ${requested.filter((u) => u.includes('/ocr/')).join(', ') || 'none'}`)
    }
  }

  console.log(
    `[self-hosted-ocr] PASS — read ${JSON.stringify(text.trim())} with ${requested.filter((u) => u.includes('/ocr/')).length} same-origin OCR requests, 0 foreign requests.`,
  )
} finally {
  await browser.close()
}
