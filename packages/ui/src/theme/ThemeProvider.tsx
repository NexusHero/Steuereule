// Theme access for the RN components: resolves @steuereule/tokens into the active mode's colours
// and shadows plus the mode-invariant scales, and hands them down via context. Default is light.
import { createContext, useMemo, type ReactNode } from 'react'
import { theme as tokens, type ThemeMode, type RnShadow } from '@steuereule/tokens'

// Colours and shadows differ between modes, so widen their literal types to string / RnShadow.
// The scales (space, size, weight, …) are mode-invariant and keep their exact token types.
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
