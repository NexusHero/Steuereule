import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { ThemeProvider } from '../theme/ThemeProvider'
import { SideNav, SIDE_NAV_COMPACT_WIDTH, SIDE_NAV_WIDTH, sideNavWidth } from './SideNav'
import type { TabItem } from './TabBar'

const TABS: TabItem[] = [
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'verlauf', label: 'Verlauf' },
]

function renderRail(opts: { active?: string; onChange?: (id: string) => void; mode?: 'light' | 'dark'; compact?: boolean } = {}) {
  return render(
    <ThemeProvider mode={opts.mode ?? 'light'}>
      <SideNav tabs={TABS} active={opts.active ?? 'cockpit'} onChange={opts.onChange ?? (() => {})} header={<Text>SteuerEule</Text>} compact={opts.compact ?? false} testID="rail" />
    </ThemeProvider>,
  )
}

describe('SideNav', () => {
  it('offers the same tabs under the same roles as the floating bar', () => {
    renderRail()
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical')
    expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual(['Cockpit', 'Verlauf'])
    expect(screen.getByText('SteuerEule')).toBeTruthy()
  })

  it('reports the picked tab to assistive tech', () => {
    renderRail({ active: 'verlauf' })
    expect(screen.getByRole('tab', { name: 'Verlauf' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Verlauf' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('tab', { name: 'Cockpit' }).getAttribute('aria-selected')).toBe('false')
  })

  it('hands every press to the caller, the picked tab included (it pops the tab to its top)', () => {
    const onChange = vi.fn()
    renderRail({ onChange })
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Cockpit' }))
    expect(onChange.mock.calls).toEqual([['verlauf'], ['cockpit']])
  })

  it('is a rail of fixed width on the left edge, without the lime of the bar', () => {
    renderRail()
    const rail = screen.getByTestId('rail')
    expect(getComputedStyle(rail).width).toBe(`${SIDE_NAV_WIDTH}px`)
    expect(getComputedStyle(rail).left).toBe('0px')
    // rgb(201, 242, 41) is the accent; the picked row is a quiet surface instead.
    expect(getComputedStyle(screen.getByRole('tab', { name: 'Cockpit' })).backgroundColor).not.toBe('rgb(201, 242, 41)')
  })

  it('is narrow on a tablet-wide window, with the same tabs and the icon over its label', () => {
    renderRail({ compact: true, active: 'verlauf' })
    expect(getComputedStyle(screen.getByTestId('rail')).width).toBe(`${SIDE_NAV_COMPACT_WIDTH}px`)
    expect(sideNavWidth(true)).toBe(SIDE_NAV_COMPACT_WIDTH)
    expect(sideNavWidth(false)).toBe(SIDE_NAV_WIDTH)
    const picked = screen.getByRole('tab', { name: 'Verlauf' })
    expect(getComputedStyle(picked).flexDirection).toBe('column')
    expect(picked.getAttribute('aria-current')).toBe('page')
    expect(Number.parseFloat(getComputedStyle(picked).minHeight)).toBeGreaterThanOrEqual(44)
  })

  it('keeps rows at a touch-sized height', () => {
    renderRail()
    expect(Number.parseFloat(getComputedStyle(screen.getByRole('tab', { name: 'Cockpit' })).minHeight)).toBeGreaterThanOrEqual(44)
  })
})
