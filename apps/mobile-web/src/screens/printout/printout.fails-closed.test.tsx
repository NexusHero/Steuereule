// The WEB-28 lock for the printout: the Ausdruck page and the official form (with direct entry in the expert
// mode) show a failure when every request answers 500, and nothing they offer sends a write.
import { afterEach, describe, it, vi } from 'vitest'
import { writeExpertMode } from '../../lib/expertModePreference'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { manualPaymentClock } from '../../../test/test-payment-clock'
import { PaymentClockProvider } from '../shared/usePaymentConfirmation'
import type { AcroFormPdfLoader } from './AcroFormLiveViewer'
import { OfficialFormScreen } from './OfficialFormScreen'
import { PrintoutScreen } from './PrintoutScreen'
import { renderWithQuery } from '../../../test/test-render'

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

afterEach(() => writeExpertMode(false))

describe('the printout fails closed (WEB-28)', () => {
  it('Ausdruck: a failed load shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderWithQuery(
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
    const clock = manualPaymentClock()
    renderWithQuery(
      <PaymentClockProvider value={clock}>
        <PrintoutScreen
          year={2025}
          payment={payment}
          onBack={() => {}}
          onCompleteDetails={() => {}}
          onCompleteRiester={() => {}}
          onCompleteChildren={() => {}}
          onCompleteRental={() => {}}
          onCompleteCapital={() => {}}
          onCompleteCrossBorder={() => {}}
          onConfirm={() => {}}
          openCheckout={() => {}}
        />
      </PaymentClockProvider>,
    )
    // While the confirmation window is open (it polls a status that keeps failing) ...
    await expectFailsClosed(failing)
    clock.poll()
    // ... and after it ran out, where the page offers to check again.
    clock.expire()
    await expectFailsClosed(failing)
  })

  it('official form in the expert mode: failed reads are named and no field can be written', async () => {
    writeExpertMode(true)
    const failing = failEveryRequest()
    renderWithQuery(<OfficialFormScreen taxYear={2025} initialForm="anlage-n" onBack={() => {}} acroFormLoader={loader} />)
    await expectFailsClosed(failing)
  })
})
