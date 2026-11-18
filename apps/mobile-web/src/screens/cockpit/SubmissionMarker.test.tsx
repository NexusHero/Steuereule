// „Ich habe die Erklärung abgegeben“ (ADR-0098, product owner decision) against the generated
// `useSubmissionController*` hooks and `POST/DELETE /v1/steuerjahre/:jahr/abgabe`, MSW-mocked to the
// contract: today is proposed, the day is sent as ISO, a wrong day or an existing Bescheid says so,
// and the filing can be withdrawn while no Bescheid exists.
import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isoDateToGerman } from '@steuereule/ui'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { todayIso } from '../shared/today'
import { SubmissionMarker, type SubmissionMarkerProps } from './SubmissionMarker'

const URL = '*/v1/steuerjahre/2025/abgabe'

function renderMarker(props: SubmissionMarkerProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderInApp(
    <QueryClientProvider client={client}>
      <SubmissionMarker {...props} />
    </QueryClientProvider>,
  )
}

describe('SubmissionMarker', () => {
  it('proposes today and marks the year as filed on that day', async () => {
    let body: unknown = null
    server.use(
      http.post(URL, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ status: 'eingereicht', submittedOn: todayIso(), replacedPrevious: false })
      }),
    )
    renderMarker({ year: 2025, submission: null })
    expect((screen.getByTestId('cockpit-abgabe-datum') as HTMLInputElement).value).toBe(isoDateToGerman(todayIso()))
    fireEvent.click(screen.getByTestId('cockpit-abgabe-abgegeben'))
    expect((await screen.findByTestId('cockpit-abgabe-marke-status')).textContent).toBe('Gespeichert: Das Jahr ist eingereicht und wartet auf den Bescheid.')
    expect(body).toEqual({ submittedOn: todayIso() })
  })

  it('sends the day the user typed, and says when it lies outside what the server accepts', async () => {
    let body: unknown = null
    server.use(
      http.post(URL, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'submittedOn' }, { status: 400 })
      }),
    )
    renderMarker({ year: 2025, submission: null })
    fireEvent.change(screen.getByTestId('cockpit-abgabe-datum'), { target: { value: '03.03.2025' } })
    fireEvent.click(screen.getByTestId('cockpit-abgabe-abgegeben'))
    expect((await screen.findByTestId('cockpit-abgabe-marke-status')).textContent).toBe('Das Datum muss nach dem Ende von 2025 liegen und darf nicht in der Zukunft sein.')
    expect(body).toEqual({ submittedOn: '2025-03-03' })
  })

  it('does not send an incomplete date', async () => {
    renderMarker({ year: 2025, submission: null })
    fireEvent.change(screen.getByTestId('cockpit-abgabe-datum'), { target: { value: '03.0' } })
    fireEvent.click(screen.getByTestId('cockpit-abgabe-abgegeben'))
    expect((await screen.findByTestId('cockpit-abgabe-marke-status')).textContent).toBe('Bitte ein vollständiges Datum eintragen (TT.MM.JJJJ).')
  })

  it('shows a filed year as waiting for its Bescheid and withdraws it', async () => {
    let deleted = false
    server.use(
      http.delete(URL, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderMarker({ year: 2025, submission: { status: 'eingereicht', submittedOn: '2026-03-10', withdrawable: true } })
    expect(screen.getByTestId('cockpit-abgabe-marke-stand').textContent).toBe('Eingereicht am 10.03.2026 · wartet auf Bescheid')
    fireEvent.click(screen.getByTestId('cockpit-abgabe-zuruecknehmen'))
    expect((await screen.findByTestId('cockpit-abgabe-marke-status')).textContent).toBe('Die Abgabe ist zurückgenommen; das Jahr ist wieder offen.')
    expect(deleted).toBe(true)
  })

  it('keeps the filing once a Bescheid exists, and offers no withdrawal then', async () => {
    server.use(http.delete(URL, () => HttpResponse.json({ code: 'SUBMISSION_HAS_ASSESSMENT' }, { status: 409 })))
    const { unmount } = renderMarker({ year: 2025, submission: { status: 'eingereicht', submittedOn: '2026-03-10', withdrawable: true } })
    fireEvent.click(screen.getByTestId('cockpit-abgabe-zuruecknehmen'))
    expect((await screen.findByTestId('cockpit-abgabe-marke-status')).textContent).toBe('Es ist schon ein Bescheid erfasst; die Abgabe bleibt bestehen.')
    unmount()
    renderMarker({ year: 2025, submission: { status: 'bescheid', submittedOn: '2026-03-10', withdrawable: false } })
    expect(screen.getByTestId('cockpit-abgabe-marke-stand').textContent).toBe('Eingereicht am 10.03.2026 · Bescheid erfasst')
    expect(screen.queryByTestId('cockpit-abgabe-zuruecknehmen')).toBeNull()
  })
})
