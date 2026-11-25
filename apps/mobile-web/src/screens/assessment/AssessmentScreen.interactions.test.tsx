// The Bescheid mask's interactions the first test file does not reach: retry, every figure's
// record / "unlesbar" path (incl. a negative Erstattung), the expired deadline, the incomplete
// Abgleich, marking as checked, leaving, the filed Einspruch's amount, and failed saves.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AssessmentResponseDto } from '@steuereule/api-client'
import { AssessmentScreen } from './AssessmentScreen'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { renderWithQuery } from '../../test-render'

const URL_BESCHEID = '*/v1/steuerjahre/2026/bescheid'

function base(over: Partial<AssessmentResponseDto> = {}): AssessmentResponseDto {
  return {
    status: 'eingegangen',
    assessmentDate: null,
    appealReason: null,
    appealDate: null,
    appealOutcome: null,
    appealOutcomeAmount: null,
    fields: [
      { id: 'einnahmen', kind: 'offen' },
      { id: 'vorsorgeaufwand', kind: 'offen' },
      { id: 'anrechnung', kind: 'offen' },
      { id: 'festgesetzteSteuer', kind: 'offen' },
      { id: 'erstattung', kind: 'offen' },
    ],
    reconciliation: { deviations: [], calculationIncomplete: false },
    frist: { assessmentDate: null, deadlineEnd: null, remainingDays: null, running: null },
    nextStates: ['geprüft'],
    positions: [],
    explanations: [],
    diff: null,
    ...over,
  }
}

function renderScreen(props: { onDone?: () => void; onBack?: () => void } = {}) {
  return renderWithQuery(<AssessmentScreen taxYear={2026} {...props} />)
}

const serve = (data: AssessmentResponseDto) => server.use(http.get(URL_BESCHEID, () => HttpResponse.json(data, { status: 200 })))

function capture(path: string, reply: AssessmentResponseDto = base(), status = 200) {
  const bodies: unknown[] = []
  server.use(
    http.put(`${URL_BESCHEID}/${path}`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(reply, { status })
    }),
  )
  return bodies
}

