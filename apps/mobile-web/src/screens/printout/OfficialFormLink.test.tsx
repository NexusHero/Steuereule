// OfficialFormLink — the way from a mask to its official Vordruck.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { NavigationContext } from '@react-navigation/native'
import { ThemeProvider } from '@steuereule/ui'
import type { Screen } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { OfficialFormLink } from './OfficialFormLink'

function renderLink(screenName: Screen, navigate: ReturnType<typeof vi.fn> | null) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <NavigationContext.Provider value={navigate === null ? undefined : ({ navigate } as never)}>
          <OfficialFormLink screen={screenName} taxYear={2025} />
        </NavigationContext.Provider>
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('OfficialFormLink', () => {
  it.each([
    ['lstb', 'anlage-n'],
    ['chLohnausweis', 'anlage-n-gre'],
    ['kind', 'anlage-kind'],
    ['vermietung', 'anlage-v'],
    ['kapital', 'anlage-kap'],
    ['rente', 'anlage-r'],
  ] as const)('opens the form of the %s mask on its own screen (%s)', (maskScreen, form) => {
    const navigate = vi.fn()
    renderLink(maskScreen, navigate)
    fireEvent.click(screen.getByTestId('official-form-link'))
    expect(navigate).toHaveBeenCalledWith('Cockpit', { screen: 'OfficialForm', params: { year: 2025, form } })
  })

  it('falls back to the main form for a mask without an Anlage of its own', () => {
    const navigate = vi.fn()
    renderLink('stammdaten', navigate)
    fireEvent.click(screen.getByTestId('official-form-link'))
    expect(navigate).toHaveBeenCalledWith('Cockpit', { screen: 'OfficialForm', params: { year: 2025, form: 'est-1-a' } })
  })

  it('renders nothing outside a navigator', () => {
    renderLink('kind', null)
    expect(screen.queryByTestId('official-form-link')).toBeNull()
  })
})
