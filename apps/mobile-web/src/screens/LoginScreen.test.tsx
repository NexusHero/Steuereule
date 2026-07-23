import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../i18n/app-i18n'
import { LoginScreen } from './LoginScreen'

function renderLogin(opts: { lng?: 'de' | 'en'; onDone?: () => void; onGuest?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <LoginScreen onDone={opts.onDone ?? (() => {})} onGuest={opts.onGuest ?? (() => {})} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('LoginScreen', () => {
  it('renders the German login by default (brand, social, email)', () => {
    renderLogin()
    expect(screen.getByText('Weiter mit Google')).toBeTruthy()
    expect(screen.getByText('Weiter mit Apple')).toBeTruthy()
    expect(screen.getByText('Einloggen')).toBeTruthy()
    expect(screen.getByText('Erstmal als Gast umschauen')).toBeTruthy()
  })

  it('switches to English when the locale changes (ADR-0006)', () => {
    renderLogin({ lng: 'en' })
    expect(screen.getByText('Continue with Google')).toBeTruthy()
    expect(screen.getByText('Log in')).toBeTruthy()
    expect(screen.getByText('Look around as a guest')).toBeTruthy()
  })

  it('shows an email error for an invalid address', () => {
    renderLogin()
    fireEvent.click(screen.getByText('Einloggen'))
    expect(screen.getByText('Das sieht noch nicht nach einer E-Mail aus.')).toBeTruthy()
  })

  it('shows a password error once the email is valid but the password is short', () => {
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByText('Einloggen'))
    expect(screen.getByText('Mindestens 6 Zeichen fürs Passwort.')).toBeTruthy()
  })

  it('calls onDone with a valid email and password', () => {
    const onDone = vi.fn()
    renderLogin({ onDone })
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'geheim1' } })
    fireEvent.click(screen.getByText('Einloggen'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('calls onGuest from the guest chip', () => {
    const onGuest = vi.fn()
    renderLogin({ onGuest })
    fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))
    expect(onGuest).toHaveBeenCalledOnce()
  })

  it('lets Google sign-in through (demo)', () => {
    const onDone = vi.fn()
    renderLogin({ onDone })
    fireEvent.click(screen.getByText('Weiter mit Google'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  // steuereule#65 — the guest-mode note used to claim device-only storage, which went false
  // once the guest path started flowing into Onboarding's server-side, encrypted persistence
  // (ADR-020 + REQ-003). Exact-match assertions (not a loose substring) so a future regression
  // back to a false "stays on this device" claim fails loudly.
  it('renders honest guest-mode copy that no longer claims device-only storage (de)', () => {
    renderLogin()
    expect(
      screen.getByText('Gast-Modus: deine Angaben werden sicher verschlüsselt gespeichert.'),
    ).toBeTruthy()
    expect(screen.queryByText(/nur auf diesem Gerät/)).toBeNull()
  })

  it('renders honest guest-mode copy that no longer claims device-only storage (en)', () => {
    renderLogin({ lng: 'en' })
    expect(
      screen.getByText('Guest mode: your details are saved securely, encrypted.'),
    ).toBeTruthy()
    expect(screen.queryByText(/this device only/)).toBeNull()
  })
})
