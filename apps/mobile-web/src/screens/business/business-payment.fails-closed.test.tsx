// The WEB-28 lock over the pages P5 changed: ELSTER (with the return trip from the payment) and Freischalten.
// Every request answers 500; the pages show a failure (or P5's honest "being confirmed" while the unlock is
// polled) and send no write built from stored data.
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { expectFailsClosed, expectFailureShown, failEveryRequest, pokeEverything } from '../../../test/test-every-query-fails'
import { renderBusiness } from './businessTestKit'

describe('the payment pages of the self-employed area fail closed (WEB-28 × P5)', () => {
  it.each([undefined, 'abbruch'] as const)('ELSTER (return: %s): a failed load shows a failure and sends no write', async (payment) => {
    const failing = failEveryRequest()
    renderBusiness('elster', { onChangeBusiness: () => {}, onChangePerson: () => {}, ...(payment ? { payment } : {}) })
    await expectFailsClosed(failing)
  })

  it('ELSTER back from a successful payment: while the unlock cannot be read it says it is being confirmed, and sends nothing', async () => {
    const failing = failEveryRequest()
    renderBusiness('elster', { onChangeBusiness: () => {}, onChangePerson: () => {}, payment: 'erfolg' })
    expect(await screen.findByTestId('elster-zahlung-wird-bestaetigt')).toBeTruthy()
    expect(screen.queryByTestId('elster-nicht-freigeschaltet')).toBeNull()
    await pokeEverything()
    expect(failing.writes()).toEqual([])
  })

  it('Freischalten: a refused checkout is shown, and the checkout the user pressed is the only write', async () => {
    const failing = failEveryRequest()
    renderBusiness('freischalten', { onChangeBusiness: () => {}, onChangePerson: () => {} })
    await screen.findByTestId('checkout-selbststaendig')
    await pokeEverything()
    await expectFailureShown()
    // The checkout carries no stored data: pressing „Freischalten“ is the user's own request to pay.
    expect(failing.writes().filter((line) => !/^POST .*\/checkout$/.test(line))).toEqual([])
  })
})
