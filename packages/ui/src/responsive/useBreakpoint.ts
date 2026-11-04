import { useWindowDimensions } from 'react-native'
import { resolveBreakpoint, type Breakpoint } from './resolveBreakpoint'

export { resolveBreakpoint, type Breakpoint }

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions()
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return 's'
  return resolveBreakpoint(width)
}
