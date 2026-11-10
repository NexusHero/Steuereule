#!/usr/bin/env node
// Self-hosted on-device OCR (ADR-0060). tesseract.js would otherwise fetch its worker, the
// WASM core and the language data from a public CDN at runtime — leaking the user's IP to a
// third party and executing unpinned code. This copies the pinned files from node_modules into
// public/ocr/ (served same-origin, part of `expo export`) and verifies every byte against
// ocr-assets.lock.json, so a changed upstream file fails the build instead of shipping.
//
//   node scripts/ocr-assets.mjs            copy + verify (postinstall)
//   node scripts/ocr-assets.mjs --update   rewrite the lock after an intentional upgrade
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const require = createRequire(join(appRoot, 'package.json'))
const tesseractDir = dirname(require.resolve('tesseract.js/package.json'))
const coreDir = dirname(createRequire(join(tesseractDir, 'package.json')).resolve('tesseract.js-core/package.json'))
const langDir = (lang) => join(dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0_best_int')

const ASSETS = [
  { from: join(tesseractDir, 'dist', 'worker.min.js'), to: 'worker.min.js' },
  { from: join(coreDir, 'tesseract-core-lstm.wasm.js'), to: 'core/tesseract-core-lstm.wasm.js' },
  { from: join(coreDir, 'tesseract-core-simd-lstm.wasm.js'), to: 'core/tesseract-core-simd-lstm.wasm.js' },
  { from: join(coreDir, 'tesseract-core-relaxedsimd-lstm.wasm.js'), to: 'core/tesseract-core-relaxedsimd-lstm.wasm.js' },
  { from: join(langDir('deu'), 'deu.traineddata.gz'), to: 'lang/deu.traineddata.gz' },
  { from: join(langDir('eng'), 'eng.traineddata.gz'), to: 'lang/eng.traineddata.gz' },
]

const lockPath = join(appRoot, 'ocr-assets.lock.json')
const outDir = join(appRoot, 'public', 'ocr')
const update = process.argv.includes('--update')
const lock = update ? {} : JSON.parse(readFileSync(lockPath, 'utf8'))
const nextLock = {}

for (const asset of ASSETS) {
  const bytes = readFileSync(asset.from)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (!update && lock[asset.to] !== sha256) {
    console.error(`ocr-assets: ${asset.to} does not match ocr-assets.lock.json (got ${sha256}).`)
    console.error('If this upgrade is intentional, review it and run: node scripts/ocr-assets.mjs --update')
    process.exit(1)
  }
  nextLock[asset.to] = sha256
  const target = join(outDir, asset.to)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(asset.from, target)
}

if (update) writeFileSync(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`)
console.log(`ocr-assets: ${ASSETS.length} pinned files ready in public/ocr/`)
