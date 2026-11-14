// "Funke ruhig" adherence: screens compose the design system, they do not re-implement it.
//
// Text gets its family, size and weight from a role (`...t.type.title`), and a screen gets its
// width from a layout (`t.layout.flow.narrow` / `.wide`) — both defined once in
// packages/ui/src/theme/roles.ts. This test keeps it that way: a hand-set font size, a display
// font or a hand-made screen width in a screen file fails here, with the line to fix.
//
// Out of scope on purpose: the Eule (screens/advisor/** and styles named eule…/owl…). It follows
// its own Claude-like design and is left exactly as it is.
// A DOM element (<a>, <select>) takes CSS, not a text role: mark that line's style with an
// `adherence-allow:` comment directly above it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const EXCLUDED_DIRS = [join(SRC, 'screens', 'advisor')]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (EXCLUDED_DIRS.includes(path)) continue
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const RULES: ReadonlyArray<{ readonly what: string; readonly pattern: RegExp }> = [
  { what: 'hand-set font size — use a text role (t.type.…)', pattern: /\bfontSize:/ },
  { what: 'hand-set font family — use a text role (t.type.…)', pattern: /\bfontFamily:\s*(t|theme)\.font\./ },
  { what: 'hand-made screen width — use t.layout.flow / t.layout.overview', pattern: /\bmaxWidth:\s*(460|WIDE_CONTENT_MAX_WIDTH)\b/ },
]

/** A style block that belongs to the Eule, wherever it lives (e.g. the Eule banner in the Cockpit). */
const EULE_BLOCK = /^\s*(const\s+)?(eule|owl|advisor|berater)\w*\s*[:=]/i

function violations(): string[] {
  const found: string[] = []
  for (const file of sourceFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    // Brace depth of the Eule style block we are inside (0 = not in one).
    let euleDepth = 0
    lines.forEach((line, i) => {
      const opens = (line.match(/\{/g) ?? []).length
      const closes = (line.match(/\}/g) ?? []).length
      if (euleDepth > 0) {
        euleDepth += opens - closes
        return
      }
      if (EULE_BLOCK.test(line)) {
        euleDepth = opens - closes
        return
      }
      const allowed = lines.slice(Math.max(0, i - 3), i).some((l) => l.includes('adherence-allow:'))
      if (allowed) return
      for (const rule of RULES) {
        if (rule.pattern.test(line)) found.push(`${relative(SRC, file)}:${i + 1} — ${rule.what}`)
      }
    })
  }
  return found
}

describe('design adherence ("Funke ruhig")', () => {
  it('screens outside the Eule take text and layout from the design system, never by hand', () => {
    expect(violations()).toEqual([])
  })
})
