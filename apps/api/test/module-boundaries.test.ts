// Architecture guard (#444): vertical modules talk through public services, never by reaching
// into each other's internals, and the dependency arrows point one way only. A new import that
// violates a rule here turns this test red instead of slowly eroding the module graph.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : []
  })
}

function importsOf(moduleDir: string): { file: string; target: string }[] {
  return sourceFiles(join(SRC, moduleDir)).flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    return [...text.matchAll(/from '(\.\.?\/[^']+)'/g)].map((m) => ({
      file: relative(SRC, file),
      target: relative(SRC, join(file, '..', m[1]!)),
    }))
  })
}

function violations(moduleDir: string, forbiddenModules: readonly string[]): string[] {
  return importsOf(moduleDir)
    .filter(({ target }) => forbiddenModules.some((f) => target === f || target.startsWith(`${f}/`)))
    .map(({ file, target }) => `${file} → ${target}`)
}

describe('API module boundaries', () => {
  it('nothing depends on the lstb-scan orchestration module (it sits on top)', () => {
    const others = readdirSync(SRC).filter((d) => d !== 'lstb-scan' && d !== 'app.module.ts' && !d.endsWith('.ts'))
    expect(others.flatMap((dir) => violations(dir, ['lstb-scan']))).toEqual([])
  })

  it('the lstb vertical knows neither receipts nor the advisor', () => {
    expect(violations('lstb', ['receipt', 'advisor'])).toEqual([])
  })

  it('the receipt module never reaches into the lstb vertical', () => {
    expect(violations('receipt', ['lstb'])).toEqual([])
  })

  it('lstb-scan uses other modules only through their services, DTOs and the parse seam', () => {
    const internals = importsOf('lstb-scan').filter(({ target }) =>
      /(^|\/)[^/]*\.repository(\.prisma)?\.js$|\/storage\//.test(target),
    )
    expect(internals.map(({ file, target }) => `${file} → ${target}`)).toEqual([])
  })
})
