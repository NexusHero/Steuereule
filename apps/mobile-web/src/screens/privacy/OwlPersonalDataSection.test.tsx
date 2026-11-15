import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { OwlPersonalDataSection } from './OwlPersonalDataSection'

const URL_PATTERN = '*/v1/eulen-modus/personendaten-einwilligung'

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <OwlPersonalDataSection />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('OwlPersonalDataSection (ADR-0091)', () => {
  it('shows "Nicht erlaubt" and offers Erlauben, which sends granted:true', async () => {
    let body: unknown = null
    server.use(
      http.put(URL_PATTERN, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })
      }),
    )
    renderSection()
    expect(await screen.findByText('Eule und persönliche Daten')).toBeTruthy()
    expect(await screen.findByText('Nicht erlaubt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Erlauben' }))
    await waitFor(() => expect(body).toEqual({ granted: true }))
  })

  it('shows the grant date and revokes with granted:false', async () => {
    let granted = true
    let body: unknown = null
    server.use(
      http.get(URL_PATTERN, () => HttpResponse.json({ granted, version: '1', grantedAt: granted ? '2026-11-14T10:00:00.000Z' : null })),
      http.put(URL_PATTERN, async ({ request }) => {
        body = await request.json()
        granted = false
        return HttpResponse.json({ granted: false, version: '1', grantedAt: null })
      }),
    )
    renderSection()
    expect(await screen.findByText(/Erlaubt seit 14\.11\.2026/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Einwilligung widerrufen' }))
    await waitFor(() => expect(body).toEqual({ granted: false }))
    expect(await screen.findByText('Nicht erlaubt')).toBeTruthy()
  })
})
