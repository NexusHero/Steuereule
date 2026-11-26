import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/test-msw-server'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { PasswordResetScreen } from './PasswordResetScreen'

const BASE_URL = 'http://localhost:3000'
const GOOD = 'ein-langes-passwort-1'

function renderReset(opts: { token?: string | undefined; onDone?: () => void; onRequestNew?: () => void } = {}) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <AuthClientProvider client={createAppAuthClient(BASE_URL)}>
          <PasswordResetScreen
            token={'token' in opts ? opts.token : 'tok-123'}
            onDone={opts.onDone ?? (() => {})}
            onRequestNew={opts.onRequestNew ?? (() => {})}
          />
        </AuthClientProvider>
      </ThemeProvider>
    </I18nextProvider>,
  )
}

function fill(first = GOOD, second = GOOD) {
  fireEvent.change(screen.getByTestId('passwort-reset-neu'), { target: { value: first } })
  fireEvent.change(screen.getByTestId('passwort-reset-wiederholen'), { target: { value: second } })
  fireEvent.click(screen.getByTestId('passwort-reset-speichern'))
}

function resetSeen(status = 200, body: unknown = { status: true }) {
  const seen: { url: string; body: unknown }[] = []
  server.use(
    http.post(`${BASE_URL}/api/auth/reset-password`, async ({ request }) => {
      seen.push({ url: request.url, body: await request.json() })
      return HttpResponse.json(body as Record<string, unknown>, { status })
    }),
  )
  return seen
}

describe('PasswordResetScreen', () => {
  it('sends the new password and the token in the body only, then offers the sign-in', async () => {
    const seen = resetSeen()
    const onDone = vi.fn()
    renderReset({ onDone })
    fill()
    await screen.findByTestId('passwort-reset-erfolg')
    expect(seen).toEqual([{ url: `${BASE_URL}/api/auth/reset-password`, body: { newPassword: GOOD, token: 'tok-123' } }])
    fireEvent.click(screen.getByTestId('passwort-reset-zum-login'))
    expect(onDone).toHaveBeenCalled()
  })

  it('refuses a password under 12 characters without asking the server', () => {
    const seen = resetSeen()
    renderReset()
    fill('kurz-1234', 'kurz-1234')
    expect(screen.getByText('Mindestens 12 Zeichen fürs Passwort.')).toBeTruthy()
    expect(seen).toEqual([])
  })

  it('refuses two different passwords', () => {
    const seen = resetSeen()
    renderReset()
    fill(GOOD, `${GOOD}x`)
    expect(screen.getByText('Die beiden Passwörter stimmen nicht überein.')).toBeTruthy()
    expect(seen).toEqual([])
  })

  it('shows the breached-password message and keeps the form', async () => {
    resetSeen(400, { code: 'PASSWORD_COMPROMISED', message: 'x' })
    renderReset()
    fill()
    expect(await screen.findByText(/Datenleck/)).toBeTruthy()
    expect(screen.getByTestId('passwort-reset-speichern')).toBeTruthy()
  })

  it('shows the invalid-link state when the server calls the token invalid', async () => {
    resetSeen(400, { code: 'INVALID_TOKEN', message: 'Invalid token' })
    const onRequestNew = vi.fn()
    renderReset({ onRequestNew })
    fill()
    await screen.findByTestId('passwort-reset-ungueltig')
    fireEvent.click(screen.getByTestId('passwort-reset-neuer-link'))
    expect(onRequestNew).toHaveBeenCalled()
  })

  it('shows the invalid-link state straight away without a token', () => {
    renderReset({ token: undefined })
    expect(screen.getByTestId('passwort-reset-ungueltig')).toBeTruthy()
    expect(screen.queryByTestId('passwort-reset-neu')).toBeNull()
  })

  it('says so on 429', async () => {
    resetSeen(429, { message: 'Too many requests' })
    renderReset()
    fill()
    expect(await screen.findByText(/Zu viele Versuche/)).toBeTruthy()
  })

  it('shows a generic error on a server failure and lets the user retry', async () => {
    resetSeen(500, {})
    renderReset()
    fill()
    await waitFor(() => expect(screen.getByText(/nicht geklappt/)).toBeTruthy())
    expect(screen.getByTestId('passwort-reset-speichern')).toBeTruthy()
  })
})
