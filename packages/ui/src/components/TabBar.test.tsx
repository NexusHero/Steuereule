import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { ThemeProvider } from '../theme/ThemeProvider'
import { useTheme } from '../theme/useTheme'
import { TabBar, TAB_BAR_HEIGHT, TAB_ICON_PATHS, tabBarClearance, type TabItem } from './TabBar'

const TABS: TabItem[] = [
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'profil', label: 'Profil' },
]

function renderTabBar(opts: { aktiv?: string; onWechsel?: (id: string) => void; tabs?: TabItem[] } = {}) {
  return render(
    <ThemeProvider mode="light">
      <TabBar
        tabs={opts.tabs ?? TABS}
        aktiv={opts.aktiv ?? 'cockpit'}
        onWechsel={opts.onWechsel ?? (() => {})}
        testID="tabbar"
      />
    </ThemeProvider>,
  )
}

describe('TabBar', () => {
  it('renders every tab it is given, and nothing it is not', () => {
    renderTabBar()

    expect(screen.getByText('Cockpit')).toBeTruthy()
    expect(screen.getByText('Profil')).toBeTruthy()
    // The DS reference lists five tabs; a consumer that passes two must get two. Rendering
    // the others would be an affordance with no screen behind it.
    expect(screen.queryByText('Belege')).toBeNull()
    expect(screen.queryByText('Berater')).toBeNull()
  })

  it('reports the active tab to assistive tech, not just visually', () => {
    renderTabBar({ aktiv: 'profil' })

    const tabs = screen.getAllByRole('tab')
    const profil = tabs.find((tab) => tab.textContent?.includes('Profil'))
    const cockpit = tabs.find((tab) => tab.textContent?.includes('Cockpit'))

    expect(profil?.getAttribute('aria-current')).toBe('page')
    expect(cockpit?.getAttribute('aria-current')).toBeNull()
  })

  it('calls onWechsel with the pressed tab id', () => {
    const onWechsel = vi.fn()
    renderTabBar({ onWechsel })

    fireEvent.click(screen.getByText('Profil'))

    expect(onWechsel).toHaveBeenCalledWith('profil')
  })

  it('still calls onWechsel when the already-active tab is pressed — the caller decides what that means', () => {
    const onWechsel = vi.fn()
    renderTabBar({ aktiv: 'cockpit', onWechsel })

    fireEvent.click(screen.getByText('Cockpit'))

    expect(onWechsel).toHaveBeenCalledWith('cockpit')
  })

  it('renders the icon slot above the label when one is given', () => {
    renderTabBar({
      tabs: [{ id: 'cockpit', label: 'Cockpit', icon: <Text>ICON</Text> }, { id: 'profil', label: 'Profil' }],
    })

    expect(screen.getByText('ICON')).toBeTruthy()
  })

  it('exposes the design system’s icon paths as data for the consumer to draw', () => {
    // The paths live here so the DS stays their source of truth; this package draws no SVG.
    expect(TAB_ICON_PATHS.cockpit).toMatch(/^M4 13h6V4H4v9z/)
    expect(TAB_ICON_PATHS.profil).toMatch(/^M12 11a4 4 0/)
  })

  it('sits above the bottom safe-area inset, not on top of the home indicator', () => {
    render(
      <ThemeProvider mode="light">
        <TabBar tabs={TABS} aktiv="cockpit" onWechsel={() => {}} bottomInset={34} testID="tabbar" />
      </ThemeProvider>,
    )
    const { result } = renderHook(() => useTheme())

    const bottom = getComputedStyle(screen.getByTestId('tabbar')).bottom

    expect(bottom).toBe(`${result.current.space.s3 + 34}px`)
  })
})

describe('tabBarClearance', () => {
  it('reserves the bar, the gap below it, breathing room above it and the safe-area inset', () => {
    const { result } = renderHook(() => tabBarClearance(useTheme(), 34))
    const { result: theme } = renderHook(() => useTheme())

    expect(result.current).toBe(34 + 2 * theme.current.space.s3 + TAB_BAR_HEIGHT)
  })
})
