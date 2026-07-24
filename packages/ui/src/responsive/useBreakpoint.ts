// Responsive breakpoint hook (ADR-0014). Returns the current breakpoint ('s' | 'm' | 'l')
// based on the viewport width, resolved against the token values from @steuereule/tokens.
//
// RESTRICTION: useBreakpoint() is for STRUCTURAL layout decisions at the screen root ONLY
// (e.g. `if (bp === 's') return <MobileLayout />`). It MUST NOT be used for styling tweaks
// (padding, font size, grid columns) deep in the component tree — those cause cascade
// re-renders on every resize. For styling-level responsiveness, use StyleSheet-based media
// queries (future ADR).
//
// Implementation: uses React Native's `useWindowDimensions`, which react-native-web maps to
// the browser viewport on web and to the device screen on native. The hook re-resolves the
// breakpoint on every dimension change (one re-render at the call site per resize event).

import { useWindowDimensions } from 'react-native'
import { theme } from '@steuereule/tokens'

export type Breakpoint = 's' | 'm' | 'l'

const { s, m, l } = theme.breakpoint

/** Resolve a pixel width to a breakpoint name. Exported for testing. */
export function resolveBreakpoint(width: number): Breakpoint {
  if (width < m) return 's'
  if (width < l) return 'm'
  return 'l'
}

/** Return the current responsive breakpoint ('s' | 'm' | 'l'), re-resolved on resize. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions()
  return resolveBreakpoint(width)
}
