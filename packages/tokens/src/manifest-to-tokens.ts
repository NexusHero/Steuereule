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
  readonly base: Readonly<Record<Group, readonly NormalToken[]>>
  readonly darkColors: readonly NormalToken[]
}

export function camel(segment: string): string {
  return segment.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
}

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
