// The shell beyond the phone (Graphit): on a desktop-wide window the tabs are a rail with the brand on the
// left edge, on a tablet-wide one a narrow rail; the screen keeps that room free, and everything the bar
// does (switching, hiding for a sheet) the rail does too.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import * as ReactNative from 'react-native'
import { SIDE_NAV_COMPACT_WIDTH, SIDE_NAV_WIDTH } from '@steuereule/ui'
import { currentRoute, renderShell, signedIn } from './navigationTestKit'
import { owlAnswerArrived, resetOwlUnread } from '../screens/advisor/owlUnread'

vi.mock('../screens/cockpit/CockpitScreen', async () => ({ CockpitScreen: (await import('./stubScreen')).stubScreen('cockpit') }))
vi.mock('../screens/capital/CapitalScreen', async () => ({ CapitalScreen: (await import('./stubScreen')).stubScreen('capital') }))
vi.mock('../screens/history/HistoryScreen', async () => ({ HistoryScreen: (await import('./stubScreen')).stubScreen('history') }))
vi.mock('../screens/ProfileScreen', async () => ({ ProfileScreen: (await import('./stubScreen')).stubScreen('profile') }))
vi.mock('../screens/PrivacyScreen', async () => ({ PrivacyScreen: (await import('./stubScreen')).stubScreen('privacy') }))
vi.mock('../screens/advisor/OwlModeScreen', async () => ({ OwlModeScreen: (await import('./stubScreen')).stubScreen('owl') }))
vi.mock('../screens/receipts/ReceiptsScreen', async () => ({ ReceiptsScreen: (await import('./stubScreen')).stubScreen('receipts') }))

function windowWidth(width: number) {
  vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 900, scale: 1, fontScale: 1 } as ReactNative.ScaledSize)
}

const open = async (path: string) => {
  renderShell(path)
  await screen.findAllByTestId(/^stub-/)
}

beforeEach(() => {
  signedIn()
  sessionStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  resetOwlUnread()
})

