// Normalize the design-system manifest (finanzo-funke-design-system/project/_ds_manifest.json)
// into a grouped token tree — the single source both renderers consume (ADR-050: one token
// truth, fed from _ds_manifest.json). Pure and deterministic: no I/O, no Style Dictionary here.
//
// The manifest lists every token twice where a dark override exists: once unscoped (light) and
// once scoped `[data-theme="dunkel"]`. We route by scope. Every dark override is a colour.

const DARK_SCOPE = '[data-theme="dunkel"]'

/** One raw token as it appears in the manifest `tokens` array. */
export interface ManifestToken {
  readonly name: string
  readonly value: string
  readonly kind?: string
  readonly definedIn?: string
  readonly scope?: string
}

export interface Manifest {
  readonly tokens: readonly ManifestToken[]
}

/** Token groups, mirroring the checked-in token CSS files. */
export type Group =
  | 'color'
  | 'shadow'
  | 'space'
  | 'radius'
  | 'size'
  | 'font'
  | 'weight'
  | 'leading'
  | 'tracking'
  | 'easing'
  | 'duration'
  | 'breakpoint'

/** A single normalized token: its JS key, raw CSS value, and the CSS custom-property name. */
export interface NormalToken {
  readonly key: string
  readonly value: string
  readonly cssVar: string
}

export interface NormalizedTokens {
  /** Light/base: every group -> key -> token. */
  readonly base: Readonly<Record<Group, readonly NormalToken[]>>
  /** Dark overrides only (all colours), keyed like base.color. */
  readonly darkColors: readonly NormalToken[]
}

/** `funke-hell` -> `funkeHell`, `tinte-2` -> `tinte2`. Leaves single words untouched. */
export function camel(segment: string): string {
  return segment.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
}

/** Map a CSS custom-property name to its group and JS key. Deterministic, total. */
export function classify(cssVar: string): { group: Group; key: string } {
  const bare = cssVar.replace(/^--/, '')

  if (bare.startsWith('schatten-')) return { group: 'shadow', key: camel(bare.slice('schatten-'.length)) }
  if (bare.startsWith('schrift-')) return { group: 'font', key: camel(bare.slice('schrift-'.length)) }
  if (bare.startsWith('text-')) return { group: 'size', key: bare.slice('text-'.length) }
  if (bare.startsWith('gewicht-')) return { group: 'weight', key: bare.slice('gewicht-'.length) }
  if (bare.startsWith('zeile-')) return { group: 'leading', key: bare.slice('zeile-'.length) }
  if (bare.startsWith('spationierung-')) return { group: 'tracking', key: bare.slice('spationierung-'.length) }
  if (bare === 'radius') return { group: 'radius', key: 'm' }
  if (bare.startsWith('radius-')) return { group: 'radius', key: bare.slice('radius-'.length) }
  if (/^s[1-7]$/.test(bare)) return { group: 'space', key: bare }
  if (bare === 'kontur') return { group: 'space', key: 'kontur' }
  if (bare.startsWith('t-')) return { group: 'duration', key: bare.slice('t-'.length) }
  if (bare === 'feder' || bare === 'zack') return { group: 'easing', key: bare }
  if (bare.startsWith('bp-')) return { group: 'breakpoint', key: bare.slice('bp-'.length) }

  // Everything else is a colour (colors.css / dunkel.css). The manifest mis-labels
  // `--nacht-text` as kind "font"; grouping by name keeps it a colour where it belongs.
  return { group: 'color', key: camel(bare) }
}

const EMPTY_BASE = (): Record<Group, NormalToken[]> => ({
  color: [],
  shadow: [],
  space: [],
  radius: [],
  size: [],
  font: [],
  weight: [],
  leading: [],
  tracking: [],
  easing: [],
  duration: [],
  breakpoint: [],
})

/** Normalize the manifest into the grouped light tree + dark colour overrides. */
export function manifestToTokens(manifest: Manifest): NormalizedTokens {
  const base = EMPTY_BASE()
  const darkColors: NormalToken[] = []

  for (const t of manifest.tokens) {
    const { group, key } = classify(t.name)
    const entry: NormalToken = { key, value: t.value, cssVar: t.name }
    if (t.scope === DARK_SCOPE) {
      darkColors.push(entry)
    } else {
      base[group].push(entry)
    }
  }

  return { base, darkColors }
}
