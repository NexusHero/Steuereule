#!/usr/bin/env node
// License Compliance Gate (DevSecOps Pillar 3).
//
// Walks installed production dependencies across the monorepo and fails if any package
// is exclusively licensed under a forbidden copyleft or source-available license
// (AGPL, GPL, BUSL, SSPL). Dual-licensed packages that include at least one permissive
// license (e.g. "MIT OR GPL-3.0", "(BSD-2-Clause OR GPL-2.0)") are allowed because we
// elect the permissive side.
//
// Zero external dependencies (plain node:fs, node:path).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const FORBIDDEN_PATTERNS = [
  /\bAGPL\b/i,
  /\bGPL\b/i,
  /\bBUSL\b/i,
  /\bBSL-1\./i,
  /\bSSPL\b/i,
]

const PERMISSIVE_ALTERNATIVES = [
  /\bMIT\b/i,
  /\bISC\b/i,
  /\bApache-2\.0\b/i,
  /\bBSD\b/i,
  /\b0BSD\b/i,
  /\bMPL-2\.0\b/i,
  /\bUnlicense\b/i,
  /\bCC0-1\.0\b/i,
  /\bCC-BY\b/i,
  /\bBlueOak\b/i,
  /\bPython-2\.0\b/i,
  /\bZlib\b/i,
  /\bArtistic-2\.0\b/i,
  /\bLGPL\b/i,
]

// Explicit allowlist for build/CLI tools that never ship in production runtime or have
// verified permissive exceptions.
const ALLOWED_PACKAGES = new Set([])

function extractLicenseString(pkgJson) {
  if (!pkgJson) return 'UNKNOWN'
  if (typeof pkgJson.license === 'string') return pkgJson.license.trim()
  if (pkgJson.license && typeof pkgJson.license === 'object' && typeof pkgJson.license.type === 'string') {
    return pkgJson.license.type.trim()
  }
  if (Array.isArray(pkgJson.licenses)) {
    return pkgJson.licenses
      .map((l) => (typeof l === 'string' ? l : l?.type || ''))
      .filter(Boolean)
      .join(' OR ')
  }
  return 'UNKNOWN'
}

function isForbiddenLicense(licenseStr) {
  if (!licenseStr || licenseStr === 'UNKNOWN' || licenseStr === 'UNLICENSED') return false
  // Ensure LGPL is not tripped by the bare \bGPL\b check
  const normalized = licenseStr.replace(/LGPL/gi, 'LESSER_PERMITTED')
  const matchesForbidden = FORBIDDEN_PATTERNS.some((rx) => rx.test(normalized))
  if (!matchesForbidden) return false

  // If it's a dual/multi license ("MIT OR GPL-3.0"), check if a permissive option exists
  if (/\bOR\b|\//i.test(licenseStr)) {
    const hasPermissive = PERMISSIVE_ALTERNATIVES.some((rx) => rx.test(licenseStr))
    if (hasPermissive) return false
  }
  return true
}

function collectProductionDependencyNames() {
  const workspaces = [
    'apps/api/package.json',
    'apps/mobile-web/package.json',
    'apps/website/package.json',
    'packages/core/package.json',
    'packages/ui/package.json',
    'packages/tokens/package.json',
    'packages/api-client/package.json',
  ]
  const prodDeps = new Set()
  for (const rel of workspaces) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) continue
    const pkg = JSON.parse(fs.readFileSync(full, 'utf8'))
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (!dep.startsWith('@steuereule/')) prodDeps.add(dep)
    }
  }
  return prodDeps
}

function scanPnpmVirtualStore() {
  const pnpmDir = path.join(ROOT, 'node_modules/.pnpm')
  const scanned = new Map()
  if (!fs.existsSync(pnpmDir)) {
    return scanned
  }

  for (const entry of fs.readdirSync(pnpmDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue
    const nmDir = path.join(pnpmDir, entry.name, 'node_modules')
    if (!fs.existsSync(nmDir)) continue

    for (const pkgEntry of fs.readdirSync(nmDir, { withFileTypes: true })) {
      if (!pkgEntry.isDirectory() && !pkgEntry.isSymbolicLink()) continue
      if (pkgEntry.name.startsWith('@')) {
        const scopeDir = path.join(nmDir, pkgEntry.name)
        for (const scopedEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
          const pkgJsonPath = path.join(scopeDir, scopedEntry.name, 'package.json')
          if (fs.existsSync(pkgJsonPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
              if (pkg.name && pkg.version) {
                scanned.set(`${pkg.name}@${pkg.version}`, {
                  name: pkg.name,
                  version: pkg.version,
                  license: extractLicenseString(pkg),
                })
              }
            } catch {
              // ignore unreadable manifest
            }
          }
        }
      } else {
        const pkgJsonPath = path.join(nmDir, pkgEntry.name, 'package.json')
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
            if (pkg.name && pkg.version) {
              scanned.set(`${pkg.name}@${pkg.version}`, {
                name: pkg.name,
                version: pkg.version,
                license: extractLicenseString(pkg),
              })
            }
          } catch {
            // ignore unreadable manifest
          }
        }
      }
    }
  }
  return scanned
}

const directProdDeps = collectProductionDependencyNames()
const allInstalled = scanPnpmVirtualStore()
const violations = []

for (const [, info] of allInstalled) {
  if (ALLOWED_PACKAGES.has(info.name)) continue
  if (isForbiddenLicense(info.license)) {
    violations.push(info)
  }
}

if (violations.length > 0) {
  console.error('[license-check] FAIL — Forbidden copyleft/source-available licenses detected:')
  for (const v of violations) {
    const scopeTag = directProdDeps.has(v.name) ? '[DIRECT PROD DEP]' : '[TRANSITIVE]'
    console.error(`  - ${v.name}@${v.version}: ${v.license} ${scopeTag}`)
  }
  process.exit(1)
}

console.log(
  `[license-check] PASS — Scanned ${allInstalled.size} installed packages (${directProdDeps.size} direct production dependencies); 0 forbidden licenses (AGPL/GPL/BUSL/SSPL).`,
)
