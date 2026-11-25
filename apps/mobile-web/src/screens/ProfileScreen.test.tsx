// REQ-013 — Profil screen (steuereule#95). Tests-first: this file is written before
// ProfilScreen.tsx exists, mirroring the pattern OnboardingScreen.test.tsx already
// established for the same live GET/PUT /v1/profile contract.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Platform } from 'react-native'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider, isHapticsEnabled, setHapticsEnabled } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { getProfileControllerGetProfileQueryKey } from '@steuereule/api-client'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { ProfileScreen } from './ProfileScreen'
import { server, EMPTY_PROFILE_RESPONSE } from '../test-msw-server'
import { stubStorageSetItem, assertNoStorageWrites } from '../test-storage-guard'
import { expectFailsClosed, failEveryRequest } from '../test-every-query-fails'

const BASE_URL = 'http://localhost:3000'

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderProfile(
  opts: {
    lng?: 'de' | 'en'
    queryClient?: QueryClient
    onOpenPrivacy?: () => void
    onOpenSecurity?: () => void
    onOpenMasterData?: () => void
    onSignedOut?: () => void
  } = {},
) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = opts.queryClient ?? makeTestQueryClient()
  const authClient = createAppAuthClient(BASE_URL)
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={authClient}>
            <ProfileScreen
              onOpenPrivacy={opts.onOpenPrivacy ?? (() => {})}
              onOpenSecurity={opts.onOpenSecurity ?? (() => {})}
              {...(opts.onOpenMasterData ? { onOpenMasterData: opts.onOpenMasterData } : {})}
              onSignedOut={opts.onSignedOut ?? (() => {})}
            />
          </AuthClientProvider>
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
    renderProfile()
    expect(screen.getByLabelText('Dein Profil wird geladen …')).toBeTruthy()
    await screen.findByText('Anna Beispiel')
    expect(screen.queryByLabelText('Dein Profil wird geladen …')).toBeNull()
  })

  it('renders the view state with the real name + formatted Steuer-ID from GET /v1/profile', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    expect(screen.getByText('02 476 291 358')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy() // avatar initial
  })

  it('reaches the legal pages and shows the beta notice (WEB-7, WEB-20)', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    expect(screen.getByTestId('beta-hinweis')).toBeTruthy()
    for (const page of ['impressum', 'datenschutz', 'agb', 'hinweise']) {
      expect(screen.getByTestId(`rechtliches-link-${page}`).getAttribute('href')).toBe(`/rechtliches/${page}`)
    }
  })

  it('shows an honest empty state for a brand-new profile (never mock data)', async () => {
    renderProfile() // default MSW handler resolves the all-null profile
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

    renderProfile({ queryClient })

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
    renderProfile()

    await screen.findByText('Das konnte nicht geladen werden.')
    expect(screen.getByText('Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.')).toBeTruthy()

    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Anna Beispiel')
  })

  it('opens the edit form prefilled with the current values, grouped like the typed input', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')

    fireEvent.click(screen.getByText('Bearbeiten'))
    expect(screen.getByDisplayValue('Anna')).toBeTruthy()
    expect(screen.getByDisplayValue('Beispiel')).toBeTruthy()
    expect(screen.getByDisplayValue('02 476 291 358')).toBeTruthy()
    expect(screen.getByDisplayValue('12/345/67890')).toBeTruthy()
  })

  it('keeps Speichern from saving until the name fields are filled — the Steuer-ID is optional (ADR-0045)', async () => {
    mockSavedProfile()
    let putCalls = 0
    server.use(http.put('*/v1/profile', () => { putCalls += 1; return HttpResponse.error() }))
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    fireEvent.change(screen.getByDisplayValue('Anna'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Speichern'))
    expect(putCalls).toBe(0) // still invalid (empty first name): no request fired

    fireEvent.change(screen.getByDisplayValue(''), { target: { value: 'Anna' } })
    fireEvent.click(screen.getByText('Speichern'))
    await waitFor(() => expect(putCalls).toBe(1))
  })

  it('saves a profile WITHOUT a Steuer-ID — ADR-0045: null is "not given yet", never a dead end', async () => {
    server.use(
      http.get('*/v1/profile', () =>
        HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: null, steuernummer: null }, { status: 200 }),
      ),
    )
    let receivedBody: unknown
    server.use(
      http.put('*/v1/profile', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ firstName: 'Anna', lastName: 'Neu', steuerId: null, steuernummer: null }, { status: 200 })
      }),
    )
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByText('Speichern'))

    await screen.findByText('Anna Neu')
    expect(receivedBody).toEqual({ firstName: 'Anna', lastName: 'Neu' })
    expect(screen.getByText('Gespeichert.')).toBeTruthy()
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
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByText('Speichern'))

    await screen.findByText('Anna Neu')
    // WEB-28: the identifiers were not touched, so they are not sent — the server keeps what is absent.
    expect(receivedBody).toEqual({ firstName: 'Anna', lastName: 'Neu' })
    expect(screen.getByText('Gespeichert.')).toBeTruthy()
  })

  it('shows a retryable inline error on validation failure, keeping the edit form open with the entered values', async () => {
    mockSavedProfile()
    server.use(
      http.put('*/v1/profile', () =>
        HttpResponse.json({ statusCode: 400, error: 'Bad Request', fields: [{ field: 'steuerId', message: 'invalid' }] }, { status: 400 }),
      ),
    )
    renderProfile()
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
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.click(screen.getByText('Speichern'))

    expect(await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
  })

  it('shows the Steuer-ID digit counter and confirmation while editing, matching the Onboarding field pattern', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))

    expect(screen.getByText('11/11 Ziffern')).toBeTruthy()
    expect(screen.getByText('sitzt ✓')).toBeTruthy()
  })

  it('discards edits and returns to the original values on Abbrechen', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Verworfen' } })
    fireEvent.click(screen.getByText('Abbrechen'))

    expect(screen.getByText('Anna Beispiel')).toBeTruthy()
    expect(screen.queryByText('Verworfen')).toBeNull()
  })

  describe('no client-side persistence of the Steuer-ID (ADR-0008)', () => {
    // NOT `vi.spyOn(window.localStorage, 'setItem')` — see test-storage-guard.ts's doc comment
    // and #323: jsdom's `Storage` Proxy silently defeats a spy installed that way, so the old
    // assertion here passed regardless of what the screen wrote. `sessionStorage` is asserted
    // alongside `localStorage` because both are genuinely reachable in this web build (jsdom
    // exposes both as regular globals). `AsyncStorage` is not asserted: this app has no
    // `@react-native-async-storage/async-storage` dependency at all, so stubbing it would be a
    // vacuous control on a store nothing here can reach — the exact bug this ticket fixes, one
    // level up.
    let localSetItem: ReturnType<typeof vi.fn>
    let sessionSetItem: ReturnType<typeof vi.fn>
    beforeEach(() => {
      localSetItem = stubStorageSetItem('localStorage')
      sessionSetItem = stubStorageSetItem('sessionStorage')
    })
    afterEach(() => vi.unstubAllGlobals())

    it('never writes to localStorage or sessionStorage across the full view -> edit -> save round-trip', async () => {
      mockSavedProfile()
      server.use(
        http.put('*/v1/profile', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ...body, steuernummer: '1234567890' }, { status: 200 })
        }),
      )
      renderProfile()
      await screen.findByText('Anna Beispiel')
      fireEvent.click(screen.getByText('Bearbeiten'))
      fireEvent.change(screen.getByDisplayValue('Beispiel'), { target: { value: 'Neu' } })
      fireEvent.click(screen.getByText('Speichern'))
      expect(await screen.findByText('Anna Neu')).toBeTruthy()

      assertNoStorageWrites('localStorage', localSetItem)
      assertNoStorageWrites('sessionStorage', sessionSetItem)
    })
  })

  it('renders correctly in English (ADR-0006, no gap on new strings)', async () => {
    mockSavedProfile()
    renderProfile({ lng: 'en' })
    await screen.findByText('Anna Beispiel')
    expect(screen.getByText('Edit')).toBeTruthy()

    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('exposes the edit button as an accessible button', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeTruthy()
  })

  describe('the "Deine Daten" row (REQ-011, steuereule#152)', () => {
    it('reaches the Datenschutz screen via onOpenDatenschutz — a real navigation, not a dead row', async () => {
      mockSavedProfile()
      const onOpenPrivacy = vi.fn()
      renderProfile({ onOpenPrivacy })
      await screen.findByText('Anna Beispiel')

      fireEvent.click(screen.getByText('So schützen wir deine Daten (DSGVO)'))

      expect(onOpenPrivacy).toHaveBeenCalledOnce()
    })

    it('renders the row in English too (ADR-0006)', async () => {
      mockSavedProfile()
      renderProfile({ lng: 'en' })
      await screen.findByText('Anna Beispiel')
      expect(screen.getByText('How we protect your data (GDPR)')).toBeTruthy()
    })
  })
})

