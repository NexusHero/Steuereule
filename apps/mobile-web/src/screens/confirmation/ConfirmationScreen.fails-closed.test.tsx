// The WEB-28 lock over „Prüfen & bestätigen“ (P3): with every request answering 500 the screen shows a
// failure with a retry and confirms nothing.
import { describe, it } from 'vitest'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { ConfirmationScreen } from './ConfirmationScreen'
import { renderWithQuery } from '../../test-render'

describe('ConfirmationScreen fails closed (WEB-28 × P3)', () => {
  it('a failed load shows a failure and sends no confirmation', async () => {
    const failing = failEveryRequest()
    renderWithQuery(<ConfirmationScreen year={2025} onBack={() => {}} onOpenScreen={() => {}} />)
    await expectFailsClosed(failing)
  })
})
