// The catalogue after WEB-28: a failed load writes nothing; a lost answer is said and the question comes back
// (WEB-41 / NM-06); a 500 is not called a conflict (NM-07); a failed link does not file the partner's answers
// under Person A (NM-15); a revisited amount question shows its stored amount (NM-16).
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { CatalogScreen } from './CatalogScreen'

const INTERVIEW_URL = '*/v1/steuerjahre/2026/interview'

function renderCatalog(entry: 'lebenslagen' | 'sonderausgaben' | 'gesundheit', revisit = false) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CatalogScreen entry={entry} taxYear={2026} revisit={revisit} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('Katalog fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderCatalog('sonderausgaben')
    await expectFailsClosed(failing)
  })

  it('a personal page whose link fails asks nothing, so no answer lands with the wrong person (NM-15)', async () => {
    const failing = failEveryRequest()
    renderCatalog('lebenslagen')
    await expectFailsClosed(failing)
    expect(screen.queryByTestId('katalog-fuer-wen')).toBeNull()
  })
})

describe('Katalog answers (WEB-41)', () => {
  it('says a lost answer was not saved and shows the question again', async () => {
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 1 })),
      http.post('*/v1/steuerjahre/2026/interview/antworten', () => HttpResponse.error()),
    )
    renderCatalog('sonderausgaben')
    fireEvent.click(await screen.findByTestId('katalog-option-spenden-Nein'))
    const notice = await screen.findByTestId('katalog-speichern-fehler')
    expect(notice.textContent).toContain('Keine Verbindung')
    expect(notice.textContent).toContain('nicht gespeichert')
    expect(screen.getByTestId('katalog-option-spenden-Nein')).toBeTruthy()
  })

  it('a server error is not called a conflict (NM-07)', async () => {
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 1 })),
      http.post('*/v1/steuerjahre/2026/interview/antworten', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderCatalog('sonderausgaben')
    fireEvent.click(await screen.findByTestId('katalog-option-spenden-Nein'))
    expect((await screen.findByTestId('katalog-speichern-fehler')).textContent).toContain('Bei uns ist gerade etwas schiefgelaufen')
    expect(screen.queryByText(/passte nicht zum gespeicherten Stand/)).toBeNull()
  })

  it('a German amount with thousands is read as such, an unreadable one is named', async () => {
    const posted: unknown[] = []
    server.use(
      http.get(INTERVIEW_URL, () => HttpResponse.json({ answers: { spenden: 'Ja' }, nextStep: { kind: 'question', id: 'spenden-betrag' }, openItems: 1 })),
      http.post('*/v1/steuerjahre/2026/interview/antworten', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 })
      }),
    )
    renderCatalog('sonderausgaben')
    const field = await screen.findByTestId('katalog-input-spenden-betrag')
    fireEvent.change(field, { target: { value: '1.2x' } })
    fireEvent.click(screen.getByTestId('katalog-submit-spenden-betrag'))
    expect(await screen.findByTestId('katalog-unlesbar-spenden-betrag')).toBeTruthy()
    expect(posted).toEqual([])
    fireEvent.change(field, { target: { value: '1.200' } })
    fireEvent.click(screen.getByTestId('katalog-submit-spenden-betrag'))
    await waitFor(() => expect(posted).toEqual([{ questionId: 'spenden-betrag', value: '1200' }]))
  })
})

describe('Katalog revisit (NM-16)', () => {
  it('shows the stored amount of the last answered question', async () => {
    server.use(
      http.get(INTERVIEW_URL, () =>
        HttpResponse.json({ answers: { 'gesundheit-gate': 'Ja', 'gesundheit-betrag': '900', 'gesundheit-erstattung': '120' }, nextStep: { kind: 'done' }, openItems: 0 }),
      ),
    )
    renderCatalog('gesundheit', true)
    const field = (await screen.findByTestId('katalog-input-gesundheit-erstattung')) as HTMLInputElement
    expect(field.value).toBe('120')
  })
})
