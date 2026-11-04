import type { NormalizedTokens, NormalToken } from './manifest-to-tokens'

const GROUP_ORDER = [
  'color',
  'shadow',
  'space',
  'radius',
  'size',
  'font',
  'weight',
  'leading',
  'tracking',
  'easing',
  'duration',
  'breakpoint',
] as const

function line(t: NormalToken): string {
  return `  ${t.cssVar}: ${t.value};`
}

export function renderCss(n: NormalizedTokens): string {
  const rootLines: string[] = []
  for (const group of GROUP_ORDER) {
    for (const t of n.base[group]) rootLines.push(line(t))
  }
  const darkLines = n.darkColors.map(line)

  return [
    '/* GENERATED from _ds_manifest.json via @steuereule/tokens — do not edit by hand. */',
    ':root {',
    ...rootLines,
    '}',
    '',
    '[data-theme="dunkel"] {',
    ...darkLines,
    '}',
    '',
  ].join('\n')
}
