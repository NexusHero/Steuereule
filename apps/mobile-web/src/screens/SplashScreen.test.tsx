import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { Animated, AccessibilityInfo } from 'react-native'
import { createAppI18n } from '../i18n/app-i18n'
import { SplashScreen } from './SplashScreen'

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
})
