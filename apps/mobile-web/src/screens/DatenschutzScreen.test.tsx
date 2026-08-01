// REQ-011 (ADR-0013) — Datenschutz screen. Tests-first: written before DatenschutzScreen.tsx
// exists, mirroring ProfilScreen.test.tsx's render/MSW conventions. Covers: the honest
// session-derived guest/account branch, both export formats, the full delete flow (offer ->
// confirm -> [password] -> success/failure per ADR-0013 §6's distinct status codes), and that
// the corrected DSGVO copy (not the DS demo's wrong wording) is what actually renders.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient, type AppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { DatenschutzScreen } from './DatenschutzScreen'
import { server } from '../test-msw-server'

const BASE_URL = 'http://localhost:3000'

vi.mock('./datenschutz/exportDownload', async () => {
  const actual = await vi.importActual<typeof import('./datenschutz/exportDownload')>('./datenschutz/exportDownload')
  return { ...actual, downloadAccountExport: vi.fn() }
})
import { downloadAccountExport } from './datenschutz/exportDownload'

const mockedDownload = vi.mocked(downloadAccountExport)

const REAL_SESSION = {
  user: { id: 'u1', email: 'anna@example.com', emailVerified: true, name: 'Anna' },
  session: { id: 's1', createdAt: new Date().toISOString() },
}

function mockSession(session: typeof REAL_SESSION | null) {
  server.use(http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.json(session)))
}

