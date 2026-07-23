// REQ-012 — ATDD acceptance test (Salih, QA), steuereule#53.
//
// Given–When–Then, straight from the issue's acceptance criterion:
//
//   Given a caller (guest or account) opens the Onboarding flow, when the screen mounts,
//   then it fetches the caller's profile via a typed GET /v1/profile TanStack Query hook
//   and prefills the steps from a real (possibly empty-default) server response, showing
//   an honest loading state while in flight and an honest error state on failure (with
//   retry), never mock data; and when the user completes the flow, then the client PUTs
//   the entered fields to /v1/profile, the summary screen reflects the saved values, and
//   at no point is the Steuer-ID (or any profile field) written to
//   localStorage/AsyncStorage/any client-side store; and all new/changed copy renders
//   correctly in both German (default) and English (ADR-0006).
//
// Honest substitute at this stage (see the QA report on #53): this drives the real
// OnboardingScreen component tree against MSW handlers generated straight from
// @steuereule/api-client (orval, itself generated from apps/api/openapi.json) — the
// contract is real, pinned, and never hand-rolled. It is NOT a browser click-through
// against a live seeded compose stack: this sandbox has neither Docker/Postgres nor a
// working Expo web dev server, and a live run additionally needs CORS (#57, owner Robin),
// which isn't in this diff. That live run is still open — tracked as follow-up, not
// silently declared "done" here.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { OnboardingScreen } from '../OnboardingScreen'
import { server } from '../../test-msw-server'

