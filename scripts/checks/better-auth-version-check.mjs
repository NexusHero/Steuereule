#!/usr/bin/env node
// Fails when apps/api and apps/mobile-web resolve different versions of better-auth or of any @better-auth/*
// package both of them use (#273). The server and the client plugins talk one wire protocol; a client on another
// version than the server drifts silently. Reads the resolved versions from pnpm-lock.yaml, not the ranges in
// package.json, so a caret range that happens to resolve apart is caught too.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const IMPORTERS = ['apps/api', 'apps/mobile-web']

const isTracked = (name) => name === 'better-auth' || name.startsWith('@better-auth/')

/**
 * The resolved version of every tracked package of one importer in a pnpm-lock.yaml (lockfile v9 layout:
 * `importers:` > importer > dependencies/devDependencies > package > `version:`). Peer suffixes are dropped.
 * Returns null when the importer is not in the lockfile.
 */
export function resolvedVersions(lockText, importer) {
  const lines = lockText.split('\n')
  const start = lines.findIndex((line) => line === `  ${importer}:`)
  if (start === -1) return null
  const versions = {}
  let name = null
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line)) break // the next importer or the next top-level section
    const entry = /^ {6}'?([^':]+)'?:\s*$/.exec(line)
    if (entry) {
      name = entry[1]
      continue
    }
    const version = /^ {8}version:\s*(\S+)/.exec(line)
    if (version && name !== null && isTracked(name)) versions[name] = version[1].replace(/\(.*$/, '')
  }
  return versions
}

/** The packages both importers use that resolve to different versions. */
export function mismatches(lockText, importers = IMPORTERS) {
  const [first, second] = importers
  const a = resolvedVersions(lockText, first)
  const b = resolvedVersions(lockText, second)
  if (a === null || b === null) throw new Error(`pnpm-lock.yaml has no importer ${a === null ? first : second}`)
  return Object.keys(a)
    .filter((name) => name in b && a[name] !== b[name])
    .map((name) => ({ name, [first]: a[name], [second]: b[name] }))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const found = mismatches(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8'))
  if (found.length > 0) {
    console.error('better-auth versions differ between apps/api and apps/mobile-web (pin both to the same exact version, then `pnpm install`):')
    for (const row of found) console.error(`  ${row.name}: apps/api ${row['apps/api']} vs apps/mobile-web ${row['apps/mobile-web']}`)
    process.exit(1)
  }
  console.log('better-auth: apps/api and apps/mobile-web resolve the same versions.')
}
