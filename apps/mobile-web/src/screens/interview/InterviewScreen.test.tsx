// #318 task 2 — InterviewScreen wired to the real endpoints via the generated client. Every
// branch assertion below still names the *identity* of the next screen (which question or
// gate), never merely that "a next screen" appeared — the trap #318 names by name: a test that
// only checks something rendered stays green even if the branching is completely wrong. New in
// this file (task 2, over task 1b's local-only suite): the GET/POST wiring itself — loading,
// load-error+retry, re-entry seeding from a stored answers set, the 400/409 "server disagrees
// with the local graph" resync path, a genuine network failure on write, and the Cockpit
// query-invalidation side effect the GWT's closing clause depends on.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { getCockpitControllerGetCockpitSummaryQueryKey, type InterviewStateDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { InterviewScreen } from './InterviewScreen'
import { server, EMPTY_INTERVIEW_STATE } from '../../test-msw-server'

const TAX_YEAR = 2026
const GET_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview`
const POST_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderInterview(opts: { lng?: 'de' | 'en'; onDone?: () => void; queryClient?: QueryClient } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = opts.queryClient ?? makeTestQueryClient()
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <InterviewScreen onDone={opts.onDone ?? (() => {})} taxYear={TAX_YEAR} />
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    ),
  }
}

function mockInterviewState(state: InterviewStateDto) {
  server.use(http.get(GET_URL, () => HttpResponse.json(state, { status: 200 })))
}

/** Every test below starts from the honest "nothing answered yet" re-entry state unless it
 *  overrides — matches `test-msw-server.ts`'s own default, spelled out here for clarity. */
async function renderOnJobQuestion(opts: Parameters<typeof renderInterview>[0] = {}) {
  const result = renderInterview(opts)
  await onJobQuestion()
  return result
}

// Screen-identity helpers — each asserts on that screen's own help/body copy, a single,
// un-split text node (the question headings interpolate an emphasised mark word via nested
// `<Text>`, so their *concatenated* string is what the DOM exposes — help text avoids that
// entirely and names the screen just as unambiguously). Each names exactly one screen, so a
// mis-wired branch fails loudly instead of a generic "something is on screen" assertion passing
// by accident. `find*` (not `get*`): every screen mount now waits on the GET.
const onJobQuestion = () => screen.findByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')
const onAuslandQuestion = () => screen.findByText('Grenzgänger haben Sonderregeln — in die Schweiz können wir sie komplett, inklusive 60-Tage-Tracking.')
const onKinderQuestion = () => screen.findByText('Kindergeld, Freibeträge, Betreuungskosten — die Günstigerprüfung Kindergeld vs. Freibetrag läuft automatisch.')
const onGewerbeGate = () => screen.findByText('Ehrlich: dafür sind wir noch nicht gut genug.')
const onChOnlyGate = () => screen.findByText('Ehrlich: andere Länder können wir noch nicht.')

describe('InterviewScreen', () => {
  it('shows an honest loading state while the interview state is fetched', async () => {
    renderInterview()
    expect(screen.getByLabelText('Deine Antworten werden geladen …')).toBeTruthy()
    await onJobQuestion()
    expect(screen.queryByLabelText('Deine Antworten werden geladen …')).toBeNull()
  })

  it('shows a retryable error state when the interview state fails to load, and recovers on retry', async () => {
    let attempt = 0
    server.use(
      http.get(GET_URL, () => {
        attempt += 1
        if (attempt === 1) return HttpResponse.error()
        return HttpResponse.json(EMPTY_INTERVIEW_STATE, { status: 200 })
      }),
    )
    renderInterview()

    await screen.findByText('Das hat nicht geklappt.')
    expect(screen.getByText('Deine Antworten konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()

    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await onJobQuestion()
  })

  it('treats a non-200 GET response as an honest error, not a silent fallthrough', async () => {
    server.use(http.get(GET_URL, () => HttpResponse.json(null, { status: 401 })))
    renderInterview()
    await screen.findByText('Das hat nicht geklappt.')
  })

  it('re-entry: opens on the step the stored answers actually resume at, not always the job question', async () => {
    mockInterviewState({ answers: { job: 'Angestellt', ausland: 'Nein' }, nextStep: { kind: 'question', id: 'kinder' }, openItems: 1 })
    renderInterview()
    await onKinderQuestion()
    expect(screen.queryByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')).toBeNull()
  })

  it('opens on the job question — heading, help text, all four options, step 1/3', async () => {
    await renderOnJobQuestion()
    expect(screen.getByText('Angestellt')).toBeTruthy()
    expect(screen.getByText('Selbstständig')).toBeTruthy()
    expect(screen.getByText('Beides')).toBeTruthy()
    expect(screen.getByText('Rente')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
  })

  it('exposes progressbar semantics on the job question, correct for step 1 of 3', async () => {
    await renderOnJobQuestion()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('3')
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
  })

  it('shows no back button on the first (job) question', async () => {
    await renderOnJobQuestion()
    expect(screen.queryByLabelText('Zurück')).toBeNull()
  })

  it('posts the answer via POST .../interview/antworten with the exact questionId/value body', async () => {
    let receivedBody: unknown
    server.use(
      http.post(POST_URL, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 }, { status: 200 })
      }),
    )
    await renderOnJobQuestion()
    fireEvent.click(screen.getByText('Angestellt'))
    await onAuslandQuestion()

    expect(receivedBody).toEqual({ questionId: 'job', value: 'Angestellt' })
  })

  it('advances to the next screen immediately, without waiting on the POST to resolve (ADR-016 budget)', async () => {
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post(POST_URL, async () => {
        await pending
        return HttpResponse.json({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 }, { status: 200 })
      }),
    )
    await renderOnJobQuestion()
    fireEvent.click(screen.getByText('Angestellt'))

    // The next question is already on screen while the write is still in flight.
    await onAuslandQuestion()
    release?.()
  })

  it('invalidates the Cockpit query on a successful write — the GWT clause: the next Cockpit render must fetch fresh', async () => {
    const { queryClient } = await renderOnJobQuestion()
    const cockpitKey = getCockpitControllerGetCockpitSummaryQueryKey(TAX_YEAR)
    // Seed a cache entry so there is something to invalidate (mirrors a real app where Cockpit
    // was already mounted before the user opened the Minimal-Gate).
    queryClient.setQueryData(cockpitKey, { data: { taxYear: TAX_YEAR, estimate: { from: 0, to: 0 }, openItems: 3 }, status: 200, headers: new Headers() })
    expect(queryClient.getQueryState(cockpitKey)?.isInvalidated).toBe(false)

    fireEvent.click(screen.getByText('Angestellt'))
    await onAuslandQuestion()

    await waitFor(() => expect(queryClient.getQueryState(cockpitKey)?.isInvalidated).toBe(true))
  })

  describe('a rejected write (400/409) — the server and the local graph disagree, never swallowed', () => {
    it('409: reverts the optimistic step, resyncs from a fresh GET, and shows the honest conflict notice', async () => {
      await renderOnJobQuestion()
      // The server's own truth, discovered only via the resync GET the 409 triggers below —
      // proves the resync actually re-reads the server rather than just reverting locally.
      mockInterviewState({ answers: { job: 'Selbstständig' }, nextStep: { kind: 'gate', id: 'gewerbe' }, openItems: 0 })
      server.use(http.post(POST_URL, () => HttpResponse.json(null, { status: 409 })))

      fireEvent.click(screen.getByText('Angestellt'))

      await onGewerbeGate()
      expect(screen.getByText('Deine Antwort passte nicht zum gespeicherten Stand. Wir haben deinen Fortschritt aktualisiert.')).toBeTruthy()
    })

    it('400: shows the honest "not accepted" notice and resyncs the same way', async () => {
      await renderOnJobQuestion()
      mockInterviewState(EMPTY_INTERVIEW_STATE)
      server.use(http.post(POST_URL, () => HttpResponse.json(null, { status: 400 })))

      fireEvent.click(screen.getByText('Angestellt'))

      await onJobQuestion()
      expect(screen.getByText('Diese Antwort wurde nicht akzeptiert. Wir haben deinen Fortschritt aktualisiert.')).toBeTruthy()
    })
  })

  it('a genuine network failure reverts the optimistic step (no resync needed) and shows a retry-style notice', async () => {
    await renderOnJobQuestion()
    server.use(http.post(POST_URL, () => HttpResponse.error()))

    fireEvent.click(screen.getByText('Angestellt'))

    await onJobQuestion()
    expect(screen.getByText('Deine Antwort konnte nicht gespeichert werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
  })

  describe('job branch table (P1-style — names the identity of the next step for every value)', () => {
    it('Angestellt -> ausland question (no gate)', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
    })

    it('Rente -> ausland question directly, NOT the Gewerbe gate (ADR-034: Rente is an answer, not a branch)', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Rente'))
      await onAuslandQuestion()
      expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
    })

    it('Beides -> Gewerbe gate, WITH the "prepare employee part" option', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Beides'))
      await onGewerbeGate()
      expect(screen.getByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeTruthy()
    })

    it('Selbstständig -> Gewerbe gate, terminal: no forward action of any kind', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Selbstständig'))
      await onGewerbeGate()
      expect(screen.queryByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeNull()
      // The only interactive control left is the back link — no button offers to move on.
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })
  })

  it('Beides at the Gewerbe gate: "prepare" advances to the ausland question (product ADR-028)', async () => {
    await renderOnJobQuestion()
    fireEvent.click(screen.getByText('Beides'))
    await onGewerbeGate()
    fireEvent.click(screen.getByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe'))
    await onAuslandQuestion()
  })

  it('Selbstständig stays behind the Gewerbe gate forever, even after visiting and returning', async () => {
    await renderOnJobQuestion()
    fireEvent.click(screen.getByText('Selbstständig'))
    await onGewerbeGate()
    fireEvent.click(screen.getByText('Zurück zur Frage'))
    await onJobQuestion()
    fireEvent.click(screen.getByText('Selbstständig'))
    await onGewerbeGate()
    expect(screen.queryByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeNull()
  })

  describe('ausland branch (CH-only gate is the one hard branch here)', () => {
    it('"In ein anderes Land" -> CH-only gate; continuing lands on the kinder question', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByText('In ein anderes Land'))
      await onChOnlyGate()
      fireEvent.click(screen.getByText('Ohne Auslands-Teil weitermachen'))
      await onKinderQuestion()
    })

    it('"Ja, in die Schweiz" -> kinder question directly, no gate', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByText('Ja, in die Schweiz'))
      await onKinderQuestion()
      expect(screen.queryByText('Ehrlich: andere Länder können wir noch nicht.')).toBeNull()
    })

    it('"Nein" -> kinder question directly, no gate', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByText('Nein'))
      await onKinderQuestion()
    })
  })

  it('calls onDone exactly once after the kinder question is answered, and renders nothing after', async () => {
    const onDone = vi.fn()
    const { container } = await renderOnJobQuestion({ onDone })
    fireEvent.click(screen.getByText('Angestellt'))
    await onAuslandQuestion()
    fireEvent.click(screen.getByText('Nein')) // ausland
    await onKinderQuestion()
    fireEvent.click(screen.getByText('1 Kind'))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(container.textContent).toBe('')
  })

  describe('back navigation between the three questions (in scope per #318; reset is not)', () => {
    it('back from ausland returns to the job question', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByLabelText('Zurück'))
      await onJobQuestion()
    })

    it('back from the CH-only gate returns to the ausland question', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByText('In ein anderes Land'))
      await onChOnlyGate()
      fireEvent.click(screen.getByText('Zurück zur Frage'))
      await onAuslandQuestion()
    })

    it('changing the job answer after going back changes the downstream path (no stale gate)', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Selbstständig'))
      await onGewerbeGate() // terminal
      fireEvent.click(screen.getByText('Zurück zur Frage'))
      await onJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion() // not stuck behind the old gate
      expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
    })

    it('the progress step and pill move back with the screen', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      expect(screen.getByText('2/3')).toBeTruthy()
      fireEvent.click(screen.getByLabelText('Zurück'))
      await onJobQuestion()
      expect(screen.getByText('1/3')).toBeTruthy()
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
    })
  })

  describe('ADR-0032 — no control offers what this slice cannot deliver', () => {
    it('the Gewerbe gate never renders a notify-me control, for either passable or terminal job values', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Beides'))
      await onGewerbeGate()
      expect(screen.queryByText(/[Bb]enachrichtigt/)).toBeNull()
      fireEvent.click(screen.getByText('Zurück zur Frage'))
      await onJobQuestion()
      fireEvent.click(screen.getByText('Selbstständig'))
      await onGewerbeGate()
      expect(screen.queryByText(/[Bb]enachrichtigt/)).toBeNull()
    })

    it('the CH-only gate never renders a "Vormerken" control', async () => {
      await renderOnJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByText('In ein anderes Land'))
      await onChOnlyGate()
      expect(screen.queryByText(/Vormerken/)).toBeNull()
    })

    it('no money sticker or estimate appears anywhere in the flow', async () => {
      await renderOnJobQuestion()
      expect(screen.queryByText(/€/)).toBeNull()
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      expect(screen.queryByText(/€/)).toBeNull()
    })
  })

  describe('i18n (ADR-0006) — English switches the label, not the persisted domain value', () => {
    it('renders the job question in English', async () => {
      renderInterview({ lng: 'en' })
      await screen.findByText('Multiple jobs? Use your main source — the rest comes later.')
      expect(screen.getByText('Employed')).toBeTruthy()
    })

    it('answering in English still drives the same graph branch (Selbstständig -> Gewerbe gate)', async () => {
      renderInterview({ lng: 'en' })
      await screen.findByText('Multiple jobs? Use your main source — the rest comes later.')
      fireEvent.click(screen.getByText('Self-employed'))
      await screen.findByText("Honestly: we're not good enough for that yet.")
    })
  })

  describe('P7 — no client-side persistence of interview answers (ADR-0008)', () => {
    // NOT `vi.spyOn(window.localStorage, 'setItem')` — jsdom implements `Storage` behind a Proxy
    // (needed for `localStorage.foo = 'bar'`-style magic property access) whose `get` trap
    // returns the *native* bound method regardless of an own property `spyOn` adds, so a spy
    // this way silently never records a single call — proven directly: even
    // `window.localStorage.setItem('x', '1')` on the very next line shows 0 calls on the spy.
    // `vi.stubGlobal` replaces the whole `localStorage` binding instead, which the Proxy trick
    // cannot defeat because there's no longer a Proxy in the lookup chain at all. Kept exactly
    // as task 1b built it — see #323 for the standing rule not to "fix" the two pre-existing
    // `spyOn`-based tests elsewhere; this one was never among them.
    let setItem: ReturnType<typeof vi.fn>
    beforeEach(() => {
      setItem = vi.fn()
      vi.stubGlobal('localStorage', { ...window.localStorage, setItem })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('never writes to localStorage across a full job -> ausland -> kinder round-trip, including the network round trip itself', async () => {
      const onDone = vi.fn()
      await renderOnJobQuestion({ onDone })
      fireEvent.click(screen.getByText('Angestellt'))
      await onAuslandQuestion()
      fireEvent.click(screen.getByText('In ein anderes Land'))
      await onChOnlyGate()
      fireEvent.click(screen.getByText('Ohne Auslands-Teil weitermachen'))
      await onKinderQuestion()
      fireEvent.click(screen.getByText('2 oder mehr'))

      await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
      expect(setItem).not.toHaveBeenCalled()
    })
  })
})
