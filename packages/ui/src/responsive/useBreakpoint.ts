import { useWindowDimensions } from 'react-native'
import { resolveBreakpoint, type Breakpoint } from './resolveBreakpoint'

export { resolveBreakpoint, type Breakpoint }

/**
 * Hook: returns the current breakpoint label ("s" | "m" | "l") based on
 * the window width at call time.
 *
 * ADR-0014 RULES — this hook:
 *   ✅ MUST ONLY be used for STRUCTURAL layout switches at screen root level
 *     (e.g. `if (bp === "s") return <MobileLayout />`)
 *   ❌ MUST NOT be used for styling tweaks (padding, font, maxWidth, grid columns)
 *   ❌ MUST NOT be called in sub-components — ONCE per screen, at the root
 */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions()
  // Fail safe to the narrowest layout when the platform hands us no usable width
  // (SSR/first paint before the window is measured): a phone layout on a wide screen
  // is merely narrow, whereas a desktop layout on a phone is broken.
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return 's'
  return resolveBreakpoint(width)
}
