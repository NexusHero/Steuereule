#!/usr/bin/env node
// Web Bundle Size & Secret-Leak Gate (DevSecOps Pillar 8).
//
// Inspects the exported client bundle (`apps/mobile-web/dist`) and asserts:
//   1. The export directory exists and contains `index.html` and JS bundles.
//   2. Total JS size <= 10 MB and total dist size <= 25 MB (prevents accidental inclusion
//      of server-side packages, test fixtures, or uncompressed assets).
//   3. Zero server-side secret keys, encryption envelopes, or backend-only modules
//      (`PRISMA_FIELD_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `GUEST_SESSION_SECRET`,
//      `STRIPE_SECRET_KEY`, `BREVO_API_KEY`, `k1.aesgcm256.`, `@prisma/client`) appear
//      anywhere in the client bundle.
//   4. The self-hosted OCR assets under ocr/ (ADR-0060) and dictation runtime under dictation/
//      (ADR-0061) are lazily loaded worker files, not app bundles: they are excluded from the app
//      budgets above, each held to its own budget, and must match their lock file byte for byte.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIST_DIR = path.resolve(ROOT, process.argv[2] || 'apps/mobile-web/dist')

const MAX_TOTAL_JS_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_SINGLE_JS_BYTES = 6 * 1024 * 1024 // 6 MB
const MAX_TOTAL_DIST_BYTES = 25 * 1024 * 1024 // 25 MB
const SELF_HOSTED = [
  // worker + 3 WASM cores + deu/eng data
  { dir: 'ocr', lock: path.resolve(ROOT, 'apps/mobile-web/ocr-assets.lock.json'), maxBytes: 24 * 1024 * 1024, adr: 'ADR-0060' },
  // worker + transformers.js + ONNX runtime WASM; the model itself is loaded from Hugging Face after consent
  { dir: 'dictation', lock: path.resolve(ROOT, 'apps/mobile-web/dictation-assets.lock.json'), maxBytes: 32 * 1024 * 1024, adr: 'ADR-0061' },
]

const FORBIDDEN_CLIENT_PATTERNS = [
  { id: 'PRISMA_FIELD_ENCRYPTION_KEY', regex: /PRISMA_FIELD_ENCRYPTION_KEY/ },
  { id: 'AESGCM256_KEY_MATERIAL', regex: /k\d+\.aesgcm256\.[A-Za-z0-9+/=]{20,}/ },
  { id: 'BETTER_AUTH_SECRET_VALUE', regex: /better-auth-secret-[0-9a-zA-Z]{6,}|BETTER_AUTH_SECRET\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/ },
  { id: 'GUEST_SESSION_SECRET', regex: /GUEST_SESSION_SECRET/ },
  { id: 'STRIPE_SECRET_KEY', regex: /STRIPE_SECRET_KEY|sk_live_[0-9a-zA-Z]{16,}|sk_test_[0-9a-zA-Z]{16,}/ },
  { id: 'STRIPE_WEBHOOK_SECRET', regex: /STRIPE_WEBHOOK_SECRET|whsec_[0-9a-zA-Z]{16,}/ },
  { id: 'BREVO_API_KEY', regex: /BREVO_API_KEY|xkeysib-[0-9a-zA-Z-]{16,}/ },
  { id: 'GOOGLE_CLIENT_SECRET', regex: /GOOGLE_CLIENT_SECRET|GOCSPX-[0-9a-zA-Z_-]{16,}/ },
  { id: 'SERVER_PRISMA_CLIENT', regex: /@prisma\/client\/runtime/ },
]

function walkFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFiles(full))
    } else if (entry.isFile()) {
      results.push(full)
    }
  }
  return results
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(`[bundle-security-check] FAIL — Export directory does not exist: ${DIST_DIR}`)
  console.error(`Run 'pnpm --filter @steuereule/mobile-web exec expo export --platform web' first.`)
  process.exit(1)
}

