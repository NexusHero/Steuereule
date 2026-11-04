import { theme } from '@steuereule/tokens'

const { breakpoint } = theme

export type Breakpoint = 's' | 'm' | 'l'

export function resolveBreakpoint(width: number): Breakpoint {
  if (width < breakpoint.m) return 's'
  if (width < breakpoint.l) return 'm'
  return 'l'
}
