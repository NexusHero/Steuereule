// The Strom screen decides where each page leads (ADR-0089): the next step is worked out from the
// fresh answers after a save, and an unknown address continues where the user left off.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Answers } from '@steuereule/core'
import { server } from '../../test-msw-server'
import { StromScreen } from './StromScreen'
import type { StromStep } from './stromPlan'
import { renderWithQuery } from '../../test-render'

const YEAR = 2025
const BASIS: Answers = { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

function serve(initial: Answers) {
  let answers: Answers = { ...initial }
  server.use(
    http.get(`*/v1/steuerjahre/${YEAR}/interview`, () =>
      HttpResponse.json({ answers, nextStep: answers.familienstand === 'Verheiratet' && answers['partner-job'] === undefined ? { kind: 'question', id: 'partner-job' } : { kind: 'done' }, openItems: 0 }, { status: 200 }),
    ),
    http.get(`*/v1/steuerjahre/${YEAR - 1}/interview`, () => HttpResponse.json({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
    http.post(`*/v1/steuerjahre/${YEAR}/interview/antworten`, async ({ request }) => {
      const body = (await request.json()) as { questionId: string; value: string }
      answers = { ...answers, [body.questionId]: body.value }
      return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
    }),
    http.get(`*/v1/steuerjahre/${YEAR}/rente`, () => HttpResponse.json({ status: { kind: 'bestimmt' } }, { status: 200 })),
  )
}

function renderStrom(slug: string | undefined, onGo: (step: StromStep) => void) {
  return renderWithQuery(<StromScreen taxYear={YEAR} slug={slug} isSignedIn onGo={onGo} onExit={() => {}} onOpenSubmission={() => {}} onGuestBasisDone={() => {}} />)
}

describe('StromScreen', () => {
  it('after the selection, leads to the first chosen topic — read from the saved answers', async () => {
    serve(BASIS)
    const onGo = vi.fn()
    renderStrom('auswahl', onGo)
    fireEvent.click(await screen.findByTestId('strom-thema-spenden'))
    fireEvent.click(screen.getByTestId('strom-weiter'))
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: 'thema', id: 'spenden' }))
  })

  it('an unknown address continues at the first open step', async () => {
    serve(BASIS)
    const onGo = vi.fn()
    renderStrom('weiter', onGo)
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: 'auswahl' }))
  })

  it('a later step opened before the basis is complete leads to the basis page', async () => {
    // Married, but what the partner does is not answered yet: the basis is still open.
    serve({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
    const onGo = vi.fn()
    renderStrom('arbeitsweg', onGo)
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: 'basis' }))
  })

  it('shows the step count and a way out on every page', async () => {
    serve(BASIS)
    renderStrom('auswahl', () => {})
    expect(await screen.findByTestId('strom-position')).toBeTruthy()
    expect(screen.getByTestId('strom-pause')).toBeTruthy()
  })

  it('names the first step without a total while the basis is unanswered, with the total once it is saved', async () => {
    serve({})
    const first = renderStrom('basis', () => {})
    expect((await screen.findByTestId('strom-position')).textContent).toBe('Schritt 1')
    first.unmount()

    serve(BASIS)
    renderStrom('basis', () => {})
    await waitFor(() => expect(screen.getByTestId('strom-position').textContent).toMatch(/^Schritt 1 von \d+$/))
  })

  it('a married pensioner names Person B on the partner page, which saves B and leads on to the own masks first (Echtdatentest 18.11.2026)', async () => {
    serve({ ...BASIS, familienstand: 'Verheiratet', 'partner-job': 'Rente' })
    let personB: Record<string, unknown> | null = null
    server.use(
      http.get(`*/v1/steuerjahre/${YEAR}/kopplung`, () => HttpResponse.json({ filingType: 'zusammen', personBHasOwnAccount: false, ...(personB ? { personB } : {}) }, { status: 200 })),
      http.put(`*/v1/steuerjahre/${YEAR}/kopplung/person-b`, async ({ request }) => {
        personB = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ filingType: 'zusammen', personBHasOwnAccount: false, personB }, { status: 200 })
      }),
      http.get(`*/v1/steuerjahre/${YEAR}/rente`, ({ request }) => HttpResponse.json({ status: { kind: new URL(request.url).searchParams.get('person') === 'B' ? 'offen' : 'bestimmt' } }, { status: 200 })),
    )
    const onGo = vi.fn()
    renderStrom('partner', onGo)
    fireEvent.click(await screen.findByTestId('strom-weiter'))
    expect(await screen.findByTestId('strom-partner-fehler')).toBeTruthy()
    fireEvent.change(screen.getByTestId('strom-partner-vorname'), { target: { value: 'Büsra' } })
    fireEvent.change(screen.getByTestId('strom-partner-geburtsdatum'), { target: { value: '17.10.1991' } })
    fireEvent.click(screen.getByTestId('strom-weiter'))
    await waitFor(() => expect(personB).toMatchObject({ firstName: 'Büsra', geburtsdatum: '1991-10-17' }))
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: 'maske', id: 'rente' }))
  })

  it('after the basis of a married couple, waits for Person B before it moves on — the partner page comes next (Echtdatentest 18.11.2026)', async () => {
    serve({ ...BASIS, familienstand: 'Verheiratet', 'partner-job': 'Rente' })
    server.use(
      // The link answers late, as right after the basis has created the joint return.
      http.get(`*/v1/steuerjahre/${YEAR}/kopplung`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        return HttpResponse.json({ filingType: 'zusammen', personBHasOwnAccount: false }, { status: 200 })
      }),
      http.get(`*/v1/steuerjahre/${YEAR}/rente`, () => HttpResponse.json({ status: { kind: 'offen' } }, { status: 200 })),
    )
    const onGo = vi.fn()
    renderStrom('basis', onGo)
    fireEvent.click(await screen.findByTestId('strom-weiter'))
    await waitFor(() => expect(onGo).toHaveBeenCalled(), { timeout: 3000 })
    expect(onGo).toHaveBeenCalledWith({ kind: 'partner' })
    expect(onGo).not.toHaveBeenCalledWith({ kind: 'maske', id: 'rente' })
  })
})
