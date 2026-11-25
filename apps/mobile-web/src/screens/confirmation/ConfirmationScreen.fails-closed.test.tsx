// The WEB-28 lock over „Prüfen & bestätigen“ (P3): with every request answering 500 the screen shows a
// failure with a retry and confirms nothing.
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppI18n } from '../../i18n/app-i18n'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { ConfirmationScreen } from './ConfirmationScreen'

describe('ConfirmationScreen fails closed (WEB-28 × P3)', () => {
  it('a failed load shows a failure and sends no confirmation', async () => {
    const failing = failEveryRequest()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={createAppI18n('de')}>
          <ThemeProvider mode="light">
            <ConfirmationScreen year={2025} onBack={() => {}} onOpenScreen={() => {}} />
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    )
    await expectFailsClosed(failing)
  })
})
