import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccessibilityInfo } from 'react-native'
import { ThemeProvider } from '../theme/ThemeProvider'
import { TabBar, type TabItem } from './TabBar'

// jsdom has no layout. react-native-web reports onLayout through a ResizeObserver plus offset* sizes,
// so both are stubbed: every tab is 100px wide and 52px high, laid out left to right in the order given.
// (The observer is created lazily on the first render, so the stub is in place before it.)
const ORDER = ['Cockpit', 'Belege', 'Profil']
const originalObserver = window.ResizeObserver
const offsets = ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop'] as const

beforeAll(() => {
  window.ResizeObserver = class {
    constructor(private readonly callback: (entries: Array<{ target: Element }>) => void) {}
    observe(target: Element) {
      this.callback([{ target }])
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  const tabIndex = (el: HTMLElement) => ORDER.indexOf((el.textContent ?? '').trim())
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 100 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 52 })
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return Math.max(tabIndex(this), 0) * 100
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get: () => 0 })
})

afterAll(() => {
  window.ResizeObserver = originalObserver
  for (const key of offsets) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
})

const TABS: TabItem[] = ORDER.map((label) => ({ id: label.toLowerCase(), label }))

function pill() {
  return document.querySelector('[aria-hidden="true"][style*="translateX"], [style*="translateX"]') as HTMLElement | null
}

function renderBar(active: string, onChange: (id: string) => void = () => {}) {
  const ui = (current: string) => (
    <ThemeProvider mode="light">
      <TabBar tabs={TABS} active={current} onChange={onChange} />
    </ThemeProvider>
  )
  const result = render(ui(active))
  return { ...result, setActive: (next: string) => result.rerender(ui(next)) }
}

describe('TabBar pill', () => {
  it('draws the lime pill under the active tab once the tabs have been measured', async () => {
    renderBar('belege')
    await waitFor(() => expect(pill()).not.toBeNull())
    expect(pill()!.style.width).toBe('100px')
    expect(pill()!.style.height).toBe('52px')
    expect(pill()!.style.transform).toContain('translateX(100px)')
  })

  it('jumps the pill to the new tab at once when the user prefers reduced motion', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const { setActive } = renderBar('cockpit')
    await waitFor(() => expect(pill()?.style.transform).toContain('translateX(0px)'))
    act(() => setActive('profil'))
    await waitFor(() => expect(pill()?.style.transform).toContain('translateX(200px)'))
  })

  it('glides the pill to the new tab when motion is allowed', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const { setActive } = renderBar('cockpit')
    await waitFor(() => expect(pill()?.style.transform).toContain('translateX(0px)'))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => setActive('profil'))
    await waitFor(() => expect(pill()?.style.transform).toContain('translateX(200px)'), { timeout: 2000 })
  })

  it('still reports the pressed tab once the layout is known', async () => {
    const onChange = vi.fn()
    renderBar('cockpit', onChange)
    await waitFor(() => expect(pill()).not.toBeNull())
    fireEvent.click(screen.getByText('Belege'))
    expect(onChange).toHaveBeenCalledWith('belege')
  })
})
