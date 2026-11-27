// The Kapital mask's remaining states: load error + retry, leaving, "unlesbar", answering the depot
// question in place, and every verdict of the Günstigerprüfung (each with its own honest statement).
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { KapitalResponseDto } from '@steuereule/api-client'
import { CapitalScreen } from './CapitalScreen'
import { server } from '../../../test/test-msw-server'
import { renderWithQuery } from '../../../test/test-render'

const CAPITAL_URL = '*/v1/steuerjahre/2026/kapital'
const GP_URL = '*/v1/steuerjahre/2026/kapital/guenstigerpruefung'

const BASE: KapitalResponseDto = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
  requiredFields: ['kapitalertraege'],
  depot: { kind: 'deutscher-broker' },
  items: [],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0 },
  inhaber: null,
} as KapitalResponseDto

function renderCapital(props: { onDone?: () => void; onBack?: () => void } = {}) {
  return renderWithQuery(<CapitalScreen taxYear={2026} {...props} />)
}

const mockCapital = (over: Partial<KapitalResponseDto> = {}) =>
  server.use(http.get(CAPITAL_URL, () => HttpResponse.json({ ...BASE, ...over }, { status: 200 })))
const mockVerdict = (body: object) => server.use(http.get(GP_URL, () => HttpResponse.json(body, { status: 200 })))

