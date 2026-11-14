import { createContext, useMemo, type ReactNode } from 'react'
import { theme as tokens, type ThemeMode, type RnShadow } from '@steuereule/tokens'
import { TYPE, layoutFor, type LayoutRoles, type TypeRole } from './roles'
import type { TextStyle } from 'react-native'

type ColorKey = keyof (typeof tokens)['light']['color']
type ShadowKey = keyof (typeof tokens)['light']['shadow']

export interface UiTheme {
  readonly mode: ThemeMode
  readonly color: Readonly<Record<ColorKey, string>>
  readonly shadow: Readonly<Record<ShadowKey, RnShadow>>
  readonly space: (typeof tokens)['space']
  readonly radius: (typeof tokens)['radius']
  readonly size: (typeof tokens)['size']
  readonly font: (typeof tokens)['font']
  readonly weight: (typeof tokens)['weight']
  readonly leading: (typeof tokens)['leading']
  readonly tracking: (typeof tokens)['tracking']
  /** Text roles — spread one instead of setting family/size/weight by hand (see roles.ts). */
  readonly type: Readonly<Record<TypeRole, TextStyle>>
  /** Screen layout per kind and breakpoint (see roles.ts). */
  readonly layout: LayoutRoles
}

function build(mode: ThemeMode): UiTheme {
  const m = mode === 'dark' ? tokens.dark : tokens.light
  return {
    mode,
    color: m.color,
    shadow: m.shadow,
    space: tokens.space,
    radius: tokens.radius,
    size: tokens.size,
    font: tokens.font,
    weight: tokens.weight,
    leading: tokens.leading,
    tracking: tokens.tracking,
    type: TYPE,
    layout: layoutFor(m.color.grund),
  }
}

export const ThemeContext = createContext<UiTheme>(build('light'))

export interface ThemeProviderProps {
  readonly mode?: ThemeMode
  readonly children: ReactNode
}

export function ThemeProvider({ mode = 'light', children }: ThemeProviderProps) {
  const value = useMemo(() => build(mode), [mode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
