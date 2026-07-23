import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../i18n/app-i18n'
import { OnboardingScreen } from './OnboardingScreen'
import { server } from '../test-msw-server'

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

async function fillNameStep() {
  await screen.findByPlaceholderText('Kim')
  fireEvent.change(screen.getByPlaceholderText('Kim'), { target: { value: 'Kim' } })
  fireEvent.change(screen.getByPlaceholderText('Yilmaz'), { target: { value: 'Yilmaz' } })
  fireEvent.click(screen.getByText('Weiter'))
}

function fillSteuerId(digits: string) {
  fireEvent.change(screen.getByPlaceholderText('12 345 678 901'), { target: { value: digits } })
}

describe('OnboardingScreen', () => {
  it('shows a real loading state while the saved profile is fetched, then step 1 prefilled empty', async () => {
    renderOnboarding()
    expect(screen.getByLabelText('Deine Angaben werden geladen …')).toBeTruthy()

    await screen.findByText('Vorname')
    expect(screen.queryByLabelText('Deine Angaben werden geladen …')).toBeNull()
  })

  it('renders step 1 in German by default', async () => {
    renderOnboarding()
    await screen.findByText('Genau wie im Ausweis — damit die Maske exakt stimmt.')
    expect(screen.getByText('Vorname')).toBeTruthy()
    expect(screen.getByText('Nachname')).toBeTruthy()
  })

  it('switches to English when the locale changes (ADR-0006)', async () => {
    renderOnboarding({ lng: 'en' })
    await screen.findByText('Just like on your ID — so the form matches exactly.')
    expect(screen.getByText('First name')).toBeTruthy()
  })

  it('prefills step 1 from a previously saved profile (GET /v1/profile)', async () => {
    server.use(
      http.get('*/v1/profile', () =>
        HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: null }, { status: 200 }),
      ),
    )
    renderOnboarding()

    expect(await screen.findByDisplayValue('Anna')).toBeTruthy()
    expect(screen.getByDisplayValue('Beispiel')).toBeTruthy()
  })

  it('prefills the Steuer-ID grouped, matching the typed-input format (steuereule#60)', async () => {
    server.use(
      http.get('*/v1/profile', () =>
        HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '1234567890' }, { status: 200 }),
      ),
    )
    renderOnboarding()

    await screen.findByDisplayValue('Anna')
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByDisplayValue('02 476 291 358')).toBeTruthy()
    expect(screen.queryByDisplayValue('02476291358')).toBeNull()

    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByDisplayValue('123/456/7890')).toBeTruthy()
  })

  it('shows a retryable error screen when the profile fails to load, and recovers on retry', async () => {
    let attempt = 0
    server.use(
      http.get('*/v1/profile', () => {
        attempt += 1
        if (attempt === 1) return HttpResponse.error()
        return HttpResponse.json({ firstName: null, lastName: null, steuerId: null, steuernummer: null }, { status: 200 })
      }),
    )
    renderOnboarding()

    await screen.findByText('Das hat nicht geklappt.')
    expect(screen.getByText('Deine Angaben konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()

    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Vorname')
  })

  it('keeps the step-1 CTA disabled until both name fields are filled', async () => {
    renderOnboarding()
    await screen.findByText('Vorname')
    fireEvent.click(screen.getByText('Weiter'))
    // Still on step 1: the step-2 help text must not have appeared.
    expect(screen.queryByText('11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('Kim'), { target: { value: 'Kim' } })
    fireEvent.change(screen.getByPlaceholderText('Yilmaz'), { target: { value: 'Yilmaz' } })
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.')).toBeTruthy()
  })

  it('formats the Steuer-ID live, shows the running counter, and confirms at exactly 11 digits', async () => {
    renderOnboarding()
    await fillNameStep()

    fillSteuerId('1234567890')
    expect(screen.getByText('10/11 Ziffern')).toBeTruthy()
    expect(screen.queryByText('sitzt ✓')).toBeNull()
    fireEvent.click(screen.getByText('Weiter'))
    // CTA stayed disabled: still on step 2.
    expect(screen.queryByText('Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.')).toBeNull()

    fillSteuerId('12345678901')
    expect(screen.getByDisplayValue('12 345 678 901')).toBeTruthy()
    expect(screen.getByText('11/11 Ziffern')).toBeTruthy()
    expect(screen.getByText('sitzt ✓')).toBeTruthy()
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.')).toBeTruthy()
  })

  it('lets the Steuernummer step be skipped via the "later" chip without entering digits', async () => {
    renderOnboarding()
    await fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))

    fireEvent.click(screen.getByText('Hab ich nicht zur Hand — später'))
    expect(screen.getByText('Deine Maske')).toBeTruthy()
  })

  it('reaches the summary with all four values, showing "später" for a skipped Steuernummer', async () => {
    renderOnboarding()
    await fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    // Steuernummer is never required: tap Weiter with the field left empty.
    fireEvent.click(screen.getByText('Weiter'))

    expect(screen.getByText('Deine Maske')).toBeTruthy()
    expect(screen.getByText('Kim')).toBeTruthy()
    expect(screen.getByText('Yilmaz')).toBeTruthy()
    expect(screen.getByText('12 345 678 901')).toBeTruthy()
    expect(screen.getByText('später')).toBeTruthy()
  })

  it('saves via PUT /v1/profile and calls onDone once, only after the save succeeds', async () => {
    let putCalls = 0
    server.use(
      http.put('*/v1/profile', async ({ request }) => {
        putCalls += 1
        const body = (await request.json()) as Record<string, unknown>
        expect(body).toEqual({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901' })
        return HttpResponse.json({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901', steuernummer: null }, { status: 200 })
      }),
    )
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    await fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('Deine Maske')).toBeTruthy()

    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(putCalls).toBe(1)
  })

  it('shows a retryable inline error on the summary when saving fails validation server-side, without advancing', async () => {
    server.use(
      http.put('*/v1/profile', () =>
        HttpResponse.json({ statusCode: 400, error: 'Bad Request', fields: [{ field: 'steuerId', message: 'invalid' }] }, { status: 400 }),
      ),
    )
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    await fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))

    fireEvent.click(screen.getByText('Weiter'))

    await screen.findByText('Deine Angaben konnten nicht gespeichert werden. Bitte prüf die Steuer-ID und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows a retryable inline error on the summary on a network failure while saving', async () => {
    server.use(http.put('*/v1/profile', () => HttpResponse.error()))
    const onDone = vi.fn()
    renderOnboarding({ onDone })
    await fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))

    fireEvent.click(screen.getByText('Weiter'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('returns to step 1 from "Angaben ändern" and preserves entered values', async () => {
    renderOnboarding()
    await fillNameStep()
    fillSteuerId('12345678901')
    fireEvent.click(screen.getByText('Weiter'))
    fireEvent.click(screen.getByText('Weiter'))
    expect(screen.getByText('Deine Maske')).toBeTruthy()

    fireEvent.click(screen.getByText('Angaben ändern'))
    expect(screen.getByText('Vorname')).toBeTruthy()
    expect(screen.getByPlaceholderText('Kim')).toHaveProperty('value', 'Kim')
  })

  it('lets the back arrow decrement the step while preserving entered values', async () => {
    renderOnboarding()
    await fillNameStep()
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(screen.getByPlaceholderText('Kim')).toHaveProperty('value', 'Kim')
    expect(screen.getByPlaceholderText('Yilmaz')).toHaveProperty('value', 'Yilmaz')
  })

  it('exposes the back button label and progressbar semantics on the step indicator', async () => {
    renderOnboarding()
    await fillNameStep()
    const back = screen.getByLabelText('Zurück')
    expect(back.getAttribute('role')).toBe('button')

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('3')
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
  })
})
