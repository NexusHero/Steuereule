import { useContext } from 'react'
import { ThemeContext, type UiTheme } from './ThemeProvider'

export function useTheme(): UiTheme {
  return useContext(ThemeContext)
}

/** Readable ink colour on top of `t.color.funke` in both light and dark themes. */
export function inkOnFunke(t: UiTheme): string {
  return t.mode === 'dark' ? t.color.nacht : t.color.tinte
}
