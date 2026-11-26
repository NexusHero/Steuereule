// Plausibilitäts-Screen (M2) — the honest gate: renders Widersprüche/Hinweise/einreichbar from the
// core's `pruefePlausibilitaet`, reading the LStB + interview facts. No fake Ampel (ADR-0032).
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { PlausibilityScreen } from './PlausibilityScreen'
import { server } from '../../../test/test-msw-server'
import { COMPLETE_LSTB_RESPONSE } from '../../../test/test-lstb-fixtures'
import { renderWithQuery } from '../../../test/test-render'

const TAX_YEAR = 2026

function renderPlausibility() {
  return renderWithQuery(<PlausibilityScreen taxYear={TAX_YEAR} onBack={() => {}} />)
}

function completeLstb() {
  return http.get(`*/v1/steuerjahre/${TAX_YEAR}/lstb`, () => HttpResponse.json(COMPLETE_LSTB_RESPONSE, { status: 200 }))
}

function finishedInterview(answers: Record<string, string>) {
  return http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
    HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 }),
  )
}

describe('PlausibilitaetScreen', () => {
  it('reports "nicht einreichbar" with the honest LStB blocker on an empty mask', async () => {
    renderPlausibility()

    expect(await screen.findByText('Da ist noch etwas offen:')).toBeTruthy()
    expect(screen.getByText('Lohnsteuerbescheinigung noch nicht vollständig.')).toBeTruthy()
  })

  it('reports "einreichbar" once the LStB is complete and nothing is gated', async () => {
    server.use(
      completeLstb(),
      finishedInterview({ job: 'Angestellt' }),
    )
    renderPlausibility()

    expect(await screen.findByText('Alles klar — keine Widersprüche, nichts mehr offen.')).toBeTruthy()
    // ADR-0032 (ticket 15 review F3): "einreichbar" must not read as "everything was checked" —
    // the werktage/Pendlerpauschale boundary is stated on the screen, not hidden in the header.
    expect(screen.getByText('Ehrlich: die Arbeitstage- und Pendlerpauschale-Prüfung folgt in einem späteren Schritt.')).toBeTruthy()
  })

  // The same list the printout check blocks on (real-data run: the printout was blocked while this screen said nothing was open).
  function printoutCheck(body: { missing: string[]; hints: string[] }) {
    return http.get(`*/v1/steuerjahre/${TAX_YEAR}/ausdruck/pruefung`, () => HttpResponse.json({ ...body, missingChildFields: [] }, { status: 200 }))
  }

  it('does not claim "nichts mehr offen" while the printout check still names something', async () => {
    server.use(completeLstb(), finishedInterview({ job: 'Angestellt' }), printoutCheck({ missing: ['iban', 'plz', 'wohnort'], hints: [] }))
    renderPlausibility()

    expect(await screen.findByText('Für den Ausdruck fehlen noch 3 Angaben (z. B. Adresse oder IBAN).')).toBeTruthy()
    expect(screen.queryByText('Alles klar — keine Widersprüche, nichts mehr offen.')).toBeNull()
  })

  it('names a missing IBAN of a return with a payment as a hint only', async () => {
    server.use(completeLstb(), finishedInterview({ job: 'Angestellt' }), printoutCheck({ missing: [], hints: ['iban'] }))
    renderPlausibility()

    expect(await screen.findByText('Alles klar — keine Widersprüche, nichts mehr offen.')).toBeTruthy()
    expect(screen.getByText('Eine IBAN fehlt. Für eine Nachzahlung brauchst du keine; ergibt sich doch eine Erstattung, trag sie in „Angaben für die Erklärung“ ein.')).toBeTruthy()
  })

  it('names a gated Einkunftsart as a blocker (ADR-032)', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: { job: 'Selbstständig' }, nextStep: { kind: 'gate', id: 'gewerbe' }, openItems: 0 }, { status: 200 }),
      ),
    )
    renderPlausibility()

    expect(await screen.findByText('Eine Einkunftsart können wir noch nicht rechnen.')).toBeTruthy()
  })

  it('shows the betrag-spaeter Notice without blocking when an allowlisted step is "spaeter"', async () => {
    server.use(
      completeLstb(),
      finishedInterview({ job: 'Angestellt', dhf: 'Ja', 'dhf-miete': 'spaeter' }),
    )
    renderPlausibility()

    expect(await screen.findByText('Mindestens ein Betrag ist noch mit „Später eintragen“ markiert.')).toBeTruthy()
    expect(screen.getByText('Alles klar — keine Widersprüche, nichts mehr offen.')).toBeTruthy()
  })
})
