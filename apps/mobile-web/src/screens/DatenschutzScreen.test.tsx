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
import { createAppAuthClient } from '../auth/auth-client'
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

function renderDatenschutz(opts: { lng?: 'de' | 'en'; onZurueck?: () => void; onAccountDeleted?: () => void; queryClient?: QueryClient } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
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
      expect(screen.getByText(/Nachweise gegenüber dem Finanzamt|Nachweise\./) ?? screen.getByText(/Exportiere sie dir vorher/)).toBeTruthy()

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
})
