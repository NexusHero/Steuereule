// Grenzgänger after WEB-28: a failed load writes nothing (also for the partner); an interview answer that did not
// stick is said where the question is asked again, not only felt (WEB-41 / NM-06).
import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { InterviewStateDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { CrossBorderScreen } from './CrossBorderScreen'
import { renderWithQuery } from '../../../test/test-render'

const EMPTY_INTERVIEW: InterviewStateDto = { answers: {}, nextStep: { kind: 'question', id: 'ch-wohnsitz' }, openItems: 2 }

function renderScreen(partnerName?: string) {
  return renderWithQuery(<CrossBorderScreen onDone={() => {}} taxYear={2026} {...(partnerName ? { partnerName } : {})} />)
}

describe('Grenzgänger fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderScreen()
    await expectFailsClosed(failing)
  })

  it('the same for the partner’s Swiss figures', async () => {
    const failing = failEveryRequest()
    renderScreen('Nora')
    await expectFailsClosed(failing)
  })
})

describe('Grenzgänger interview answers (WEB-41)', () => {
  it('says that a lost answer was not saved', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/interview', () => HttpResponse.json(EMPTY_INTERVIEW)),
      http.post('*/v1/steuerjahre/2026/interview/antworten', () => HttpResponse.error()),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('Deutschland'))
    const notice = await screen.findByTestId('ch-antwort-fehler')
    expect(notice.textContent).toContain('Keine Verbindung')
    expect(screen.getByText(/Wo wohnst/)).toBeTruthy()
  })

  it('names a refused answer too, and reads the true state again', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/interview', () => HttpResponse.json(EMPTY_INTERVIEW)),
      http.post('*/v1/steuerjahre/2026/interview/antworten', () => HttpResponse.json({ code: 'ANSWER_UNREACHABLE' }, { status: 409 })),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('Deutschland'))
    expect((await screen.findByTestId('ch-antwort-fehler')).textContent).toContain('passte nicht zum gespeicherten Stand')
  })
})
