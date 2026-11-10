#!/usr/bin/env node
// Self-hosted runtime for on-device dictation (#451 slice 5, ADR-0061). The model itself comes
// from Hugging Face after consent; the code that runs it does not: this copies our worker, a
// pinned transformers.js build and the ONNX runtime WASM into public/dictation/ (served
// same-origin, part of `expo export`) and verifies every byte against dictation-assets.lock.json.
// Without it, transformers.js would load the runtime from a public CDN.
//
//   node scripts/dictation-assets.mjs            copy + verify (postinstall)
//   node scripts/dictation-assets.mjs --update   rewrite the lock after an intentional change
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
// transformers.js has no ./package.json export; follow the pnpm symlink to its directory instead.
const transformersDir = realpathSync(join(appRoot, 'node_modules', '@huggingface', 'transformers'))
// The WASM runtime must be the exact build bundled inside transformers.min.js (checked below),
// which can differ from the onnxruntime-web dependency of its ESM build — hence the alias.
const ortDir = realpathSync(join(appRoot, 'node_modules', 'onnxruntime-web-transformers'))
const bundledOrt = /1\.\d+\.\d+-dev\.\d+-[0-9a-f]+/.exec(readFileSync(join(transformersDir, 'dist', 'transformers.min.js'), 'utf8'))?.[0]
const ortVersion = JSON.parse(readFileSync(join(ortDir, 'package.json'), 'utf8')).version
if (bundledOrt !== ortVersion) {
  console.error(`dictation-assets: transformers.min.js bundles onnxruntime-web ${bundledOrt}, but ${ortVersion} is installed.`)
  console.error('Align the onnxruntime-web-transformers alias in package.json with the bundled version.')
  process.exit(1)
}

const ASSETS = [
  { from: join(appRoot, 'dictation', 'worker.mjs'), to: 'dictation-worker.mjs' },
  { from: join(transformersDir, 'dist', 'transformers.min.js'), to: 'transformers.min.js' },
  { from: join(ortDir, 'dist', 'ort-wasm-simd-threaded.asyncify.mjs'), to: 'ort/ort-wasm-simd-threaded.asyncify.mjs' },
  { from: join(ortDir, 'dist', 'ort-wasm-simd-threaded.asyncify.wasm'), to: 'ort/ort-wasm-simd-threaded.asyncify.wasm' },
]

const lockPath = join(appRoot, 'dictation-assets.lock.json')
const outDir = join(appRoot, 'public', 'dictation')
const update = process.argv.includes('--update')
const lock = update ? {} : JSON.parse(readFileSync(lockPath, 'utf8'))
const nextLock = {}

for (const asset of ASSETS) {
  const bytes = readFileSync(asset.from)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (!update && lock[asset.to] !== sha256) {
    console.error(`dictation-assets: ${asset.to} does not match dictation-assets.lock.json (got ${sha256}).`)
    console.error('If this change is intentional, review it and run: node scripts/dictation-assets.mjs --update')
    process.exit(1)
  }
  nextLock[asset.to] = sha256
  const target = join(outDir, asset.to)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(asset.from, target)
}

if (update) writeFileSync(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`)
console.log(`dictation-assets: ${ASSETS.length} pinned files ready in public/dictation/`)