function renderDatenschutz(opts: { lng?: 'de' | 'en'; onZurueck?: () => void; onAccountDeleted?: () => void; queryClient?: QueryClient; authClient?: AppAuthClient } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  // Defaults to a fresh client per render, same as before — but a caller can pass its own,
  // already-constructed client (and reuse it across an unmount/re-mount) to prove F2: whether
  // "signed out" survives a re-mount depends on this client's session atom actually being
  // invalidated, not on component unmount timing (App.tsx constructs its auth client once,
  // outside the tree, so it stays alive across the stage change back to Login).
  const authClient = opts.authClient ?? createAppAuthClient(BASE_URL)
  const queryClient = opts.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={authClient}>
            <DatenschutzScreen onZurueck={opts.onZurueck ?? (() => {})} onAccountDeleted={opts.onAccountDeleted ?? (() => {})} />
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function openAccountScreen(opts: Parameters<typeof renderDatenschutz>[0] = {}) {
  mockSession(REAL_SESSION)
  renderDatenschutz(opts)
  await screen.findByText('Konto & Daten löschen')
}

describe('DatenschutzScreen', () => {
  afterEach(() => {
    mockedDownload.mockReset()
  })

  it('calls onZurueck from the back button', () => {
    mockSession(REAL_SESSION)
    const onZurueck = vi.fn()
    renderDatenschutz({ onZurueck })
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onZurueck).toHaveBeenCalledOnce()
  })

  it('shows an honest loading state while the session is being checked', async () => {
    mockSession(REAL_SESSION)
    renderDatenschutz()
    expect(screen.getByText('Wird geprüft …')).toBeTruthy()
    await screen.findByText('Konto & Daten löschen')
  })

  describe('guest (no real better-auth account)', () => {
    it('shows an honest "no account" notice instead of export/delete actions', async () => {
      mockSession(null)
      renderDatenschutz()
      await screen.findByText('Noch kein Konto')
      expect(screen.queryByText('Konto & Daten löschen')).toBeNull()
      expect(screen.queryByText('Als JSON herunterladen')).toBeNull()
    })
  })

  describe('real account — export', () => {
    it('renders both export formats as distinct, real actions (never a placeholder toast)', async () => {
      await openAccountScreen()
      expect(screen.getByText('Als JSON herunterladen')).toBeTruthy()
      expect(screen.getByText('Als PDF-Bericht herunterladen')).toBeTruthy()
    })

    it('triggers the JSON download and shows an honest success note', async () => {
      mockedDownload.mockResolvedValue({ ok: true, status: 200 })
      await openAccountScreen()

      fireEvent.click(screen.getByText('Als JSON herunterladen'))

      await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith('json'))
      expect(await screen.findByText('Heruntergeladen.')).toBeTruthy()
    })

    it('triggers the PDF download independently of the JSON one', async () => {
      mockedDownload.mockResolvedValue({ ok: true, status: 200 })
      await openAccountScreen()

      fireEvent.click(screen.getByText('Als PDF-Bericht herunterladen'))

      await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith('pdf'))
    })

    it('shows an honest, retryable error when the export fails', async () => {
      mockedDownload.mockResolvedValue({ ok: false, status: 500 })
      await openAccountScreen()

      fireEvent.click(screen.getByText('Als JSON herunterladen'))

      expect(await screen.findByText('Der Export hat gerade nicht geklappt. Versuch es noch mal.')).toBeTruthy()
    })

    it('shows an honest error on a genuine network failure during export', async () => {
      mockedDownload.mockRejectedValue(new Error('offline'))
      await openAccountScreen()

      fireEvent.click(screen.getByText('Als PDF-Bericht herunterladen'))

      expect(await screen.findByText('Der Export hat gerade nicht geklappt. Versuch es noch mal.')).toBeTruthy()
    })
  })

  describe('real account — deletion, the corrected copy (ADR-0013 §8)', () => {
    it('shows the pre-delete offer with the corrected anonymise-and-retain / Löschschutz wording, never the DS demo’s wrong claims', async () => {
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))

      await screen.findByText('Bevor du löschst')
      expect(screen.getByText(/anonymisiert erhalten/)).toBeTruthy()
      expect(screen.getByText(/Löschschutz/)).toBeTruthy()
      // A single, explicit assertion against the actual current wording — not a `getByText(a)
      // ?? getByText(b)` "either" that can never actually fall through to `b` (`getByText`
      // throws instead of returning null on no match, per Musti's T1, F5).
      expect(screen.getByText(/Exportiere sie dir vorher/)).toBeTruthy()

      // The DS demo's factually wrong wording must never appear.
      expect(screen.queryByText(/Belege.*ZIP/)).toBeNull()
      expect(screen.queryByText(/auch auf unseren Servern/)).toBeNull()
    })

    it('never offers the DS demo’s "PDF-Bericht + Belege (ZIP)" export label anywhere on screen', async () => {
      await openAccountScreen()
      expect(screen.queryByText(/Belege \(ZIP\)/)).toBeNull()
      expect(screen.queryByText(/PDF-Bericht \+ Belege/)).toBeNull()
    })

    it('the offer’s "Erst exportieren" button triggers a real JSON export, not a toast', async () => {
      mockedDownload.mockResolvedValue({ ok: true, status: 200 })
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')

      fireEvent.click(screen.getByText('Erst als JSON exportieren (empfohlen)'))

      await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith('json'))
      expect(await screen.findByText('Export gestartet.')).toBeTruthy()
    })

    it('Abbrechen on the offer step closes the flow with nothing sent', async () => {
      let deleteCalls = 0
      server.use(http.delete(`${BASE_URL}/v1/account`, () => { deleteCalls += 1; return HttpResponse.json({}, { status: 200 }) }))
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')

      fireEvent.click(screen.getByText('Abbrechen'))

      expect(screen.queryByText('Bevor du löschst')).toBeNull()
      expect(deleteCalls).toBe(0)
    })

    it('"Weiter ohne Export" advances to the explicit confirmation step, distinct from the offer', async () => {
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')

      fireEvent.click(screen.getByText('Weiter ohne Export'))

      await screen.findByText('Bist du sicher?')
      expect(screen.getByText('Ja, endgültig löschen')).toBeTruthy()
    })

    it('deletes on confirm (fresh session, no password needed), clears the query cache, and signals onAccountDeleted', async () => {
      let receivedBody: unknown
      server.use(
        http.delete(`${BASE_URL}/v1/account`, async ({ request }) => {
          receivedBody = await request.json()
          return HttpResponse.json({ deleted: { profile: true, account: true }, retainedAnonymisedAuditRows: 2, retainedUnderLegalHold: 0 }, { status: 200 })
        }),
      )
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
      const clearSpy = vi.spyOn(queryClient, 'clear')
      const onAccountDeleted = vi.fn()
      mockSession(REAL_SESSION)
      renderDatenschutz({ onAccountDeleted, queryClient })
      await screen.findByText('Konto & Daten löschen')

      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))

      await waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce())
      expect(receivedBody).toEqual({ confirm: true })
      expect(clearSpy).toHaveBeenCalled()
    })

    it('a stale session (400, fresh-auth required) asks for the password instead of a generic error', async () => {
      server.use(http.delete(`${BASE_URL}/v1/account`, () => HttpResponse.json({ statusCode: 400, message: 'not fresh' }, { status: 400 })))
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')

      fireEvent.click(screen.getByText('Ja, endgültig löschen'))

      await screen.findByText('Bestätige mit deinem Passwort')
      expect(screen.getByText(/Deine Sitzung ist nicht mehr aktuell genug/)).toBeTruthy()
    })

    it('a wrong password (401) shows its own honest message and lets the user retry', async () => {
      server.use(
        http.delete(`${BASE_URL}/v1/account`, async ({ request }) => {
          const body = (await request.json()) as { password?: string }
          if (body.password === undefined) return HttpResponse.json({ statusCode: 400 }, { status: 400 })
          if (body.password !== 'right-pass') return HttpResponse.json({ statusCode: 401 }, { status: 401 })
          return HttpResponse.json({ deleted: { profile: true, account: true }, retainedAnonymisedAuditRows: 0, retainedUnderLegalHold: 0 }, { status: 200 })
        }),
      )
      const onAccountDeleted = vi.fn()
      await openAccountScreen({ onAccountDeleted })
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))
      await screen.findByText('Bestätige mit deinem Passwort')

      fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'wrong-pass' } })
      fireEvent.click(screen.getByText('Bestätigen'))

      expect(await screen.findByText('Das Passwort stimmt nicht. Versuch es noch mal.')).toBeTruthy()
      expect(onAccountDeleted).not.toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'right-pass' } })
      fireEvent.click(screen.getByText('Bestätigen'))
      await waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce())
    })

    it('a rate-limited retry (429) shows its own honest message, distinct from a wrong password', async () => {
      server.use(
        http.delete(`${BASE_URL}/v1/account`, async ({ request }) => {
          const body = (await request.json()) as { password?: string }
          if (body.password === undefined) return HttpResponse.json({ statusCode: 400 }, { status: 400 })
          return HttpResponse.json({ statusCode: 429 }, { status: 429 })
        }),
      )
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))
      await screen.findByText('Bestätige mit deinem Passwort')

      fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'whatever' } })
      fireEvent.click(screen.getByText('Bestätigen'))

      expect(await screen.findByText('Zu viele Versuche. Warte kurz und versuch es dann noch mal.')).toBeTruthy()
    })

    it('a 403 mid-flow (session turned out to be a guest) shows the honest guest message, not a generic error', async () => {
      server.use(http.delete(`${BASE_URL}/v1/account`, () => HttpResponse.json({ statusCode: 403 }, { status: 403 })))
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')

      fireEvent.click(screen.getByText('Ja, endgültig löschen'))

      expect(await screen.findByText('Für Gast-Zugänge gibt es kein Konto zum Löschen.')).toBeTruthy()
    })

    it('a genuine network failure on confirm shows an honest, retryable error without pretending success', async () => {
      server.use(http.delete(`${BASE_URL}/v1/account`, () => HttpResponse.error()))
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')

      fireEvent.click(screen.getByText('Ja, endgültig löschen'))

      expect(await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
    })

    it('a genuine network failure while submitting the password shows its own honest error, staying on the password step', async () => {
      server.use(
        http.delete(`${BASE_URL}/v1/account`, async ({ request }) => {
          const body = (await request.json()) as { password?: string }
          if (body.password === undefined) return HttpResponse.json({ statusCode: 400 }, { status: 400 })
          return HttpResponse.error()
        }),
      )
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))
      await screen.findByText('Bestätige mit deinem Passwort')

      fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'whatever' } })
      fireEvent.click(screen.getByText('Bestätigen'))

      expect(await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
      expect(screen.getByText('Bestätige mit deinem Passwort')).toBeTruthy()
    })

    // Musti's T1, F1 — reproduced on the branch: the generated union types `.status` as exactly
    // 200/400/401/403/429, but `httpClient` never throws on a non-2xx and a real 500 (ADR-0013
    // §3 rollback) parses fine — so it reached the switch with no matching case, `deleteFlow`
    // never left `'deleting'`, and the user sat on an un-cancellable spinner forever. Drives a
    // real 500 and asserts the screen returns to an actionable state instead of hanging.
    it('a genuine 500 on confirm returns the user to the confirm step, never an infinite spinner', async () => {
      server.use(http.delete(`${BASE_URL}/v1/account`, () => HttpResponse.json({ statusCode: 500, message: 'internal error' }, { status: 500 })))
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')

      fireEvent.click(screen.getByText('Ja, endgültig löschen'))

      expect(await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
      // The user can act again — the confirm step's own buttons are back, not a spinner with
      // no way out.
      expect(screen.getByText('Ja, endgültig löschen')).toBeTruthy()
      expect(screen.getByText('Abbrechen')).toBeTruthy()
      expect(screen.queryByText('Wird gelöscht …')).toBeNull()
    })

    it('a genuine 500 while submitting the password returns the user to the password step, never an infinite spinner', async () => {
      server.use(
        http.delete(`${BASE_URL}/v1/account`, async ({ request }) => {
          const body = (await request.json()) as { password?: string }
          if (body.password === undefined) return HttpResponse.json({ statusCode: 400 }, { status: 400 })
          return HttpResponse.json({ statusCode: 500, message: 'internal error' }, { status: 500 })
        }),
      )
      await openAccountScreen()
      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))
      await screen.findByText('Bestätige mit deinem Passwort')

      fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'whatever' } })
      fireEvent.click(screen.getByText('Bestätigen'))

      expect(await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
      expect(screen.getByText('Bestätige mit deinem Passwort')).toBeTruthy()
      expect(screen.queryByText('Wird gelöscht …')).toBeNull()
    })

    // Musti's T1, F2 — reproduced on the branch: the 200 branch and App.tsx's `onSignedOut`
    // both clear the TanStack cache, but nothing invalidated better-auth's own session atom,
    // which `authClient.useSession()` (the guest gate) reads. Re-mounting after deletion — the
    // real shape of what happens when App.tsx swaps the stage back to Login, since it keeps its
    // one auth-client instance alive across that swap — kept rendering the signed-in section
    // for an account that no longer existed.
    it('genuinely signs the user out for a re-mount, not just the current mount (session atom refetched)', async () => {
      const authClient = createAppAuthClient(BASE_URL)
      let getSessionCalls = 0
      server.use(
        http.get(`${BASE_URL}/api/auth/get-session`, () => {
          getSessionCalls += 1
          // Only the very first read (before deletion) is the real, signed-in session — every
          // read after that reflects the account genuinely being gone, exactly like the real
          // server would answer once the session cookie is cleared server-side.
          return HttpResponse.json(getSessionCalls === 1 ? REAL_SESSION : null)
        }),
        http.delete(`${BASE_URL}/v1/account`, () =>
          HttpResponse.json({ deleted: { profile: true, account: true }, retainedAnonymisedAuditRows: 0, retainedUnderLegalHold: 0 }, { status: 200 }),
        ),
      )
      const onAccountDeleted = vi.fn()
      const { unmount } = renderDatenschutz({ authClient, onAccountDeleted })
      await screen.findByText('Konto & Daten löschen')

      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))
      await waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce())

      unmount()

      // Re-mount with the *same* auth-client instance — the only way this proves the atom
      // itself was invalidated, rather than a fresh client just fetching its own first answer.
      renderDatenschutz({ authClient })

      await screen.findByText('Noch kein Konto')
      expect(screen.queryByText('Konto & Daten löschen')).toBeNull()
    })
  })

  it('renders correctly in English (ADR-0006)', async () => {
    mockSession(REAL_SESSION)
    renderDatenschutz({ lng: 'en' })
    await screen.findByText('Delete account & data')
    expect(screen.getByText('Download as JSON')).toBeTruthy()
    expect(screen.getByText('Download as PDF report')).toBeTruthy()

    fireEvent.click(screen.getByText('Delete account & data'))
    await screen.findByText('Before you delete')
    expect(screen.queryByText(/Belege \(ZIP\)/)).toBeNull()
  })

  // #238 task 0c (ADR-0024): the QR-Code-Login slice makes Session.ipAddress/userAgent
  // user-visible and adds geo-IP resolution — both must be named here, explicitly (not via
  // snapshot, which would keep passing silently if this copy were ever deleted).
  describe('device-sessions & geo-IP disclosure (#238 task 0c)', () => {
    it('names that session IP/User-Agent are now user-visible, shown to a guest as well as an account holder', async () => {
      mockSession(null)
      renderDatenschutz()
      await screen.findByText('Anmeldungen & Geräte')
      expect(
        screen.getByText(
          'Bei jeder Anmeldung speichern wir die IP-Adresse und den Gerätetyp (User-Agent) der jeweiligen Sitzung — das war schon immer so. Neu ist: Wenn du dich per QR-Code von einem neuen Gerät aus anmeldest, siehst du diese Angaben jetzt selbst — als Vergleichshilfe auf dem Bestätigungsbildschirm und in deiner eigenen Geräte-Liste in Profil, wo du jede Sitzung einzeln abmelden kannst.',
        ),
      ).toBeTruthy()
    })

    it('names the geo-IP processing: country-only, self-hosted on our own EU infrastructure, never a third-party lookup, with the "Region unbekannt" fallback', async () => {
      await openAccountScreen()
      const geoIpCopy = screen.getByText(
        'Für die QR-Code-Anmeldung lösen wir die IP-Adresse des anfragenden Geräts zusätzlich auf Länderebene auf (z. B. "Deutschland"), nie genauer — das hilft dir, eine fremde Anfrage von deiner eigenen zu unterscheiden. Diese Auflösung läuft vollständig auf unseren eigenen EU-Servern, mit einer selbst gehosteten, regelmäßig aktualisierten Datenbank; deine IP-Adresse verlässt dafür nie unsere Infrastruktur und geht an keinen externen Anbieter. Ist die Datenbank veraltet oder eine Adresse nicht zuordenbar, zeigen wir ehrlich "Region unbekannt" statt zu raten.',
      )
      expect(geoIpCopy).toBeTruthy()
      expect(geoIpCopy.textContent).toMatch(/eigenen EU-Servern/)
      expect(geoIpCopy.textContent).toMatch(/keinen externen Anbieter/)
      expect(geoIpCopy.textContent).toMatch(/Region unbekannt/)
    })

    it('carries the geo-IP source attribution (CC BY 4.0, DB-IP)', async () => {
      renderDatenschutz()
      await screen.findByText('Anmeldungen & Geräte')
      expect(screen.getByText('Länderdaten: DB-IP.com, Lizenz CC BY 4.0.')).toBeTruthy()
    })

    it('renders both disclosures and the attribution in English too (ADR-0006)', async () => {
      renderDatenschutz({ lng: 'en' })
      await screen.findByText('Sign-ins & devices')
      expect(screen.getByText(/QR code, you now see that data yourself/)).toBeTruthy()
      expect(screen.getByText(/never leaves our infrastructure/)).toBeTruthy()
      expect(screen.getByText('Country data: DB-IP.com, licensed CC BY 4.0.')).toBeTruthy()
    })
  })
})
