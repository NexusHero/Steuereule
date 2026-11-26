// REQ-007 — the security screen's 2FA affordance. MSW-backed (no DB): the server's own
// better-auth `two-factor` plugin enforces the flow (enable → one-code confirm, disable →
// password re-auth) in `req-007-totp.test.ts` against real Postgres; this suite proves the
// *client* drives those endpoints and renders the honest on/off state from the session —
// never from local state that could drift from a server-side revocation.
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { createAppAuthClient } from '../../auth/auth-client'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { server } from '../../../test/test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { SecurityScreen } from './SecurityScreen'
import { renderWithQuery } from '../../../test/test-render'

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

function renderSecurity() {
  const authClient = createAppAuthClient(BASE_URL)
  return renderWithQuery(
    <AuthClientProvider client={authClient}>
      <SecurityScreen onBack={() => {}} />
    </AuthClientProvider>,
  )
}

describe('SicherheitScreen (REQ-007)', () => {
  it('reads the off state from the session, not from local state', async () => {
    server.use(http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))))
    renderSecurity()
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
    renderSecurity()

    await screen.findByText('Zwei-Faktor aktivieren')
    fireEvent.click(screen.getByText('Zwei-Faktor aktivieren'))

    // Password re-confirmation before the server mints a secret.
    const password = await screen.findByPlaceholderText('••••••••')
    fireEvent.change(password, { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByText('Weiter'))

    // Setup shows the real totpURI (a scannable QR) + backup codes, and asks for one code.
    await screen.findByText(TOTP_URI)
    const qrWrapper = screen.getByTestId('zweifaktor-qr-wrapper')
    expect(qrWrapper.style.alignItems).toBe('center')
    expect(qrWrapper.style.justifyContent).toBe('center')
    expect(screen.getByText(/111-222/)).toBeTruthy()
    expect(screen.getByText(/333-444/)).toBeTruthy()
    expect(enableCalled).toBe(true)

    const totpInput = screen.getByPlaceholderText('123456')
    expect(totpInput.getAttribute('inputmode')).toBe('numeric')
    fireEvent.change(totpInput, { target: { value: '123456' } })
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
    renderSecurity()

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
    renderSecurity()

    await screen.findByText('Passkeys')
    // The honest web-only disclosure renders — native is follow-up work, not silently claimed.
    expect(screen.getByText(/Passkeys funktionieren im Browser/)).toBeTruthy()
    expect(screen.getByText('Mein Laptop')).toBeTruthy()

    fireEvent.click(screen.getByText('Entfernen'))
    await screen.findByText('Passkey wurde entfernt.')
    expect(deleteCalled).toBe(true)
  })

  it('asks for the password again when the server needs a step-up before adding a passkey (ADR-0106 D2)', async () => {
    let optionsCalls = 0
    const verifiedWith: string[] = []
    server.use(
      http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))),
      http.get('*/api/auth/passkey/list-user-passkeys', () => HttpResponse.json([])),
      http.get('*/api/auth/passkey/generate-register-options', () => {
        optionsCalls += 1
        return HttpResponse.json({ code: 'FRESH_AUTH_REQUIRED', message: 'step-up' }, { status: 403 })
      }),
      http.post('*/api/auth/verify-password', async ({ request }) => {
        verifiedWith.push(((await request.json()) as { password: string }).password)
        return HttpResponse.json({ status: true })
      }),
    )
    renderSecurity()

    await screen.findByText('Passkeys')
    fireEvent.click(screen.getByText('Passkey hinzufügen'))
    await screen.findByText('Passwort bestätigen')
    fireEvent.change(screen.getByTestId('passkey-passwort'), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByTestId('passkey-passwort-bestaetigen'))

    await waitFor(() => expect(optionsCalls).toBe(2))
    expect(verifiedWith).toEqual(['correct-password'])
  })
})

describe('SicherheitScreen — failures (NR-16, NR-24, WEB-28)', () => {
  it('NR-16: a failed session check is not "only for a real account", and can be retried', async () => {
    let calls = 0
    server.use(
      http.get('*/api/auth/get-session', () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 503 }) : HttpResponse.json(signedInSession(false))
      }),
    )
    renderSecurity()
    expect(await screen.findByTestId('sicherheit-sitzung-unbekannt')).toBeTruthy()
    expect(screen.queryByText(/echtes Konto/)).toBeNull()
    fireEvent.click(screen.getByTestId('sicherheit-sitzung-erneut'))
    expect(await screen.findByText('Passkeys')).toBeTruthy()
  })

  it('NR-24: a passkey list that did not load offers a retry instead of "Wird geladen …" for ever', async () => {
    let calls = 0
    server.use(
      http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))),
      http.get('*/api/auth/passkey/list-user-passkeys', () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([])
      }),
    )
    renderSecurity()
    fireEvent.click(await screen.findByTestId('passkey-liste-erneut'))
    expect(await screen.findByText('Noch keine Passkeys eingerichtet.')).toBeTruthy()
  })

  it('NR-24: the passkey password step can be cancelled', async () => {
    server.use(
      http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))),
      http.get('*/api/auth/passkey/list-user-passkeys', () => HttpResponse.json([])),
      http.get('*/api/auth/passkey/generate-register-options', () => HttpResponse.json({ code: 'FRESH_AUTH_REQUIRED' }, { status: 403 })),
    )
    renderSecurity()
    await screen.findByText('Passkeys')
    fireEvent.click(screen.getByText('Passkey hinzufügen'))
    fireEvent.click(await screen.findByTestId('passkey-passwort-abbrechen'))
    await waitFor(() => expect(screen.queryByTestId('passkey-passwort')).toBeNull())
  })

  it('fails closed: every request answering 500 shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderSecurity()
    await expectFailsClosed(failing)
  })

  it('fails closed when signed in: a passkey list that failed sends no write', async () => {
    const failing = failEveryRequest()
    server.use(http.get('*/api/auth/get-session', () => HttpResponse.json(signedInSession(false))))
    renderSecurity()
    await screen.findByTestId('passkey-liste-erneut')
    await expectFailsClosed(failing)
  })
})
