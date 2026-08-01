// The hook itself has no DOM to assert on, so a tiny harness renders `OwlMark` driven by it —
// the same technique SplashScreen.test.tsx uses to inspect the animated styles it's handed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@steuereule/ui'
import { Animated, AccessibilityInfo } from 'react-native'
import { useOwlEntranceAnimation } from './useOwlEntranceAnimation'
import { OwlMark, type OwlMarkProps } from './OwlMark'

vi.mock('./OwlMark', () => ({ OwlMark: vi.fn(() => null) }))

function lastOwlMarkProps(): OwlMarkProps | undefined {
  const mock = vi.mocked(OwlMark)
  return mock.mock.calls.at(-1)?.[0]
}

function currentValue(node: unknown): number {
  return (node as { __getValue: () => number }).__getValue()
}

function Harness() {
  const { headStyle, glassesStyle, lidStyle } = useOwlEntranceAnimation()
  return <OwlMark headStyle={headStyle} glassesStyle={glassesStyle} lidStyle={lidStyle} />
}

function renderHarness() {
  return render(
    <ThemeProvider mode="light">
      <Harness />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
  vi.mocked(OwlMark).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOwlEntranceAnimation', () => {
  it('renders fully drawn at rest — no animation runs — under reduced motion', async () => {
    const timingSpy = vi.spyOn(Animated, 'timing')
    renderHarness()
    await waitFor(() => expect(vi.mocked(OwlMark)).toHaveBeenCalled())
    expect(timingSpy).not.toHaveBeenCalled()

    const props = lastOwlMarkProps()
    expect(currentValue((props?.headStyle as { opacity: unknown })?.opacity)).toBe(1)
    expect(currentValue((props?.glassesStyle as { opacity: unknown })?.opacity)).toBe(1)
    const lidStyle = props?.lidStyle as { transform: [{ scaleY: unknown }] }
    expect(currentValue(lidStyle.transform[0].scaleY)).toBe(0)
  })

  it('draws head then glasses, then plays a single blink, when motion is allowed', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timingSpy = vi.spyOn(Animated, 'timing')
    renderHarness()
    await waitFor(() => expect(timingSpy).toHaveBeenCalled())

    const props = lastOwlMarkProps()
    if (!props) throw new Error('OwlMark was never rendered — the harness never mounted it')
    const headAnim = (props.headStyle as { opacity: unknown }).opacity
    const glassesAnim = (props.glassesStyle as { opacity: unknown }).opacity
    const lidAnim = (props.lidStyle as { transform: [{ scaleY: unknown }] }).transform[0].scaleY

    const allCalls = timingSpy.mock.calls
    const indexOf = (value: unknown) => allCalls.map(([v], i) => (v === value ? i : -1)).filter((i) => i >= 0)
    const headIndices = indexOf(headAnim)
    const glassesIndices = indexOf(glassesAnim)
    const lidIndices = indexOf(lidAnim)

    // Two legs for the blink — close (toValue 1) then open again (toValue 0) — not a toggle.
    expect(lidIndices).toHaveLength(2)
    expect(allCalls[lidIndices[0]!]?.[1]).toMatchObject({ toValue: 1 })
    expect(allCalls[lidIndices[1]!]?.[1]).toMatchObject({ toValue: 0 })

    // Head, then glasses, then the blink — strictly in that order.
    expect(Math.max(...headIndices)).toBeLessThan(Math.min(...glassesIndices))
    expect(Math.max(...glassesIndices)).toBeLessThan(Math.min(...lidIndices))
  })

  it('plays only once even if the host re-renders', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timingSpy = vi.spyOn(Animated, 'timing')
    const { rerender } = renderHarness()
    await waitFor(() => expect(timingSpy).toHaveBeenCalled())
    const callsAfterFirstPlay = timingSpy.mock.calls.length

    rerender(
      <ThemeProvider mode="light">
        <Harness />
      </ThemeProvider>,
    )
    expect(timingSpy.mock.calls.length).toBe(callsAfterFirstPlay)
  })
})
