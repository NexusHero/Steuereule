// Whether the user prefers reduced motion (design-system CLAUDE.md: "Animation nur mit
// Bedeutung … immer hinter prefers-reduced-motion"). Defaults to `true` (no animation) until
// the platform answers, so a slow/unresolved query never flashes movement at someone who
// asked not to see it — safe-by-default, not assumed. Stays live via `reduceMotionChanged`
// (react-native-web resolves both from the browser's `prefers-reduced-motion` media query).
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value)
    })
    // react-native-web returns `undefined` here in environments without `window.matchMedia`
    // (e.g. jsdom without a polyfill) rather than a subscription — guard the teardown.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduced(value)
    })
    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [])

  return reduced
}
