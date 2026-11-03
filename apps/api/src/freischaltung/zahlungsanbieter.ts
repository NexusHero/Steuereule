// The payment-provider port (ADR-0050). FreischaltungService depends on this, never on
// the Stripe SDK, so the unlock logic is testable without network and the provider stays
// swappable. The Stripe adapter is stripe-zahlungsanbieter.ts.

export const ZAHLUNGSANBIETER = Symbol('ZAHLUNGSANBIETER')

export interface CheckoutAnfrage {
  userId: string
  steuerjahr: number
  erfolgUrl: string
  abbruchUrl: string
}

export interface CheckoutSitzung {
  id: string
  url: string
}

/** A verified provider event, reduced to what the unlock needs. */
export type ZahlungsEreignis =
  | { art: 'bezahlt'; sitzungId: string; betragCent: number | null }
  | { art: 'ignoriert' }

export interface Zahlungsanbieter {
  erstelleCheckout(anfrage: CheckoutAnfrage): Promise<CheckoutSitzung>
  /** Verifies the signature over the raw body; throws on any mismatch. */
  verifiziereEreignis(rohdaten: Buffer, signatur: string): ZahlungsEreignis
}
