// REQ-013 — Profil screen (steuereule#95). Tests-first: this file is written before
// ProfilScreen.tsx exists, mirroring the pattern OnboardingScreen.test.tsx already
// established for the same live GET/PUT /v1/profile contract.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { getProfileControllerGetProfileQueryKey } from '@steuereule/api-client'
import { createAppI18n } from '../i18n/app-i18n'
import { ProfilScreen } from './ProfilScreen'
import { server, EMPTY_PROFILE_RESPONSE } from '../test-msw-server'

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderProfil(opts: { lng?: 'de' | 'en'; queryClient?: QueryClient } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = opts.queryClient ?? makeTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <ProfilScreen />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function mockSavedProfile() {
  server.use(
    http.get('*/v1/profile', () =>
      HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '1234567890' }, { status: 200 }),
    ),
  )
}

describe('ProfilScreen', () => {
  it('shows an honest loading state while the profile is fetched', async () => {
    mockSavedProfile()
    renderProfil()
    expect(screen.getByLabelText('Dein Profil wird geladen …')).toBeTruthy()
    await screen.findByText('Anna Beispiel')
    expect(screen.queryByLabelText('Dein Profil wird geladen …')).toBeNull()
  })

  it('renders the view state with the real name + formatted Steuer-ID from GET /v1/profile', async () => {
    mockSavedProfile()
    renderProfil()
    await screen.findByText('Anna Beispiel')
    expect(screen.getByText('02 476 291 358')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy() // avatar initial
  })

  it('shows an honest empty state for a brand-new profile (never mock data)', async () => {
    renderProfil() // default MSW handler resolves the all-null profile
    await screen.findByText('Noch keine Angaben gespeichert.')
    expect(screen.queryByText('Anna Beispiel')).toBeNull()
  })

  it('reflects the freshest server profile even when the shared query cache already holds a stale, empty GET (steuereule#95 regression)', async () => {
    // Reproduces the real Login -> "als Gast umschauen" -> Onboarding -> Profil path: Onboarding
    // and Profil share one QueryClient/query key. By the time a user lands on Profil,
    // Onboarding's own earlier GET (resolved before the profile existed) is already cached —
    // exactly what a fresh, per-test QueryClient can never reproduce, which is why this bug
    // escaped every other test in this file.
    const queryClient = makeTestQueryClient()
    queryClient.setQueryData(getProfileControllerGetProfileQueryKey(), {
      data: EMPTY_PROFILE_RESPONSE,
      status: 200,
      headers: new Headers(),
    })

    // The real GET (post-Onboarding-submit) now resolves with the just-saved profile — this is
    // what Profil's mount-time background refetch receives.
    mockSavedProfile()

    renderProfil({ queryClient })

    // Must self-correct to the real data once the refetch resolves, not latch onto the stale
    // cached empty snapshot.
    await screen.findByText('Anna Beispiel')
    expect(screen.queryByText('Noch keine Angaben gespeichert.')).toBeNull()
  })

  it('shows a retryable error state when the profile fails to load, and recovers on retry', async () => {
    let attempt = 0
    server.use(
      http.get('*/v1/profile', () => {
        attempt += 1
        if (attempt === 1) return HttpResponse.error()
        return HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: null }, { status: 200 })
      }),
    )
    renderProfil()

    await screen.findByText('Das hat nicht geklappt.')
    expect(screen.getByText('Dein Profil konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()

    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Anna Beispiel')
  })

  it('opens the edit form prefilled with the current values, grouped like the typed input', async () => {
    mockSavedProfile()
    renderProfil()
    await screen.findByText('Anna Beispiel')

    fireEvent.click(screen.getByText('Bearbeiten'))
    expect(screen.getByDisplayValue('Anna')).toBeTruthy()
    expect(screen.getByDisplayValue('Beispiel')).toBeTruthy()
    expect(screen.getByDisplayValue('02 476 291 358')).toBeTruthy()
    expect(screen.getByDisplayValue('123/456/7890')).toBeTruthy()
  })

  it('keeps Speichern from saving until the name fields are filled and the Steuer-ID is valid', async () => {
    mockSavedProfile()
    let putCalls = 0
    server.use(http.put('*/v1/profile', () => { putCalls += 1; return HttpResponse.error() }))
    renderProfil()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    fireEvent.change(screen.getByDisplayValue('Anna'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Speichern'))
    expect(putCalls).toBe(0) // still invalid (empty first name): no request fired

    fireEvent.change(screen.getByDisplayValue(''), { target: { value: 'Anna' } })
    fireEvent.click(screen.getByText('Speichern'))
    await waitFor(() => expect(putCalls).toBe(1))
  })

  it('saves via PUT /v1/profile and returns to the view state reflecting the server response', async () => {
    mockSavedProfile()
    let receivedBody: unknown
    server.use(
      http.put('*/v1/profile', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ firstName: 'Anna', lastName: 'Neu', steuerId: '02476291358', steuernummer: '1234567890' }, { status: 200 })
      }),
    )
    renderProfil()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByText('Speichern'))

    await screen.findByText('Anna Neu')
    expect(receivedBody).toEqual({ firstName: 'Anna', lastName: 'Neu', steuerId: '02476291358', steuernummer: '1234567890' })
    expect(screen.getByText('Gespeichert.')).toBeTruthy()
  })

  it('shows a retryable inline error on validation failure, keeping the edit form open with the entered values', async () => {
    mockSavedProfile()
    server.use(
      http.put('*/v1/profile', () =>
        HttpResponse.json({ statusCode: 400, error: 'Bad Request', fields: [{ field: 'steuerId', message: 'invalid' }] }, { status: 400 }),
      ),
    )
    renderProfil()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByText('Speichern'))

    await screen.findByText('Deine Angaben konnten nicht gespeichert werden. Bitte prüf die Steuer-ID und versuch es noch mal.')
    expect(screen.getByDisplayValue('Neu')).toBeTruthy() // edits preserved, not discarded
  })

  it('shows a retryable inline error on a network failure while saving', async () => {
    mockSavedProfile()
    server.use(http.put('*/v1/profile', () => HttpResponse.error()))
    renderProfil()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.click(screen.getByText('Speichern'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
  })

  it('shows the Steuer-ID digit counter and confirmation while editing, matching the Onboarding field pattern', async () => {
    mockSavedProfile()
    renderProfil()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    expect(screen.getByText('11/11 Ziffern')).toBeTruthy()
    expect(screen.getByText('sitzt ✓')).toBeTruthy()
  })

  it('discards edits and returns to the original values on Abbrechen', async () => {
    mockSavedProfile()
    renderProfil()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Verworfen' } })
    fireEvent.click(screen.getByText('Abbrechen'))

    expect(screen.getByText('Anna Beispiel')).toBeTruthy()
    expect(screen.queryByText('Verworfen')).toBeNull()
  })

  describe('no client-side persistence of the Steuer-ID (ADR-0008)', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem')
    afterEach(() => setItemSpy.mockClear())

    it('never writes to localStorage across the full view -> edit -> save round-trip', async () => {
      mockSavedProfile()
      server.use(
        http.put('*/v1/profile', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ...body, steuernummer: '1234567890' }, { status: 200 })
        }),
      )
      renderProfil()
      await screen.findByText('Anna Beispiel')
      fireEvent.click(screen.getByText('Bearbeiten'))
      fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Neu' } })
      fireEvent.click(screen.getByText('Speichern'))
      await screen.findByText('Anna Neu')

      expect(setItemSpy).not.toHaveBeenCalled()
    })
  })

  it('renders correctly in English (ADR-0006, no gap on new strings)', async () => {
    mockSavedProfile()
    renderProfil({ lng: 'en' })
    await screen.findByText('Anna Beispiel')
    expect(screen.getByText('Edit')).toBeTruthy()

    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('exposes the edit button as an accessible button', async () => {
    mockSavedProfile()
    renderProfil()
    await screen.findByText('Anna Beispiel')
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeTruthy()
  })
})