describe('AssessmentScreen loading and leaving', () => {
  it('reloads on retry after a failed load', async () => {
    let healthy = false
    server.use(http.get(URL_BESCHEID, () => (healthy ? HttpResponse.json(base(), { status: 200 }) : HttpResponse.json({}, { status: 500 }))))
    renderScreen()
    await screen.findByText('Das hat nicht geklappt.')
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByText('Dein Steuerbescheid')).toBeTruthy()
  })

  it('leaves through Zurück and Fertig, and survives Fertig with no handler', async () => {
    serve(base())
    const onBack = vi.fn()
    const onDone = vi.fn()
    renderScreen({ onBack, onDone })
    await screen.findByText('Dein Steuerbescheid')
    fireEvent.click(screen.getByTestId('bescheid-zurueck'))
    fireEvent.click(screen.getByTestId('bescheid-fertig'))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('does not crash on Fertig when no handler is wired', async () => {
    serve(base())
    renderScreen()
    await screen.findByText('Dein Steuerbescheid')
    expect(() => fireEvent.click(screen.getByTestId('bescheid-fertig'))).not.toThrow()
  })
})

describe('AssessmentScreen figures', () => {
  it('records a whole-euro figure on blur', async () => {
    serve(base())
    const bodies = capture('feld/einnahmen')
    renderScreen()
    const field = await screen.findByTestId('bescheid-feld-einnahmen')
    fireEvent.change(field, { target: { value: '48000' } })
    fireEvent.blur(field)
    await waitFor(() => expect(bodies).toEqual([{ kind: 'erfasst', value: 48000 }]))
  })

  it('accepts a negative Erstattung (a back payment) but no other figure', async () => {
    serve(base())
    const erstattung = capture('feld/erstattung')
    const einnahmen = capture('feld/einnahmen')
    renderScreen()
    const refund = await screen.findByTestId('bescheid-feld-erstattung')
    fireEvent.change(refund, { target: { value: '-250' } })
    fireEvent.blur(refund)
    await waitFor(() => expect(erstattung).toEqual([{ kind: 'erfasst', value: -250 }]))

    const income = screen.getByTestId('bescheid-feld-einnahmen')
    fireEvent.change(income, { target: { value: '-5' } })
    fireEvent.blur(income)
    await new Promise((r) => setTimeout(r, 30))
    expect(einnahmen).toHaveLength(0)
  })

  it('does not resend a figure that is already recorded with the same value', async () => {
    const data = base()
    data.fields[0] = { id: 'einnahmen', kind: 'erfasst', value: 100 }
    serve(data)
    const bodies = capture('feld/einnahmen')
    renderScreen()
    const field = await screen.findByTestId('bescheid-feld-einnahmen')
    fireEvent.blur(field)
    await new Promise((r) => setTimeout(r, 30))
    expect(bodies).toHaveLength(0)
  })

  it('marks a figure as unreadable', async () => {
    serve(base())
    const bodies = capture('feld/festgesetzteSteuer')
    renderScreen()
    fireEvent.click(await screen.findByTestId('bescheid-unklar-festgesetzteSteuer'))
    await waitFor(() => expect(bodies).toEqual([{ kind: 'unklar' }]))
  })

  it('keeps working when a save is refused by the server', async () => {
    serve(base())
    const bodies = capture('feld/einnahmen', base(), 500)
    renderScreen()
    const field = await screen.findByTestId('bescheid-feld-einnahmen')
    fireEvent.change(field, { target: { value: '10' } })
    fireEvent.blur(field)
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(screen.getByText('Dein Steuerbescheid')).toBeTruthy()
  })

  it('does not save a Bescheiddatum that is not a complete date', async () => {
    serve(base())
    const bodies = capture('datum')
    renderScreen()
    const field = await screen.findByTestId('bescheid-datum')
    fireEvent.change(field, { target: { value: '1505' } })
    fireEvent.blur(field)
    await new Promise((r) => setTimeout(r, 30))
    expect(bodies).toHaveLength(0)
  })
})

describe('AssessmentScreen deadline, Abgleich and status', () => {
  it('says the deadline has expired', async () => {
    serve(base({ frist: { assessmentDate: '2026-01-10', deadlineEnd: '2026-02-10', remainingDays: -4, running: false } }))
    renderScreen()
    expect(await screen.findByText('Die Einspruchsfrist (bis 10.02.2026) ist abgelaufen.')).toBeTruthy()
  })

  it('is honest that the Abgleich is provisional while the calculation is incomplete, and lists a positive deviation', async () => {
    serve(
      base({
        reconciliation: { calculationIncomplete: true, deviations: [{ field: 'vorsorgeaufwand', assessment: 9000, calculated: 8000, difference: 1000 }] },
      }),
    )
    renderScreen()
    expect(await screen.findByText('Ehrlich: deine Berechnung ist noch nicht vollständig — der Abgleich ist vorläufig.')).toBeTruthy()
    expect(screen.getByText('+1.000 €')).toBeTruthy()
  })

  it('marks the Bescheid as checked', async () => {
    serve(base())
    const bodies = capture('status')
    renderScreen()
    fireEvent.click(await screen.findByText('Als geprüft markieren'))
    await waitFor(() => expect(bodies).toEqual([{ status: 'geprüft' }]))
  })

  it('shows neither the check button nor an Einspruch once the server allows none', async () => {
    serve(base({ nextStates: [] }))
    renderScreen()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.queryByText('Als geprüft markieren')).toBeNull()
    expect(screen.queryByText('Einspruch')).toBeNull()
  })
})