describe('the shell at desktop width', () => {
  it('shows the tabs as a rail with the brand, not as the floating bar', async () => {
    windowWidth(1440)
    await open('/app')
    const rail = screen.getByTestId('app-seitennavigation')
    expect(getComputedStyle(rail).width).toBe(`${SIDE_NAV_WIDTH}px`)
    expect(rail.textContent).toContain('SteuerEule')
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical')
    expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual(['Cockpit', 'Eule', 'Belege', 'Verlauf', 'Profil'])
  })

  it('keeps the rail’s room free on the left of the screen and none under it', async () => {
    windowWidth(1440)
    await open('/app')
    const scene = screen.getByTestId('stub-cockpit-props').closest('[style*="padding-left"]') as HTMLElement
    expect(scene.style.paddingLeft).toBe(`${SIDE_NAV_WIDTH}px`)
    expect(scene.style.paddingBottom).toBe('0px')
  })

  it('switches tabs from the rail and marks the picked one', async () => {
    windowWidth(1440)
    await open('/app')
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }))
    await waitFor(() => expect(currentRoute().name).toBe('HistoryHome'))
    expect(screen.getByRole('tab', { name: 'Verlauf' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('tab', { name: 'Cockpit' }).getAttribute('aria-current')).toBeNull()
  })

  it('narrows to the icon rail on the owl’s tab, so the chat keeps the window', async () => {
    windowWidth(1440)
    await open('/app')
    fireEvent.click(screen.getByRole('tab', { name: 'Eule' }))
    await waitFor(() => expect(currentRoute().name).toBe('Owl'))
    const rail = screen.getByTestId('app-seitennavigation')
    expect(getComputedStyle(rail).width).toBe(`${SIDE_NAV_COMPACT_WIDTH}px`)
    expect(rail.textContent).not.toContain('SteuerEule')
    const scene = screen.getByTestId('stub-owl-props').closest('[style*="padding-left"]') as HTMLElement
    expect(scene.style.paddingLeft).toBe(`${SIDE_NAV_COMPACT_WIDTH}px`)
    fireEvent.click(screen.getByRole('tab', { name: 'Cockpit' }))
    await waitFor(() => expect(getComputedStyle(screen.getByTestId('app-seitennavigation')).width).toBe(`${SIDE_NAV_WIDTH}px`))
  })

  it('steps aside for a sheet, as the bar does', async () => {
    windowWidth(1440)
    renderShell({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'CockpitHome' }, { name: 'Capital', params: { year: 2025 } }] } }] } as never)
    await screen.findByTestId('stub-capital-props')
    expect(screen.queryByTestId('app-seitennavigation')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it.each([834, 1440])('keeps the rail beside a page below the profile at %i px, and its room free', async (width) => {
    windowWidth(width)
    await open('/app/profil/datenschutz')
    expect(screen.getByTestId('stub-privacy')).toBeTruthy()
    const rail = screen.getByTestId('app-seitennavigation')
    expect(rail.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Profil')
    fireEvent.click(screen.getByRole('tab', { name: 'Cockpit' }))
    await waitFor(() => expect(currentRoute().name).toBe('CockpitHome'))
  })

  it('hides the bar on a phone for a page below the profile: it would lie on the page', async () => {
    windowWidth(390)
    await open('/app/profil/datenschutz')
    expect(screen.getByTestId('stub-privacy')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('stays the floating bar on a phone', async () => {
    windowWidth(390)
    await open('/app')
    expect(screen.queryByTestId('app-seitennavigation')).toBeNull()
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBeNull()
  })
})

// The chat keeps running while the user is on another tab. When its answer arrives there, the owl's entry
// says so, in the bar and in the rail, until the owl is opened.
describe.each([390, 834, 1440])('an answer of the owl that arrived elsewhere, at %i px', (width) => {
  it('marks the owl’s entry and is read by opening the owl', async () => {
    windowWidth(width)
    await open('/app')
    expect(screen.queryByTestId('tab-badge')).toBeNull()

    act(() => owlAnswerArrived())
    const owl = screen.getByRole('tab', { name: 'Eule, neue Antwort' })
    expect(owl.querySelector('[data-testid="tab-badge"]')).not.toBeNull()

    fireEvent.click(owl)
    await waitFor(() => expect(currentRoute().name).toBe('Owl'))
    await waitFor(() => expect(screen.queryByTestId('tab-badge')).toBeNull())
    expect(screen.getByRole('tab', { name: 'Eule' })).toBeTruthy()
  })

  it('does not mark an answer the user is watching arrive', async () => {
    windowWidth(width)
    await open('/app/eule')
    act(() => owlAnswerArrived())
    expect(screen.queryByTestId('tab-badge')).toBeNull()
  })
})

describe('the shell at tablet width', () => {
  it.each([768, 1024])('shows a narrow rail at %i px: the owl without the name, all five tabs', async (width) => {
    windowWidth(width)
    await open('/app')
    const rail = screen.getByTestId('app-seitennavigation')
    expect(getComputedStyle(rail).width).toBe(`${SIDE_NAV_COMPACT_WIDTH}px`)
    expect(rail.textContent).not.toContain('SteuerEule')
    // The owl alone carries the name, as an image; never as a label on a plain group.
    expect(screen.getByRole('img', { name: 'SteuerEule' })).toBeTruthy()
    expect(rail.querySelector('[aria-label]:not([role])')).toBeNull()
    expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual(['Cockpit', 'Eule', 'Belege', 'Verlauf', 'Profil'])
    const scene = screen.getByTestId('stub-cockpit-props').closest('[style*="padding-left"]') as HTMLElement
    expect(scene.style.paddingLeft).toBe(`${SIDE_NAV_COMPACT_WIDTH}px`)
    expect(scene.style.paddingBottom).toBe('0px')
  })

  it('switches tabs from the narrow rail', async () => {
    windowWidth(820)
    await open('/app')
    fireEvent.click(screen.getByRole('tab', { name: 'Belege' }))
    await waitFor(() => expect(currentRoute().name).toBe('Receipts'))
    expect(screen.getByRole('tab', { name: 'Belege' }).getAttribute('aria-current')).toBe('page')
  })
})
