import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value)
    })
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
