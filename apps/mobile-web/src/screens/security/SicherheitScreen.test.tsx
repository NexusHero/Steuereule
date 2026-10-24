// REQ-007 — the security screen's 2FA affordance. MSW-backed (no DB): the server's own
// better-auth `two-factor` plugin enforces the flow (enable → one-code confirm, disable →
// password re-auth) in `req-007-totp.test.ts` against real Postgres; this suite proves the
// *client* drives those endpoints and renders the honest on/off state from the session —
// never from local state that could drift from a server-side revocation.
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { createAppAuthClient } from '../../auth/auth-client'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { server } from '../../test-msw-server'
import { SicherheitScreen } from './SicherheitScreen'

const BASE_URL = 'http://localhost:3000'
const TOTP_URI = 'otpauth://totp/SteuerEule:anna@example.com?secret=ABCDEFGHIJKLMNOP&issuer=SteuerEule'

function signedInSession(twoFactorEnabled: boolean) {
  return {
    user: {
      id: 'user-1',
      email: 'anna@example.com',
      emailVerified: true,
      name: 'Anna Beispiel',
      twoFactorEnabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    session: { id: 'session-1', userId: 'user-1', token: 'tok', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
  }
}

function renderSicherheit() {
  const queryClient = new QueryClient()
  const authClient = createAppAuthClient(BASE_URL)
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={authClient}>
            <SicherheitScreen onZurueck={() => {}} />
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('SicherheitScreen (REQ-007)', () => {
  it('reads the off state from the session, not from local state', async () => {
    server.use(http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))))
    renderSicherheit()
    await screen.findByText('Zwei-Faktor-Authentifizierung')
    expect(screen.getByText('Aus')).toBeTruthy()
    expect(screen.getByText('Zwei-Faktor aktivieren')).toBeTruthy()
  })

  it('walks the enable flow: password → setup (QR + backup codes) → one-code confirm', async () => {
    let enableCalled = false
    let verifyCalled = false
    server.use(
      http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))),
      http.post('*/api/auth/two-factor/enable', async ({ request }) => {
        enableCalled = true
        const body = (await request.json()) as { password: string }
        expect(body.password).toBe('correct-password')
        return HttpResponse.json({ totpURI: TOTP_URI, backupCodes: ['111-222', '333-444'] })
      }),
      http.post('*/api/auth/two-factor/verify-totp', async ({ request }) => {
        verifyCalled = true
        const body = (await request.json()) as { code: string }
        expect(body.code).toBe('123456')
        return HttpResponse.json({ user: signedInSession(true).user, token: 'tok' })
      }),
    )
    renderSicherheit()

    await screen.findByText('Zwei-Faktor aktivieren')
    fireEvent.click(screen.getByText('Zwei-Faktor aktivieren'))

    // Password re-confirmation before the server mints a secret.
    const password = await screen.findByPlaceholderText('••••••••')
    fireEvent.change(password, { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByText('Weiter'))

    // Setup shows the real totpURI (a scannable QR) + backup codes, and asks for one code.
    await screen.findByText(TOTP_URI)
    expect(screen.getByText(/111-222/)).toBeTruthy()
    expect(screen.getByText(/333-444/)).toBeTruthy()
    expect(enableCalled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Code bestätigen'))

    await screen.findByText('Zwei-Faktor-Authentifizierung ist jetzt aktiv.')
    expect(verifyCalled).toBe(true)
  })

  it('walks the disable flow: password re-authentication is required to remove the factor', async () => {
    let disableCalled = false
    server.use(
      http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(true))),
      http.post('*/api/auth/two-factor/disable', async ({ request }) => {
        disableCalled = true
        const body = (await request.json()) as { password: string }
        expect(body.password).toBe('correct-password')
        return HttpResponse.json({ status: true })
      }),
    )
    renderSicherheit()

    await screen.findByText('Zwei-Faktor deaktivieren')
    expect(screen.getByText('Aktiv')).toBeTruthy()

    fireEvent.click(screen.getByText('Zwei-Faktor deaktivieren'))
    const password = await screen.findByPlaceholderText('••••••••')
    fireEvent.change(password, { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByText('Deaktivieren'))

    await screen.findByText('Zwei-Faktor-Authentifizierung ist aus.')
    expect(disableCalled).toBe(true)
  })

  it('lists a registered passkey and removes it (web-only section)', async () => {
    let deleteCalled = false
    server.use(
      http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))),
      http.get('*/api/auth/passkey/list-user-passkeys', () =>
        HttpResponse.json([{ id: 'pk-1', name: 'Mein Laptop', deviceType: 'singleDevice', createdAt: new Date().toISOString() }]),
      ),
      http.post('*/api/auth/passkey/delete-passkey', async ({ request }) => {
        deleteCalled = true
        const body = (await request.json()) as { id: string }
        expect(body.id).toBe('pk-1')
        return HttpResponse.json({ status: true })
      }),
    )
    renderSicherheit()

    await screen.findByText('Passkeys')
    // The honest web-only disclosure renders — native is follow-up work, not silently claimed.
    expect(screen.getByText(/Passkeys funktionieren im Browser/)).toBeTruthy()
    expect(screen.getByText('Mein Laptop')).toBeTruthy()

    fireEvent.click(screen.getByText('Entfernen'))
    await screen.findByText('Passkey wurde entfernt.')
    expect(deleteCalled).toBe(true)
  })
})
