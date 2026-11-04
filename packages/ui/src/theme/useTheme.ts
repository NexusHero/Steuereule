import { useContext } from 'react'
import { ThemeContext, type UiTheme } from './ThemeProvider'

export function useTheme(): UiTheme {
  return useContext(ThemeContext)
}
