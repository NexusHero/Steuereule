// The interview after WEB-28: a failed load writes nothing; the last answer moves on only once it is stored, and a
// failure of it is said with its reason (WEB-41 / NM-06, NM-07).
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { InterviewScreen } from './InterviewScreen'

function renderInterview(onDone: () => void = () => {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <InterviewScreen taxYear={2026} onDone={onDone} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('Interview fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderInterview()
    await expectFailsClosed(failing)
  })

  it('does not move on when the last answer is refused, and says why (NM-06)', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/interview', () =>
        HttpResponse.json({ answers: { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' }, nextStep: { kind: 'question', id: 'familienstand' }, openItems: 1 }),
      ),
      http.post('*/v1/steuerjahre/2026/interview/antworten', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    const onDone = vi.fn()
    renderInterview(onDone)
    fireEvent.click(await screen.findByText('Ledig'))
    const notice = await screen.findByTestId('post-error-failed')
    expect(notice.textContent).toContain('Bei uns ist gerade etwas schiefgelaufen')
    expect(screen.getByText('Ledig')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})
