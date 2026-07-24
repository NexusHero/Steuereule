// Render the normalized tokens to a typed React-Native theme object (ADR-044/050). RN knows no
// CSS, so the raw token strings are transformed into RN-native primitives:
//   px lengths  -> unitless numbers          (RN treats numbers as density-independent px)
//   hard shadow -> { shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }
//   easing      -> [x1, y1, x2, y2] tuple     (feed to Easing.bezier(...))
//   duration    -> milliseconds number
// Colours, fonts, weights, leading and tracking stay strings the RN style props accept directly.

import type { NormalizedTokens, NormalToken } from './manifest-to-tokens'

/** "16px" -> 16, "999px" -> 999. Throws on anything that is not a plain px length. */
export function pxToNumber(value: string): number {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim())
  if (!m) throw new RangeError(`Not a px length: ${value}`)
  return Number(m[1])
}

/** "120ms" -> 120. */
export function msToNumber(value: string): number {
  const m = /^(\d+(?:\.\d+)?)ms$/.exec(value.trim())
  if (!m) throw new RangeError(`Not a ms duration: ${value}`)
  return Number(m[1])
}

/** "cubic-bezier(0.34, 1.56, 0.64, 1)" -> [0.34, 1.56, 0.64, 1]. */
export function parseEasing(value: string): readonly [number, number, number, number] {
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(value.trim())
  if (!m) throw new RangeError(`Not a cubic-bezier: ${value}`)
  const parts = m[1]!.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    throw new RangeError(`cubic-bezier needs 4 numbers: ${value}`)
  }
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!]
}

export interface RnShadow {
  readonly shadowColor: string
  readonly shadowOffset: { readonly width: number; readonly height: number }
  readonly shadowOpacity: number
  readonly shadowRadius: number
  readonly elevation: number
}

/**
 * "4px 4px 0 var(--tinte)" -> RN shadow. The colour is a `var(--…)` reference resolved against
 * the given theme colour map, so a dark theme's hard shadow flips to light ink automatically —
 * exactly what tokens/dunkel.css does by leaving `--schatten-*` to inherit the flipped `--tinte`.
 */
export function parseShadow(value: string, resolveColor: (cssVar: string) => string): RnShadow {
  const m = /^(-?\d+)px\s+(-?\d+)px\s+(-?\d+)(?:px)?\s+var\((--[a-z0-9-]+)\)$/.exec(value.trim())
  if (!m) throw new RangeError(`Not a hard-shadow value: ${value}`)
  const width = Number(m[1])
  const height = Number(m[2])
  const blur = Number(m[3])
  return {
    shadowColor: resolveColor(m[4]!),
    shadowOffset: { width, height },
    shadowOpacity: 1,
    shadowRadius: blur,
    // Android has no offset shadow; approximate depth by the vertical offset.
    elevation: Math.abs(height),
  }
}

/** Resolve the effective colour map for a theme: base colours with dark overrides applied. */
export function resolveColors(
  base: readonly NormalToken[],
  overrides: readonly NormalToken[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of base) out[t.key] = t.value
  for (const t of overrides) out[t.key] = t.value
  return out
}

// ---- object builders (the tested heart; the string emit is a thin wrapper) --------------------

function numberMap(tokens: readonly NormalToken[], parse: (v: string) => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tokens) out[t.key] = parse(t.value)
  return out
}

function stringMap(tokens: readonly NormalToken[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of tokens) out[t.key] = t.value
  return out
}

function shadowMap(
  tokens: readonly NormalToken[],
  colors: Record<string, string>,
): Record<string, RnShadow> {
  const resolve = (cssVar: string): string => {
    const key = cssVar.replace(/^--/, '')
    // colour keys are camelCased; the only shadow reference in the DS is `--tinte`/`--ki`.
    const val = colors[key]
    if (val === undefined) throw new RangeError(`Shadow references unknown colour ${cssVar}`)
    return val
  }
  const out: Record<string, RnShadow> = {}
  for (const t of tokens) out[t.key] = parseShadow(t.value, resolve)
  return out
}

/** The full theme value object (both modes), independent of any string formatting. */
export function buildRnTheme(n: NormalizedTokens) {
  const lightColors = resolveColors(n.base.color, [])
  const darkColors = resolveColors(n.base.color, n.darkColors)

  return {
    space: numberMap(n.base.space, pxToNumber),
    radius: numberMap(n.base.radius, pxToNumber),
    size: numberMap(n.base.size, pxToNumber),
    font: stringMap(n.base.font),
    weight: stringMap(n.base.weight),
    leading: numberMap(n.base.leading, Number),
    tracking: stringMap(n.base.tracking),
    duration: numberMap(n.base.duration, msToNumber),
    easing: Object.fromEntries(n.base.easing.map((t) => [t.key, parseEasing(t.value)])),
    breakpoint: numberMap(n.base.breakpoint, pxToNumber),
    light: { color: lightColors, shadow: shadowMap(n.base.shadow, lightColors) },
    dark: { color: darkColors, shadow: shadowMap(n.base.shadow, darkColors) },
  } as const
}

/** Emit the typed RN theme module (dist/theme.ts). */
export function renderRnTheme(n: NormalizedTokens): string {
  const theme = buildRnTheme(n)
  return [
    '// GENERATED from _ds_manifest.json via @steuereule/tokens — do not edit by hand.',
    'export const theme = ' + JSON.stringify(theme, null, 2) + ' as const',
    '',
    'export type Theme = typeof theme',
    "export type ThemeMode = 'light' | 'dark'",
    '',
    '/** Colour + shadow for a given mode; the scales (space, size, …) are mode-invariant. */',
    'export function modeTokens(mode: ThemeMode) {',
    '  return mode === "dark" ? theme.dark : theme.light',
    '}',
    '',
  ].join('\n')
}