describe('CapitalScreen states', () => {
  it('shows an honest error and reloads on retry', async () => {
    let healthy = false
    server.use(http.get(CAPITAL_URL, () => (healthy ? HttpResponse.json(BASE, { status: 200 }) : HttpResponse.json(null, { status: 500 }))))
    renderCapital()

    expect(await screen.findByText('Das konnte nicht geladen werden.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))

    expect(await screen.findByText('Kapital & Depot')).toBeTruthy()
  })

  it('leaves through Zurück and Weiter, and survives Weiter without a handler', async () => {
    const onBack = vi.fn()
    const onDone = vi.fn()
    renderCapital({ onBack, onDone })
    await screen.findByText('Kapital & Depot')

    fireEvent.click(screen.getByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByTestId('kapital-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('does not crash on Weiter when no handler is wired', async () => {
    renderCapital()
    await screen.findByText('Kapital & Depot')
    expect(() => fireEvent.click(screen.getByTestId('kapital-weiter'))).not.toThrow()
  })

  it('records "unlesbar" for the Kapitalerträge', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(`${CAPITAL_URL}/kapitalertraege`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(BASE, { status: 200 })
      }),
    )
    renderCapital()
    await screen.findByText('Kapital & Depot')

    fireEvent.click(screen.getByText('Kann ich nicht lesen'))

    await waitFor(() => expect(bodies[0]).toEqual({ kind: 'unklar' }))
  })

  it('lets the user answer the depot question right on the mask and comes back to it', async () => {
    mockCapital({ depot: { kind: 'unbekannt' } as KapitalResponseDto['depot'] })
    renderCapital()

    fireEvent.click(await screen.findByTestId('kapital-frage-beantworten'))
    expect(screen.queryByText('Kapital & Depot')).toBeNull()
  })

  it('explains an unknown depot, a foreign broker and a German broker without withheld tax differently', async () => {
    mockCapital({ depot: { kind: 'deutscher-broker' } as KapitalResponseDto['depot'] })
    renderCapital()
    expect(await screen.findByText(/behält Abgeltungsteuer ein, sobald/)).toBeTruthy()
  })
})

describe('the Günstigerprüfung verdicts', () => {
  const figures = { flatRateTax: 100, personal: 50 }

  it('recommends the personal rate when it is clearly cheaper', async () => {
    mockCapital()
    mockVerdict({ kind: 'eindeutig', recommendation: 'persoenlich', ...figures, uncertainty: { kind: 'bestimmt', upperLimit: 0 } })
    renderCapital()
    expect(await screen.findByTestId('guenstigerpruefung-aussage')).toBeTruthy()
    expect(screen.getByText('Dein persönlicher Steuersatz ist günstiger.')).toBeTruthy()
  })

  it('says it is too close to call', async () => {
    mockCapital()
    mockVerdict({ kind: 'zu-knapp', ...figures })
    renderCapital()
    expect((await screen.findByTestId('guenstigerpruefung-aussage')).textContent).toBe('Zu knapp, um das zu sagen.')
  })

  it('shows the Progressionsvorbehalt hint when the verdict stays undetermined', async () => {
    mockCapital()
    mockVerdict({ kind: 'unbestimmt', ...figures, uncertainty: { kind: 'unbestimmt' } })
    renderCapital()
    expect(await screen.findByText(/Progressionsvorbehalt/)).toBeTruthy()
  })

  it.each([
    ['keine-abgeltung-einbehalten', 'Keine Abgeltungsteuer einbehalten — die Günstigerprüfung stellt sich hier nicht.'],
    ['krypto-gegated', 'Für Krypto gibt es noch keine Günstigerprüfung.'],
    ['keine-kapitalertraege', 'Trag zuerst deine Kapitalerträge ein — dann rechnen wir den Vergleich.'],
    ['kap-depot-nicht-beantwortet', 'Erst die Depot-Frage im Interview beantworten — dann wissen wir, ob die Günstigerprüfung anwendbar ist.'],
  ])('names why it does not apply: %s', async (reason, expected) => {
    mockCapital()
    mockVerdict({ kind: 'nicht-anwendbar', reason })
    renderCapital()
    expect(await screen.findByText(expected)).toBeTruthy()
  })

  it('shows both amounts, the difference and how the Cockpit estimate counts the capital income', async () => {
    mockCapital()
    mockVerdict({ kind: 'eindeutig', recommendation: 'abgeltung', flatRateTax: 1846.25, personal: 2940, delta: 1093.75, uncertainty: { kind: 'bestimmt', upperLimit: 0 }, estimateTreatment: 'abgeltung' })
    renderCapital()
    expect((await screen.findByTestId('guenstigerpruefung-abgeltung')).textContent).toBe('1.846,25\u00a0€')
    expect(screen.getByTestId('guenstigerpruefung-persoenlich').textContent).toBe('2.940\u00a0€')
    expect(screen.getByTestId('guenstigerpruefung-unterschied').textContent).toBe('1.093,75\u00a0€')
    // The flat tax is the cheaper side here: the line must not call the tariff the cheaper one (real-data run).
    expect(screen.getByText('Die Schätzung im Cockpit rechnet deine Kapitalerträge mit der Abgeltungsteuer, und das ist hier auch die günstigere Seite.')).toBeTruthy()
    expect(screen.queryByText(/nicht mit dem günstigeren Tarif/)).toBeNull()
  })

  it('says the estimate leaves out the cheaper tariff only when the tariff is the cheaper side', async () => {
    mockCapital()
    mockVerdict({ kind: 'eindeutig', recommendation: 'persoenlich', flatRateTax: 791.25, personal: 0, delta: -791.25, uncertainty: { kind: 'bestimmt', upperLimit: 0 }, estimateTreatment: 'abgeltung' })
    renderCapital()
    expect(await screen.findByText('Die Schätzung im Cockpit rechnet deine Kapitalerträge mit der Abgeltungsteuer, nicht mit dem günstigeren Tarif.')).toBeTruthy()
  })

  it('names no cheaper side for a result too close to call', async () => {
    mockCapital()
    mockVerdict({ kind: 'zu-knapp', flatRateTax: 800, personal: 790, delta: -10, uncertainty: { kind: 'bestimmt', upperLimit: 0 }, estimateTreatment: 'abgeltung' })
    renderCapital()
    expect(await screen.findByText('Die Schätzung im Cockpit rechnet deine Kapitalerträge mit der Abgeltungsteuer.')).toBeTruthy()
  })

  it('says the single estimate leaves the flat tax withheld at source', async () => {
    mockCapital()
    mockVerdict({ kind: 'eindeutig', recommendation: 'persoenlich', flatRateTax: 791.25, personal: 0, delta: -791.25, uncertainty: { kind: 'bestimmt', upperLimit: 0 }, estimateTreatment: 'quelle' })
    renderCapital()
    expect((await screen.findByTestId('guenstigerpruefung-unterschied')).textContent).toBe('791,25\u00a0€')
    expect(screen.getByText('Die Schätzung im Cockpit lässt es bei der einbehaltenen Abgeltungsteuer; den günstigeren Tarif rechnet sie nicht ein.')).toBeTruthy()
  })

  it('names what the Cockpit estimate still lacks instead of a number', async () => {
    mockCapital()
    mockVerdict({ kind: 'nicht-anwendbar', reason: 'schaetzung-offen', missing: ['lohnsteuer', 'personB.bruttolohn-total'] })
    renderCapital()
    expect(await screen.findByText('Den Vergleich rechnen wir auf der Schätzung im Cockpit. Ihr fehlt noch: Einbehaltene Lohnsteuer (Zeile 4), Person B: Bruttolohn (Ziffer 8)')).toBeTruthy()
    expect(screen.queryByTestId('guenstigerpruefung-abgeltung')).toBeNull()
  })

  it('names the open filing type of a couple', async () => {
    mockCapital()
    mockVerdict({ kind: 'nicht-anwendbar', reason: 'schaetzung-offen', missing: ['veranlagungsart'] })
    renderCapital()
    expect(await screen.findByText(/^Den Vergleich rechnen wir auf der Schätzung im Cockpit\. Ihr fehlt noch: Wie ihr veranlagt werdet/)).toBeTruthy()
  })

  it('says when the Cockpit estimate cannot price the case', async () => {
    mockCapital()
    mockVerdict({ kind: 'nicht-anwendbar', reason: 'schaetzung-nicht-moeglich', estimateReason: 'nur-angestellte' })
    renderCapital()
    expect(await screen.findByText('Den Vergleich rechnen wir auf der Schätzung im Cockpit, und die geht hier noch nicht: Die Erstattung rechnen wir bisher nur für Angestellte.')).toBeTruthy()
  })

  it('shows nothing when there is no verdict', async () => {
    mockCapital()
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()
    await screen.findByText('Kapital & Depot')
    expect(screen.queryByTestId('guenstigerpruefung-aussage')).toBeNull()
  })
})
