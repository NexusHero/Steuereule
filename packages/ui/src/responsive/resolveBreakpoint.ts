import { theme } from '@steuereule/tokens'

const { breakpoint } = theme

export type Breakpoint = 's' | 'm' | 'l'

/**
 * Pure function: maps a pixel width to a breakpoint label.
 * Uses the token-driven breakpoint values (s:375, m:768, l:1280).
 *
 * ADR-0014: this function is the ONLY place breakpoint thresholds live
 * in runtime code — change the tokens, and this automatically follows.
 */
export function resolveBreakpoint(width: number): Breakpoint {
  if (width < breakpoint.m) return 's'
  if (width < breakpoint.l) return 'm'
  return 'l'
}