describe('ProfilScreen — Erklärungs-Stammdaten entry (ADR-0050)', () => {
  it('opens the Stammdaten drill-down from its own row', async () => {
    mockSavedProfile()
    const onOpenMasterData = vi.fn()
    renderProfile({ onOpenMasterData })
    fireEvent.click(await screen.findByText('Angaben für die Steuererklärung'))
    expect(onOpenMasterData).toHaveBeenCalled()
  })
})

describe('ProfilScreen — Darstellung (Slice 6)', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('renders System / Immer hell / Immer dunkel and persists only on change', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')

    expect(screen.getByText('Darstellung')).toBeTruthy()
    const systemOpt = screen.getByTestId('profil-darstellung-system')
    const hellOpt = screen.getByTestId('profil-darstellung-hell')
    const dunkelOpt = screen.getByTestId('profil-darstellung-dunkel')
    expect(systemOpt.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('steuereule.appearance')).toBeNull()

    fireEvent.click(dunkelOpt)
    expect(localStorage.getItem('steuereule.appearance')).toBe('dark')
    expect(dunkelOpt.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(hellOpt)
    expect(localStorage.getItem('steuereule.appearance')).toBe('light')
    expect(hellOpt.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders Darstellung options in English', async () => {
    mockSavedProfile()
    renderProfile({ lng: 'en' })
    await screen.findByText('Anna Beispiel')
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    expect(screen.getByText('Always light')).toBeTruthy()
    expect(screen.getByText('Always dark')).toBeTruthy()
  })
})

