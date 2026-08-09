// #318 task 1b — every assertion below names the *identity* of the next screen (which question
// or gate), never merely that "a next screen" appeared. That is the trap #318 names: a test
// that only checks something rendered stays green even if the branching is completely wrong.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { InterviewScreen } from './InterviewScreen'

function renderInterview(opts: { lng?: 'de' | 'en'; onDone?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <InterviewScreen onDone={opts.onDone ?? (() => {})} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

// Screen-identity helpers — each asserts on that screen's own help/body copy, a single,
// un-split text node (the question headings interpolate an emphasised mark word via nested
// `<Text>`, so their *concatenated* string is what the DOM exposes — help text avoids that
// entirely and names the screen just as unambiguously). Each names exactly one screen, so a
// mis-wired branch fails loudly instead of a generic "something is on screen" assertion passing
// by accident.
const onJobQuestion = () => expect(screen.getByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')).toBeTruthy()
const onAuslandQuestion = () =>
  expect(screen.getByText('Grenzgänger haben Sonderregeln — in die Schweiz können wir sie komplett, inklusive 60-Tage-Tracking.')).toBeTruthy()
const onKinderQuestion = () =>
  expect(screen.getByText('Kindergeld, Freibeträge, Betreuungskosten — die Günstigerprüfung Kindergeld vs. Freibetrag läuft automatisch.')).toBeTruthy()
const onGewerbeGate = () => expect(screen.getByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeTruthy()
const onChOnlyGate = () => expect(screen.getByText('Ehrlich: andere Länder können wir noch nicht.')).toBeTruthy()

describe('InterviewScreen', () => {
  it('opens on the job question — heading, help text, all four options, step 1/3', () => {
    renderInterview()
    onJobQuestion()
    expect(screen.getByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')).toBeTruthy()
    expect(screen.getByText('Angestellt')).toBeTruthy()
    expect(screen.getByText('Selbstständig')).toBeTruthy()
    expect(screen.getByText('Beides')).toBeTruthy()
    expect(screen.getByText('Rente')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
  })

  it('exposes progressbar semantics on the job question, correct for step 1 of 3', () => {
    renderInterview()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('3')
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
  })

  it('shows no back button on the first (job) question', () => {
    renderInterview()
    expect(screen.queryByLabelText('Zurück')).toBeNull()
  })

  describe('job branch table (P1-style — names the identity of the next step for every value)', () => {
    it('Angestellt -> ausland question (no gate)', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      onAuslandQuestion()
      expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
    })

    it('Rente -> ausland question directly, NOT the Gewerbe gate (ADR-034: Rente is an answer, not a branch)', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Rente'))
      onAuslandQuestion()
      expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
    })

    it('Beides -> Gewerbe gate, WITH the "prepare employee part" option', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Beides'))
      onGewerbeGate()
      expect(screen.getByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeTruthy()
    })

    it('Selbstständig -> Gewerbe gate, terminal: no forward action of any kind', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Selbstständig'))
      onGewerbeGate()
      expect(screen.queryByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeNull()
      // The only interactive control left is the back link — no button offers to move on.
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })
  })

  it('Beides at the Gewerbe gate: "prepare" advances to the ausland question (product ADR-028)', () => {
    renderInterview()
    fireEvent.click(screen.getByText('Beides'))
    onGewerbeGate()
    fireEvent.click(screen.getByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe'))
    onAuslandQuestion()
  })

  it('Selbstständig stays behind the Gewerbe gate forever, even after visiting and returning', () => {
    renderInterview()
    fireEvent.click(screen.getByText('Selbstständig'))
    onGewerbeGate()
    fireEvent.click(screen.getByText('Zurück zur Frage'))
    onJobQuestion()
    fireEvent.click(screen.getByText('Selbstständig'))
    onGewerbeGate()
    expect(screen.queryByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeNull()
  })

  describe('ausland branch (CH-only gate is the one hard branch here)', () => {
    it('"In ein anderes Land" -> CH-only gate; continuing lands on the kinder question', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      fireEvent.click(screen.getByText('In ein anderes Land'))
      onChOnlyGate()
      fireEvent.click(screen.getByText('Ohne Auslands-Teil weitermachen'))
      onKinderQuestion()
    })

    it('"Ja, in die Schweiz" -> kinder question directly, no gate', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      fireEvent.click(screen.getByText('Ja, in die Schweiz'))
      onKinderQuestion()
      expect(screen.queryByText('Ehrlich: andere Länder können wir noch nicht.')).toBeNull()
    })

    it('"Nein" -> kinder question directly, no gate', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      fireEvent.click(screen.getByText('Nein'))
      onKinderQuestion()
    })
  })

  it('calls onDone exactly once after the kinder question is answered, and renders nothing after', () => {
    const onDone = vi.fn()
    const { container } = renderInterview({ onDone })
    fireEvent.click(screen.getByText('Angestellt'))
    fireEvent.click(screen.getByText('Nein')) // ausland
    onKinderQuestion()
    fireEvent.click(screen.getByText('1 Kind'))

    expect(onDone).toHaveBeenCalledOnce()
    expect(container.textContent).toBe('')
  })

  describe('back navigation between the three questions (in scope per #318; reset is not)', () => {
    it('back from ausland returns to the job question', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      onAuslandQuestion()
      fireEvent.click(screen.getByLabelText('Zurück'))
      onJobQuestion()
    })

    it('back from the CH-only gate returns to the ausland question', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      fireEvent.click(screen.getByText('In ein anderes Land'))
      onChOnlyGate()
      fireEvent.click(screen.getByText('Zurück zur Frage'))
      onAuslandQuestion()
    })

    it('changing the job answer after going back changes the downstream path (no stale gate)', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Selbstständig'))
      onGewerbeGate() // terminal
      fireEvent.click(screen.getByText('Zurück zur Frage'))
      onJobQuestion()
      fireEvent.click(screen.getByText('Angestellt'))
      onAuslandQuestion() // not stuck behind the old gate
      expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
    })

    it('the progress step and pill move back with the screen', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      expect(screen.getByText('2/3')).toBeTruthy()
      fireEvent.click(screen.getByLabelText('Zurück'))
      expect(screen.getByText('1/3')).toBeTruthy()
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
    })
  })

  describe('ADR-0032 — no control offers what this slice cannot deliver', () => {
    it('the Gewerbe gate never renders a notify-me control, for either passable or terminal job values', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Beides'))
      expect(screen.queryByText(/[Bb]enachrichtigt/)).toBeNull()
      fireEvent.click(screen.getByText('Zurück zur Frage'))
      fireEvent.click(screen.getByText('Selbstständig'))
      expect(screen.queryByText(/[Bb]enachrichtigt/)).toBeNull()
    })

    it('the CH-only gate never renders a "Vormerken" control', () => {
      renderInterview()
      fireEvent.click(screen.getByText('Angestellt'))
      fireEvent.click(screen.getByText('In ein anderes Land'))
      expect(screen.queryByText(/Vormerken/)).toBeNull()
    })

    it('no money sticker or estimate appears anywhere in the flow', () => {
      renderInterview()
      expect(screen.queryByText(/€/)).toBeNull()
      fireEvent.click(screen.getByText('Angestellt'))
      expect(screen.queryByText(/€/)).toBeNull()
    })
  })

  describe('i18n (ADR-0006) — English switches the label, not the persisted domain value', () => {
    it('renders the job question in English', () => {
      renderInterview({ lng: 'en' })
      expect(screen.getByText('Multiple jobs? Use your main source — the rest comes later.')).toBeTruthy()
      expect(screen.getByText('Employed')).toBeTruthy()
    })

    it('answering in English still drives the same graph branch (Selbstständig -> Gewerbe gate)', () => {
      renderInterview({ lng: 'en' })
      fireEvent.click(screen.getByText('Self-employed'))
      expect(screen.getByText("Honestly: we're not good enough for that yet.")).toBeTruthy()
    })
  })

  describe('P7 — no client-side persistence of interview answers (ADR-0008)', () => {
    // NOT `vi.spyOn(window.localStorage, 'setItem')` — jsdom implements `Storage` behind a Proxy
    // (needed for `localStorage.foo = 'bar'`-style magic property access) whose `get` trap
    // returns the *native* bound method regardless of an own property `spyOn` adds, so a spy
    // this way silently never records a single call — proven directly: even
    // `window.localStorage.setItem('x', '1')` on the very next line shows 0 calls on the spy.
    // `vi.stubGlobal` replaces the whole `localStorage` binding instead, which the Proxy trick
    // cannot defeat because there's no longer a Proxy in the lookup chain at all.
    let setItem: ReturnType<typeof vi.fn>
    beforeEach(() => {
      setItem = vi.fn()
      vi.stubGlobal('localStorage', { ...window.localStorage, setItem })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('never writes to localStorage across a full job -> ausland -> kinder round-trip', () => {
      const onDone = vi.fn()
      renderInterview({ onDone })
      fireEvent.click(screen.getByText('Angestellt'))
      fireEvent.click(screen.getByText('In ein anderes Land'))
      fireEvent.click(screen.getByText('Ohne Auslands-Teil weitermachen'))
      fireEvent.click(screen.getByText('2 oder mehr'))

      expect(onDone).toHaveBeenCalledOnce()
      expect(setItem).not.toHaveBeenCalled()
    })
  })
})