function renderOnboarding(opts: { lng?: 'de' | 'en'; onDone?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <OnboardingScreen onDone={opts.onDone ?? (() => {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function fillNameStep(weiterLabel = 'Weiter') {
  await screen.findByPlaceholderText('Kim')
  fireEvent.change(screen.getByPlaceholderText('Kim'), { target: { value: 'Kim' } })
  fireEvent.change(screen.getByPlaceholderText('Yilmaz'), { target: { value: 'Yilmaz' } })
  fireEvent.click(screen.getByText(weiterLabel))
}

function fillSteuerId(digits: string) {
  fireEvent.change(screen.getByPlaceholderText('12 345 678 901'), { target: { value: digits } })
}

async function completeFlowToSummary() {
  await fillNameStep()
  fillSteuerId('12345678901')
  fireEvent.click(screen.getByText('Weiter'))
  fireEvent.click(screen.getByText('Weiter')) // skip Steuernummer
  await screen.findByText('Deine Maske')
}

describe('REQ-012 — Onboarding vertical-join (ATDD acceptance, steuereule#53)', () => {
  it('REQ-012: Given a brand-new guest, when Onboarding mounts, then GET /v1/profile prefills the honest all-null empty state (never mock data)', async () => {
    server.use(
      http.get('*/v1/profile', () =>
        HttpResponse.json({ firstName: null, lastName: null, steuerId: null, steuernummer: null }, { status: 200 }),
      ),
    )
    renderOnboarding()

    // Honest loading state while the GET is in flight.
    expect(screen.getByLabelText('Deine Angaben werden geladen …')).toBeTruthy()

    await screen.findByText('Vorname')
    expect(screen.queryByLabelText('Deine Angaben werden geladen …')).toBeNull()
    expect(screen.getByPlaceholderText('Kim')).toHaveProperty('value', '')
    expect(screen.getByPlaceholderText('Yilmaz')).toHaveProperty('value', '')
  })

  it('REQ-012: Given a returning caller with a previously saved profile, when Onboarding mounts, then GET /v1/profile prefills the real saved values', async () => {
    server.use(
      http.get('*/v1/profile', () =>
        HttpResponse.json(
          { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '1338150815' },
          { status: 200 },
        ),
      ),
    )
    renderOnboarding()

    expect(await screen.findByDisplayValue('Anna')).toBeTruthy()
    expect(screen.getByDisplayValue('Beispiel')).toBeTruthy()

    fireEvent.click(screen.getByText('Weiter'))
    // NOTE (finding, non-blocking — flagged to Suhay for a follow-up ticket): the prefilled
    // Steuer-ID/Steuernummer render as the server's raw digit string, not run through the
    // same formatSteuerId/formatSteuerNr grouping the rest of the flow uses when the user
    // types. The value itself is correct (round-trips faithfully); only the on-load display
    // grouping is inconsistent with the typed-input experience. Asserting the real behaviour
    // here rather than the grouped display it doesn't (yet) have.
    expect(screen.getByDisplayValue('02476291358')).toBeTruthy()

    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByDisplayValue('1338150815')).toBeTruthy()

    fireEvent.click(screen.getByText('Weiter'))
    await screen.findByText('Deine Maske')
    expect(screen.getByText('Anna')).toBeTruthy()
    expect(screen.getByText('Beispiel')).toBeTruthy()
  })

  it('REQ-012: Given the profile fetch fails, when Onboarding mounts, then it shows an honest retryable error state (never mock data, never a silent empty screen)', async () => {
    server.use(http.get('*/v1/profile', () => HttpResponse.error()))
    renderOnboarding()

    await screen.findByText('Das hat nicht geklappt.')
    expect(
      screen.getByText('Deine Angaben konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.'),
    ).toBeTruthy()
    // Never falls through to rendering the form on mock/default data instead.
    expect(screen.queryByPlaceholderText('Kim')).toBeNull()
  })

  it('REQ-012: When the user completes the flow, then PUT /v1/profile fires with exactly the entered fields, and the flow advances only on a genuine 200', async () => {
    let putCalls = 0
    let receivedBody: unknown
    server.use(
      http.put('*/v1/profile', async ({ request }) => {
        putCalls += 1
        receivedBody = await request.json()
        return HttpResponse.json({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901', steuernummer: null }, { status: 200 })
      }),
    )
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    await completeFlowToSummary()

    // Summary reflects the entered/round-tripped values before the terminal PUT — this is
    // the "saved" state the caller is about to confirm, not a stale/mocked placeholder.
    expect(screen.getByText('Kim')).toBeTruthy()
    expect(screen.getByText('Yilmaz')).toBeTruthy()
    expect(screen.getByText('12 345 678 901')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(putCalls).toBe(1)
    expect(receivedBody).toEqual({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901' })
  })

  it('REQ-012: Given the server rejects the save with a 400, when the user submits, then the validation error is surfaced inline and the flow does NOT advance', async () => {
    server.use(
      http.put('*/v1/profile', () =>
        HttpResponse.json({ statusCode: 400, error: 'Bad Request', fields: [{ field: 'steuerId', message: 'invalid' }] }, { status: 400 }),
      ),
    )
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    await completeFlowToSummary()

    fireEvent.click(screen.getByText('Weiter'))

    await screen.findByText('Deine Angaben konnten nicht gespeichert werden. Bitte prüf die Steuer-ID und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
    // Still on the summary screen — no silent advance past a rejected save.
    expect(screen.getByText('Deine Maske')).toBeTruthy()
  })

  it('REQ-012: Given a network failure while saving, when the user submits, then the error is surfaced inline and the flow does NOT advance', async () => {
    server.use(http.put('*/v1/profile', () => HttpResponse.error()))
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    await completeFlowToSummary()

    fireEvent.click(screen.getByText('Weiter'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText('Deine Maske')).toBeTruthy()
  })

  describe('REQ-012: no client-side persistence of the Steuer-ID (ADR-0008)', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem')

    afterEach(() => setItemSpy.mockClear())

    it('never writes to localStorage at any point across the full prefill -> edit -> save round-trip', async () => {
      server.use(
        http.get('*/v1/profile', () =>
          HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: null }, { status: 200 }),
        ),
        http.put('*/v1/profile', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ...body, steuernummer: null }, { status: 200 })
        }),
      )
      const onDone = vi.fn()
      renderOnboarding({ onDone })

      await screen.findByDisplayValue('Anna')
      fireEvent.click(screen.getByText('Weiter'))
      expect(screen.getByDisplayValue('02476291358')).toBeTruthy()
      fireEvent.click(screen.getByText('Weiter'))
      fireEvent.click(screen.getByText('Weiter'))
      await screen.findByText('Deine Maske')
      fireEvent.click(screen.getByText('Weiter'))

      await waitFor(() => expect(onDone).toHaveBeenCalledOnce())

      expect(setItemSpy).not.toHaveBeenCalled()
    })
  })

  it('REQ-012: renders the summary and inline-error copy correctly in English too (ADR-0006, no gap on new strings)', async () => {
    server.use(http.put('*/v1/profile', () => HttpResponse.error()))
    const onDone = vi.fn()
    renderOnboarding({ lng: 'en', onDone })
    await screen.findByText('Just like on your ID — so the form matches exactly.')

    await fillNameStep('Continue')
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.click(screen.getByText('Continue'))
    await screen.findByText('Done.')

    fireEvent.click(screen.getByText('Continue'))

    await screen.findByText("That didn't work just now. Check your connection and try again.")
    expect(onDone).not.toHaveBeenCalled()
  })
})