describe('AssessmentScreen filed Einspruch', () => {
  const filed = (over: Partial<AssessmentResponseDto> = {}) =>
    base({ status: 'einspruch-eingelegt', appealReason: null, appealDate: null, appealOutcome: 'stattgegeben', appealOutcomeAmount: 140, nextStates: [], ...over })

  it('falls back to "Sonstiges" without a recorded reason and shows the recorded amount', async () => {
    serve(filed())
    renderScreen()
    expect(await screen.findByText('Einspruch eingelegt: Sonstiges.')).toBeTruthy()
    expect((screen.getByTestId('bescheid-einspruch-betrag') as HTMLInputElement).value).toBe('140')
    expect(screen.queryByTestId('bescheid-einspruch-eingelegt-am')).toBeNull()
  })

  it('records another outcome keeping the amount, and clears the amount when emptied', async () => {
    serve(filed())
    const bodies = capture('einspruch/ergebnis')
    renderScreen()
    fireEvent.click(await screen.findByTestId('bescheid-einspruch-ergebnis-abgelehnt'))
    await waitFor(() => expect(bodies[0]).toEqual({ outcome: 'abgelehnt', amount: 140 }))

    const amount = screen.getByTestId('bescheid-einspruch-betrag')
    fireEvent.change(amount, { target: { value: '' } })
    fireEvent.blur(amount)
    await waitFor(() => expect(bodies[1]).toEqual({ outcome: 'stattgegeben', amount: null }))
  })

  it('takes a typographic minus and ignores text that is no whole number', async () => {
    serve(filed({ appealOutcomeAmount: null }))
    const bodies = capture('einspruch/ergebnis')
    renderScreen()
    const amount = await screen.findByTestId('bescheid-einspruch-betrag')
    fireEvent.change(amount, { target: { value: 'viel' } })
    fireEvent.blur(amount)
    await new Promise((r) => setTimeout(r, 30))
    expect(bodies).toHaveLength(0)

    fireEvent.change(amount, { target: { value: '−75' } })
    fireEvent.blur(amount)
    await waitFor(() => expect(bodies[0]).toEqual({ outcome: 'stattgegeben', amount: -75 }))
  })

  it('does not resend an unchanged or still empty amount', async () => {
    serve(filed({ appealOutcomeAmount: null }))
    const bodies = capture('einspruch/ergebnis')
    renderScreen()
    const amount = await screen.findByTestId('bescheid-einspruch-betrag')
    fireEvent.blur(amount)
    await new Promise((r) => setTimeout(r, 30))
    expect(bodies).toHaveLength(0)
  })

  it('files an Einspruch without a date when the date typed is incomplete', async () => {
    serve(base({ status: 'geprüft', nextStates: ['einspruch-eingelegt'] }))
    const bodies = capture('einspruch')
    renderScreen()
    fireEvent.change(await screen.findByTestId('bescheid-einspruch-datum'), { target: { value: '12' } })
    fireEvent.click(screen.getByTestId('bescheid-einspruch-grund-beleg-nicht-beruecksichtigt'))
    await waitFor(() => expect(bodies).toEqual([{ reason: 'beleg-nicht-beruecksichtigt' }]))
  })
})

describe('AssessmentScreen failed saves are visible (WEB-47, NC-09)', () => {
  it('shows a failed save at once, keeps the typed value, and „Fertig“ warns once instead of leaving', async () => {
    serve(base())
    server.use(http.put(`${URL_BESCHEID}/feld/einnahmen`, () => HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 })))
    const onDone = vi.fn()
    renderScreen({ onDone })
    const field = await screen.findByTestId('bescheid-feld-einnahmen')
    fireEvent.change(field, { target: { value: '40.000' } })
    fireEvent.blur(field)
    expect(await screen.findByTestId('speichern-fehlgeschlagen')).toBeTruthy()
    expect(screen.getByTestId('speichern-fehlgeschlagen').textContent).toContain('Bei uns ist gerade etwas schiefgelaufen.')
    expect((screen.getByTestId('bescheid-feld-einnahmen') as HTMLInputElement).value).toBe('40000')
    fireEvent.click(screen.getByTestId('bescheid-fertig'))
    expect(await screen.findByTestId('bescheid-ungespeichert')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('bescheid-fertig'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('„Fertig“ waits for a save still on its way', async () => {
    serve(base())
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodies: unknown[] = []
    server.use(
      http.put(`${URL_BESCHEID}/feld/einnahmen`, async ({ request }) => {
        bodies.push(await request.json())
        await held
        return HttpResponse.json(base())
      }),
    )
    const onDone = vi.fn()
    renderScreen({ onDone })
    const field = await screen.findByTestId('bescheid-feld-einnahmen')
    fireEvent.change(field, { target: { value: '1.234' } })
    fireEvent.blur(field)
    await waitFor(() => expect(bodies).toEqual([{ kind: 'erfasst', value: 1234 }]))
    fireEvent.click(screen.getByTestId('bescheid-fertig'))
    expect(onDone).not.toHaveBeenCalled()
    release()
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})

describe('AssessmentScreen fails closed (WEB-28)', () => {
  it('with every request failing it shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderScreen()
    await expectFailsClosed(failing)
  })
})
