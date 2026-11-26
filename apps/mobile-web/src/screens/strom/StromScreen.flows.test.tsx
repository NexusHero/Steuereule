// The Strom screen beyond routing: the load error with a retry, the masks it frames, the way back
// and out of every page, the guest's basis, and the summary at the end with refund, taken and open steps.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Answers } from '@steuereule/core'
import { server } from '../../../test/test-msw-server'
import { StromScreen } from './StromScreen'
import { forgetEffects, rememberEffect } from './stromEffects'
import type { StromStep } from './stromPlan'
import { renderWithQuery } from '../../../test/test-render'

const YEAR = 2025
const PENSIONER: Answers = { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

beforeEach(() => forgetEffects())

function serve(answers: Answers) {
  server.use(
    http.get(`*/v1/steuerjahre/${YEAR}/interview`, () => HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
    http.get(`*/v1/steuerjahre/${YEAR - 1}/interview`, () => HttpResponse.json({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
    http.get(`*/v1/steuerjahre/${YEAR}/steuerschaetzung`, () => HttpResponse.json({ kind: 'offen', missing: [] }, { status: 200 })),
    http.get(`*/v1/steuerjahre/${YEAR}/rente`, () =>
      HttpResponse.json({ kind: null, jahresbetrag: { kind: 'offen' }, rentenbeginnJahr: { kind: 'offen' }, alterBeiRentenbeginn: { kind: 'offen' }, items: [], status: { kind: 'bestimmt' } }, { status: 200 }),
    ),
  )
}

interface Handlers {
  onGo?: (step: StromStep) => void
  onExit?: () => void
  onOpenSubmission?: () => void
  onGuestBasisDone?: (path: string) => void
  isSignedIn?: boolean
}

function renderStrom(slug: string | undefined, h: Handlers = {}) {
  return renderWithQuery(
    <StromScreen
      taxYear={YEAR}
      slug={slug}
      isSignedIn={h.isSignedIn ?? true}
      onGo={h.onGo ?? (() => {})}
      onExit={h.onExit ?? (() => {})}
      onOpenSubmission={h.onOpenSubmission ?? (() => {})}
      onGuestBasisDone={(h.onGuestBasisDone ?? (() => {})) as never}
    />,
  )
}

describe('StromScreen loading', () => {
  it('says honestly the interview could not be loaded and reloads on retry', async () => {
    let healthy = false
    serve(PENSIONER)
    server.use(
      http.get(`*/v1/steuerjahre/${YEAR}/interview`, () =>
        healthy ? HttpResponse.json({ answers: PENSIONER, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 }) : HttpResponse.json(null, { status: 500 }),
      ),
    )
    renderStrom('auswahl')
    expect(await screen.findByText('Das konnte nicht geladen werden.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByTestId('strom-schritt-auswahl')).toBeTruthy()
  })
})

describe('StromScreen masks', () => {
  it('frames the own pension mask with the step count and a pause link, and leads on from it', async () => {
    serve(PENSIONER)
    const onGo = vi.fn()
    const onExit = vi.fn()
    renderStrom('rente', { onGo, onExit })

    expect(await screen.findByTestId('strom-schritt-rente')).toBeTruthy()
    expect(await screen.findByText('Deine Rente')).toBeTruthy()
    expect(screen.getByTestId('strom-position')).toBeTruthy()

    fireEvent.click(screen.getByTestId('strom-pause'))
    expect(onExit).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByText('Weiter'))
    await waitFor(() => expect(onGo).toHaveBeenCalled())
  })

  it('leaves the Strom from the first mask’s back button, since there is no earlier step', async () => {
    serve(PENSIONER)
    const onGo = vi.fn()
    renderStrom('rente', { onGo })
    await screen.findByText('Deine Rente')
    fireEvent.click(screen.getByLabelText('Zurück'))
    await waitFor(() => expect(onGo).toHaveBeenCalled())
    expect((onGo.mock.calls[0]![0] as StromStep).kind).toBe('basis')
  })
})

describe('StromScreen pages', () => {
  it('goes back one step from the selection page', async () => {
    serve(PENSIONER)
    const onGo = vi.fn()
    renderStrom('auswahl', { onGo })
    fireEvent.click(await screen.findByTestId('strom-zurueck'))
    expect(onGo).toHaveBeenCalledOnce()
  })

  it('lets a guest answer the basis and sends them to the account wall with their path', async () => {
    serve(PENSIONER)
    server.use(
      http.get(`*/v1/steuerjahre/${YEAR}/interview`, () => HttpResponse.json({ answers: PENSIONER, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
      http.post(`*/v1/steuerjahre/${YEAR}/interview/antworten`, () => HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
    )
    const onGuestBasisDone = vi.fn()
    const onGo = vi.fn()
    renderStrom('basis', { isSignedIn: false, onGuestBasisDone, onGo })
    fireEvent.click(await screen.findByTestId('strom-weiter'))
    await waitFor(() => expect(onGuestBasisDone).toHaveBeenCalledWith('rente'))
    expect(onGo).not.toHaveBeenCalled()
  })

  it('sends a guest who opens a later address on to the beginning', async () => {
    serve(PENSIONER)
    const onGo = vi.fn()
    renderStrom('weiter', { isSignedIn: false, onGo })
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: 'basis' }))
  })
})

describe('StromScreen summary', () => {
  it('shows the estimated refund, what was taken over with its effect and what is still open', async () => {
    serve({ ...PENSIONER, spenden: 'Ja' })
    server.use(
      http.get(`*/v1/steuerjahre/${YEAR}/steuerschaetzung`, () =>
        HttpResponse.json({ kind: 'spanne', result: { from: 400, to: 500 }, missing: [] }, { status: 200 }),
      ),
    )
    rememberEffect(YEAR, 'rente', 100, 350)
    const onGo = vi.fn()
    const onExit = vi.fn()
    const onOpenSubmission = vi.fn()
    renderStrom('fertig', { onGo, onExit, onOpenSubmission })

    const hero = await screen.findByTestId('strom-fertig-erstattung')
    await waitFor(() => expect(hero.textContent).toContain('400'))
    expect(screen.getByTestId('strom-uebernommen-rente').textContent).toContain('+')

    fireEvent.click(screen.getByTestId('strom-abgabe'))
    expect(onOpenSubmission).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('strom-cockpit'))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('says there is no estimate yet when none can be given, and shows a back payment as such', async () => {
    serve(PENSIONER)
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/steuerschaetzung`, () => HttpResponse.json({ kind: 'offen', missing: ['x'] }, { status: 200 })))
    renderStrom('fertig')
    const hero = await screen.findByTestId('strom-fertig-erstattung')
    expect(hero.textContent).not.toMatch(/\d/)
  })

  it.each([
    [{ from: -500, to: -400 }, 'Nachzahlung'],
    [{ from: -100, to: 300 }, 'Ergebnis'],
    [{ from: 250, to: 250 }, 'Erstattung'],
  ])('labels a result of %j', async (result, word) => {
    serve(PENSIONER)
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/steuerschaetzung`, () => HttpResponse.json({ kind: 'spanne', result, missing: [] }, { status: 200 })))
    renderStrom('fertig')
    const hero = await screen.findByTestId('strom-fertig-erstattung')
    await waitFor(() => expect(hero.textContent).toMatch(/\d/))
    expect(hero.textContent).toContain(word)
  })

  it('leads from an open step to its page', async () => {
    serve(PENSIONER)
    // The pension is genuinely still open. With the default fixture (`bestimmt`) the step only
    // looked open while `/rente` was loading and moved to „übernommen“ once it answered — the
    // click used to land in that gap.
    server.use(
      http.get(`*/v1/steuerjahre/${YEAR}/rente`, () =>
        HttpResponse.json({ kind: null, jahresbetrag: { kind: 'offen' }, rentenbeginnJahr: { kind: 'offen' }, alterBeiRentenbeginn: { kind: 'offen' }, items: [], status: { kind: 'offen' } }, { status: 200 }),
      ),
    )
    const onGo = vi.fn()
    renderStrom('fertig', { onGo })
    fireEvent.click(await screen.findByTestId('strom-offen-rente'))
    expect(onGo).toHaveBeenCalledWith({ kind: 'maske', id: 'rente' })
  })
})
