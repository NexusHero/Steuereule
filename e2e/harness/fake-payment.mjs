// Paying without Stripe keys (#450 5C, D7): the API runs with PAYMENT_FAKE_PROVIDER=1 (refused in production), the
// checkout returns to the success URL at once, and the payment provider's event is delivered by the test to the real
// webhook endpoint, signed the way the fake provider checks (apps/api/src/unlock/fake-payment-provider.ts). The unlock
// table, the webhook and the app's confirmation polling all run unchanged; only Stripe itself is left out.

/** The one signature the fake provider's webhook accepts (FAKE_PAYMENT_SIGNATURE in the API). */
export const FAKE_PAYMENT_SIGNATURE = 'fake-payment-signature'

/**
 * The checkout session the fake provider opened last for a tax year and price tier ('standard' | 'selbststaendig'),
 * read from the unlock table. Fails when there is none or it is not a fake session.
 */
export function latestFakeCheckoutSession(sql, { taxYear, tier }, fail) {
  const sessionId = sql(
    `SELECT "stripeCheckoutSessionId" FROM "Freischaltung" WHERE steuerjahr = ${Number(taxYear)} AND stufe = '${tier === 'selbststaendig' ? 'selbststaendig' : 'standard'}' ORDER BY "createdAt" DESC LIMIT 1`,
  ).trim()
  if (!sessionId.startsWith('fake_cs_')) fail(`expected a fake checkout session for ${taxYear} (${tier}), got "${sessionId}"`)
  return sessionId
}

/**
 * Delivers a payment event for a checkout session to the API's webhook, as Stripe would: `kind` omitted is the paid
 * event, 'erstattet' / 'angefochten' take it back. `request` is any Playwright APIRequestContext (`page.request` or
 * a `playwright.request` context); the response is returned for the caller to check.
 */
export function deliverFakePaymentEvent(request, apiOrigin, sessionId, { kind, signature = FAKE_PAYMENT_SIGNATURE } = {}) {
  return request.post(`${apiOrigin}/v1/zahlung/stripe/webhook`, {
    data: { sessionId, ...(kind ? { kind } : {}) },
    headers: { 'stripe-signature': signature },
  })
}
