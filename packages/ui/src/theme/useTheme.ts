import { useContext } from 'react'
import { ThemeContext, type UiTheme } from './ThemeProvider'

export function useTheme(): UiTheme {
  return useContext(ThemeContext)
}

/** Readable ink colour on top of `t.color.funke` in both light and dark themes. */
export function inkOnFunke(t: UiTheme): string {
  return t.mode === 'dark' ? t.color.nacht : t.color.tinte
}

/**
 * The boundary of a control (a field, a toggle, a button that is only its outline), in both themes.
 * A hairline (`t.color.linie`) separates surfaces and stays under 2:1; a control's edge has to clear
 * 3:1 against the surface it sits on (WCAG 1.4.11), so it takes the secondary ink.
 */
export function controlLine(t: UiTheme): string {
  return t.color.tinte2
}
