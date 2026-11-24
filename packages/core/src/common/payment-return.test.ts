import { describe, expect, it } from 'vitest'
import { PAYMENT_RETURN, PAYMENT_RETURN_PARAM, parsePaymentReturn, paymentReturnUrl } from './payment-return'

describe('payment return contract (WEB-1)', () => {
  it('builds a URL whose query the reader understands', () => {
    const url = new URL(paymentReturnUrl('https://app.example/app/steuerjahr/2025/ausdruck', PAYMENT_RETURN.success))
    expect(parsePaymentReturn(url.searchParams.get(PAYMENT_RETURN_PARAM))).toBe('erfolg')
    const cancel = new URL(paymentReturnUrl('https://app.example/x', PAYMENT_RETURN.cancel))
    expect(parsePaymentReturn(cancel.searchParams.get(PAYMENT_RETURN_PARAM))).toBe('abbruch')
  })

  it('anything else is no outcome', () => {
    for (const value of [undefined, null, '', 'ERFOLG', 'success', 1]) expect(parsePaymentReturn(value)).toBeUndefined()
  })
})
