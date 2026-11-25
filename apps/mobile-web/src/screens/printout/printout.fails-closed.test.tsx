// The WEB-28 lock for the printout: the Ausdruck page and the official form (with direct entry in the expert
// mode) show a failure when every request answers 500, and nothing they offer sends a write.
import { afterEach, describe, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppI18n } from '../../i18n/app-i18n'
import { writeExpertMode } from '../../lib/expertModePreference'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import type { AcroFormPdfLoader } from './AcroFormLiveViewer'
import { OfficialFormScreen } from './OfficialFormScreen'
import { PrintoutScreen } from './PrintoutScreen'

const loader: AcroFormPdfLoader = {
  loadTemplate: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({ width: 595, height: 842, convertToViewportRectangle: (r: readonly [number, number, number, number]) => r }),
      render: () => ({ promise: Promise.resolve() }),
      getAnnotations: async () => [{ fieldName: 'anlN.kz110', rect: [233.9, 575, 350.4, 591], textAlignment: 2 }],
    }),
  }),
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">{node}</ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => writeExpertMode(false))

describe('the printout fails closed (WEB-28)', () => {
  it('Ausdruck: a failed load shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    wrap(
      <PrintoutScreen
        year={2025}
        onBack={() => {}}
        onCompleteDetails={() => {}}
        onCompleteRiester={() => {}}
        onCompleteChildren={() => {}}
        onCompleteRental={() => {}}
        onCompleteCapital={() => {}}
        onCompleteCrossBorder={() => {}}
        onConfirm={() => {}}
        openCheckout={() => {}}
      />,
    )
    await expectFailsClosed(failing)
  })

  it.each(['erfolg', 'abbruch'] as const)('Ausdruck back from the payment (%s): a failed load sends no write (P5 return states)', async (payment) => {
    const failing = failEveryRequest()
    wrap(
      <PrintoutScreen
        year={2025}
        payment={payment}
        confirmTiming={{ intervalMs: 5, timeoutMs: 30 }}
        onBack={() => {}}
        onCompleteDetails={() => {}}
        onCompleteRiester={() => {}}
        onCompleteChildren={() => {}}
        onCompleteRental={() => {}}
        onCompleteCapital={() => {}}
        onCompleteCrossBorder={() => {}}
        onConfirm={() => {}}
        openCheckout={() => {}}
      />,
    )
    await expectFailsClosed(failing)
  })

  it('official form in the expert mode: failed reads are named and no field can be written', async () => {
    writeExpertMode(true)
    const failing = failEveryRequest()
    wrap(<OfficialFormScreen taxYear={2025} initialForm="anlage-n" onBack={() => {}} acroFormLoader={loader} />)
    await expectFailsClosed(failing)
  })
})