const indexHtml = path.join(DIST_DIR, 'index.html')
if (!fs.existsSync(indexHtml)) {
  console.error(`[bundle-security-check] FAIL — Missing index.html in ${DIST_DIR}`)
  process.exit(1)
}

const files = walkFiles(DIST_DIR)
let totalDistBytes = 0
let totalJsBytes = 0
let jsFileCount = 0
const selfHosted = new Map(SELF_HOSTED.map((set) => [set.dir, { ...set, bytes: 0, files: new Map() }]))
const findings = []

for (const file of files) {
  const stat = fs.statSync(file)
  const rel = path.relative(DIST_DIR, file)
  const set = selfHosted.get(rel.split(path.sep)[0])
  if (set) {
    set.bytes += stat.size
    set.files.set(rel.split(path.sep).slice(1).join('/'), file)
    continue
  }
  totalDistBytes += stat.size

  if (file.endsWith('.js') || file.endsWith('.mjs')) {
    jsFileCount++
    totalJsBytes += stat.size
    if (stat.size > MAX_SINGLE_JS_BYTES) {
      findings.push(
        `Single JS bundle exceeds budget: ${rel} is ${(stat.size / (1024 * 1024)).toFixed(2)} MB (max ${(MAX_SINGLE_JS_BYTES / (1024 * 1024)).toFixed(2)} MB)`,
      )
    }
  }

  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.html') || file.endsWith('.json')) {
    const content = fs.readFileSync(file, 'utf8')
    for (const rule of FORBIDDEN_CLIENT_PATTERNS) {
      if (rule.regex.test(content)) {
        findings.push(`Forbidden server secret/module pattern [${rule.id}] leaked in client asset: ${rel}`)
      }
    }
  }
}

if (jsFileCount === 0) {
  findings.push(`Zero JS bundle files found under ${DIST_DIR}`)
}

if (totalJsBytes > MAX_TOTAL_JS_BYTES) {
  findings.push(
    `Total JS size ${(totalJsBytes / (1024 * 1024)).toFixed(2)} MB exceeds budget of ${(MAX_TOTAL_JS_BYTES / (1024 * 1024)).toFixed(2)} MB`,
  )
}

for (const set of selfHosted.values()) {
  const lock = JSON.parse(fs.readFileSync(set.lock, 'utf8'))
  const lockName = path.basename(set.lock)
  for (const [asset, expected] of Object.entries(lock)) {
    const file = set.files.get(asset)
    if (!file) {
      findings.push(`Self-hosted asset missing from the export: ${set.dir}/${asset} (${set.adr})`)
      continue
    }
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    if (actual !== expected) findings.push(`Asset ${set.dir}/${asset} does not match ${lockName}`)
  }
  for (const asset of set.files.keys()) {
    if (!(asset in lock)) findings.push(`Unpinned file in ${set.dir}/: ${asset}`)
  }
  if (set.bytes > set.maxBytes) {
    findings.push(`${set.dir}/ assets ${(set.bytes / (1024 * 1024)).toFixed(2)} MB exceed their budget of ${(set.maxBytes / (1024 * 1024)).toFixed(2)} MB`)
  }
}
if (totalDistBytes > MAX_TOTAL_DIST_BYTES) {
  findings.push(
    `Total dist size ${(totalDistBytes / (1024 * 1024)).toFixed(2)} MB exceeds budget of ${(MAX_TOTAL_DIST_BYTES / (1024 * 1024)).toFixed(2)} MB`,
  )
}

if (findings.length > 0) {
  console.error('[bundle-security-check] FAIL — Web bundle security or budget violations:')
  for (const f of findings) {
    console.error(`  - ${f}`)
  }
  process.exit(1)
}

console.log(
  `[bundle-security-check] PASS — Verified ${files.length} files (${jsFileCount} JS bundles, ${(totalJsBytes / (1024 * 1024)).toFixed(2)} MB JS, ${(totalDistBytes / (1024 * 1024)).toFixed(2)} MB total); 0 leaked server secrets or modules.`,
)
