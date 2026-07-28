import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { Animated, AccessibilityInfo } from 'react-native'
import { createAppI18n } from '../i18n/app-i18n'
import { SplashScreen } from './SplashScreen'
import { OwlMark, type OwlMarkProps } from '../marks/OwlMark'

// Regression guard for the "green eyes, no blink" bug: OwlMark has three animatable layers, and
// SplashScreen must actually drive all three (including the eyelids) rather than silently
// leaving `lidStyle` unpassed. Mocking OwlMark lets us assert on the exact props SplashScreen
// hands it, without depending on react-native-svg's internal rendering.
vi.mock('../marks/OwlMark', () => ({ OwlMark: vi.fn(() => null) }))

function lastOwlMarkProps(): OwlMarkProps | undefined {
  const mock = vi.mocked(OwlMark)
  return mock.mock.calls.at(-1)?.[0]
}

// Animated.Value doesn't expose its current number through any public, typed API — `__getValue`
// is the same escape hatch RN's own test utilities use.
function currentValue(node: unknown): number {
  return (node as { __getValue: () => number }).__getValue()
}

function renderSplash(opts: { lng?: 'de' | 'en'; onAdvance?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <SplashScreen onAdvance={opts.onAdvance ?? (() => {})} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  // Deterministic default: resolve immediately as reduced motion unless a test overrides it.
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
  vi.mocked(OwlMark).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SplashScreen', () => {
  it('renders the brand wordmark and greeting in German by default', async () => {
    renderSplash()
    expect(await screen.findByText('Steuern? Zack, erledigt.')).toBeTruthy()
    expect(screen.getByText('Steuer')).toBeTruthy()
    expect(screen.getByText('Eule')).toBeTruthy()
  })

  it('switches to English when the locale changes (ADR-0006)', async () => {
    renderSplash({ lng: 'en' })
    expect(await screen.findByText('Taxes? Sorted, just like that.')).toBeTruthy()
  })

  it('is one big tap target that advances immediately on tap (skip)', async () => {
    const onAdvance = vi.fn()
    renderSplash({ onAdvance })
    const button = await screen.findByLabelText('Weiter zur App')
    fireEvent.click(button)
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('auto-advances after ~2.4s without any interaction', async () => {
    vi.useFakeTimers()
    const onAdvance = vi.fn()
    renderSplash({ onAdvance })
    await vi.advanceTimersByTimeAsync(2399)
    expect(onAdvance).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('does not double-fire when skipped just before the auto-advance timer would fire', async () => {
    vi.useFakeTimers()
    const onAdvance = vi.fn()
    renderSplash({ onAdvance })
    // Static (accessibilityLabel doesn't depend on the async reduced-motion query), so a plain
    // synchronous query — findBy*'s polling loop would deadlock with fake timers active.
    const button = screen.getByLabelText('Weiter zur App')
    fireEvent.click(button)
    await vi.advanceTimersByTimeAsync(2400)
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('honors prefers-reduced-motion: the brand mark never animates', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const timingSpy = vi.spyOn(Animated, 'timing')
    renderSplash()
    await screen.findByText('Steuern? Zack, erledigt.')
    expect(timingSpy).not.toHaveBeenCalled()
  })

  it('draws the brand mark in when motion is allowed', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timingSpy = vi.spyOn(Animated, 'timing')
    renderSplash()
    await waitFor(() => expect(timingSpy).toHaveBeenCalled())
  })

  it('drives the eyelid layer, retracted (eyes OPEN) at rest under reduced motion', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    renderSplash()
    await screen.findByText('Steuern? Zack, erledigt.')

    const props = lastOwlMarkProps()
    expect(props?.lidStyle).toBeTruthy()
    const lidStyle = props?.lidStyle as { transform: [{ scaleY: unknown }]; transformOrigin: string }
    // scaleY(0), anchored top — retracted, i.e. the eyes are visible, not covered by green lids.
    expect(currentValue(lidStyle.transform[0].scaleY)).toBe(0)
    expect(lidStyle.transformOrigin).toBe('center top')
  })

  it('plays a single blink (lids shut then open) after the whole entrance — head, glasses, wordmark, greeting — when motion is allowed', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timingSpy = vi.spyOn(Animated, 'timing')
    renderSplash()
    await waitFor(() => expect(timingSpy).toHaveBeenCalled())

    const lidStyle = lastOwlMarkProps()?.lidStyle
    expect(lidStyle).toBeTruthy()
    const lidAnim = (lidStyle as { transform: [{ scaleY: unknown }] }).transform[0].scaleY
    const allCalls = timingSpy.mock.calls
    const lidIndices = allCalls.map(([value], i) => (value === lidAnim ? i : -1)).filter((i) => i >= 0)
    const otherIndices = allCalls.map((_, i) => i).filter((i) => !lidIndices.includes(i))

    // Two legs: close (toValue 1) then open again (toValue 0) — a single blink, not a toggle.
    expect(lidIndices).toHaveLength(2)
    expect(allCalls[lidIndices[0]!]?.[1]).toMatchObject({ toValue: 1 })
    expect(allCalls[lidIndices[1]!]?.[1]).toMatchObject({ toValue: 0 })

    // DS reference (splash.html): `au-blinzeln` fires at 1.3s — AFTER both `fx-wort` (0.9s) and
    // `fx-gruss` (1.1s), not between glasses and the wordmark. So the blink must be the LAST beat
    // of the entrance, strictly after every other stage (head, glasses, wordmark, greeting).
    expect(otherIndices.length).toBeGreaterThan(0)
    expect(Math.min(...lidIndices)).toBeGreaterThan(Math.max(...otherIndices))
  })
})
