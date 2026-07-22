import { useContext } from 'react'
import { ThemeContext, type UiTheme } from './ThemeProvider'

/** Access the active Funke theme (colours + shadows for the mode, plus the scales). */
export function useTheme(): UiTheme {
  return useContext(ThemeContext)
}
