/**
 * The contract of the return trip from the payment provider (ADR-0050): the API writes it into the
 * checkout's success and cancel URLs, the app reads it from the route. Both sides import it from
 * here, so the parameter name and its values cannot drift apart again (WEB-1).
 */
export const PAYMENT_RETURN_PARAM = 'zahlung'

/** The outcomes the return URL can carry. */
export const PAYMENT_RETURN = { success: 'erfolg', cancel: 'abbruch' } as const

export type PaymentReturn = (typeof PAYMENT_RETURN)[keyof typeof PAYMENT_RETURN]

/** The route params a screen reached by the return trip carries. */
export type PaymentReturnParams = { readonly [PAYMENT_RETURN_PARAM]?: string }

/** A known outcome, or undefined for anything else (a missing, empty or tampered value). */
export function parsePaymentReturn(value: unknown): PaymentReturn | undefined {
  return value === PAYMENT_RETURN.success || value === PAYMENT_RETURN.cancel ? value : undefined
}

/** `base` with the outcome as its query parameter; `base` carries no query of its own. */
export function paymentReturnUrl(base: string, outcome: PaymentReturn): string {
  return `${base}?${PAYMENT_RETURN_PARAM}=${outcome}`
}