describe('ProfilScreen — Haptik (Slice 7)', () => {
  const originalOs = Platform.OS

  afterEach(() => {
    ;(Platform as { OS: typeof Platform.OS }).OS = originalOs
    localStorage.clear()
    setHapticsEnabled(true)
  })

  it('hides profil-haptik on web', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'web'
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    expect(screen.queryByTestId('profil-haptik')).toBeNull()
  })

  it('shows profil-haptik on native and persists changes only when toggled', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')

    expect(screen.getByText('Haptisches Feedback')).toBeTruthy()
    const switchEl = screen.getByTestId('profil-haptik')
    expect(localStorage.getItem('steuereule.haptics')).toBeNull()

    const checkbox = switchEl.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)

    expect(localStorage.getItem('steuereule.haptics')).toBe('false')
    expect(isHapticsEnabled()).toBe(false)
    expect(checkbox.checked).toBe(false)
  })

  it('renders haptics label in English on native', async () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    mockSavedProfile()
    renderProfile({ lng: 'en' })
    await screen.findByText('Anna Beispiel')
    expect(screen.getByText('Haptic feedback')).toBeTruthy()
  })
})

describe('ProfilScreen — failures never reach a save (WEB-28, NR-01, NR-22, NR-18)', () => {
  const SIGNED_IN = {
    user: { id: 'u1', email: 'anna@beispiel.de', emailVerified: true, name: 'Anna' },
    session: { id: 's1', token: 't1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }

  it.each([500, 429])('a profile load answered %i shows a failure state, not an empty profile', async (status) => {
    server.use(http.get('*/v1/profile', () => HttpResponse.json({ statusCode: status }, { status })))
    renderProfile()
    expect(await screen.findByTestId('fehler-zustand')).toBeTruthy()
    expect(screen.queryByText('Noch keine Angaben gespeichert.')).toBeNull()
    expect(screen.queryByText('Bearbeiten')).toBeNull()
  })

  it('fails closed: every request answering 500 shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderProfile()
    await expectFailsClosed(failing)
  })

  it('fails closed with the profile loaded: the assistants and devices that did not load send no write either', async () => {
    const failing = failEveryRequest()
    mockSavedProfile()
    server.use(http.get('*/api/auth/get-session', () => HttpResponse.json(SIGNED_IN)))
    renderProfile()
    await screen.findByText('Anna Beispiel')
    expect(await screen.findByTestId('assistenten-ladefehler')).toBeTruthy()
    await expectFailsClosed(failing)
  })

  it('clearing a stored Steuer-ID sends null for it — the only way the server clears it', async () => {
    mockSavedProfile()
    let body: unknown
    server.use(
      http.put('*/v1/profile', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ firstName: 'Anna', lastName: 'Beispiel', steuerId: null, steuernummer: '1234567890' })
      }),
    )
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.change(screen.getByDisplayValue('02 476 291 358'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Speichern'))
    await screen.findByText('Gespeichert.')
    expect(body).toEqual({ firstName: 'Anna', lastName: 'Beispiel', steuerId: null })
  })

  it.each([
    [500, 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.'],
    [429, 'Gerade kommen zu viele Anfragen. Versuch es in ein paar Minuten noch mal.'],
  ])('a save answered %i says what happened, not "prüf die Steuer-ID"', async (status, message) => {
    mockSavedProfile()
    server.use(http.put('*/v1/profile', () => HttpResponse.json({ statusCode: status }, { status })))
    renderProfile()
    await screen.findByText('Anna Beispiel')
    fireEvent.click(screen.getByText('Bearbeiten'))
    fireEvent.click(screen.getByText('Speichern'))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByText(/prüf die Steuer-ID/)).toBeNull()
  })

  it('a guest sees that assistants and devices need an account, not an empty list', async () => {
    mockSavedProfile()
    renderProfile()
    await screen.findByText('Anna Beispiel')
    expect(await screen.findByTestId('profil-konto-noetig')).toBeTruthy()
    expect(screen.queryByText('Keine Assistenten verbunden.')).toBeNull()
  })
})
