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

export type ZahlungsEreignis =
  | { art: 'bezahlt'; sitzungId: string; betragCent: number | null }
  | { art: 'ignoriert' }

export interface Zahlungsanbieter {
  erstelleCheckout(anfrage: CheckoutAnfrage): Promise<CheckoutSitzung>
  verifiziereEreignis(rohdaten: Buffer, signatur: string): ZahlungsEreignis
}
