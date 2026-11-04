export type LstbFeldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

export type LstbFeldZustand =
  | { readonly kind: 'erfasst'; readonly wert: number }
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }

export interface LstbDaten {
  readonly bruttoarbeitslohn: LstbFeldZustand
  readonly lohnsteuer: LstbFeldZustand
  readonly sozialversicherung: LstbFeldZustand
}

export const LEERES_LSTB: LstbDaten = {
  bruttoarbeitslohn: { kind: 'offen' },
  lohnsteuer: { kind: 'offen' },
  sozialversicherung: { kind: 'offen' },
}

export function istGueltigerBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function setzeLstbFeld(daten: LstbDaten, feld: LstbFeldId, zustand: LstbFeldZustand): LstbDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerBetrag(zustand.wert)) {
    throw new RangeError(`lstb: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

export type LstbWiderspruch =
  | { readonly art: 'lohnsteuer-uebersteigt-brutto'; readonly lohnsteuer: number; readonly bruttoarbeitslohn: number }
  | {
      readonly art: 'sozialversicherung-uebersteigt-brutto'
      readonly sozialversicherung: number
      readonly bruttoarbeitslohn: number
    }

export type LstbZustand =
  | { readonly kind: 'unvollstaendig'; readonly offen: readonly LstbFeldId[]; readonly unklar: readonly LstbFeldId[] }
  | { readonly kind: 'widerspruch'; readonly widersprueche: readonly LstbWiderspruch[] }
  | {
      readonly kind: 'vollstaendig'
      readonly bruttoarbeitslohn: number
      readonly lohnsteuer: number
      readonly sozialversicherung: number
    }

export const LSTB_FELDER: readonly LstbFeldId[] = ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']

function widersprueche(daten: LstbDaten): readonly LstbWiderspruch[] {
  const brutto = (daten.bruttoarbeitslohn as { kind: 'erfasst'; wert: number }).wert
  const lohnsteuer = (daten.lohnsteuer as { kind: 'erfasst'; wert: number }).wert
  const sozialversicherung = (daten.sozialversicherung as { kind: 'erfasst'; wert: number }).wert

  const result: LstbWiderspruch[] = []
  if (lohnsteuer > brutto) {
    result.push({ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer, bruttoarbeitslohn: brutto })
  }
  if (sozialversicherung > brutto) {
    result.push({ art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung, bruttoarbeitslohn: brutto })
  }
  return result
}

export function lstbZustand(daten: LstbDaten): LstbZustand {
  const offen: LstbFeldId[] = []
  const unklar: LstbFeldId[] = []
  let alleErfasst = true

  for (const feld of LSTB_FELDER) {
    const zustand = daten[feld]
    if (zustand.kind === 'offen') {
      alleErfasst = false
      offen.push(feld)
    } else if (zustand.kind === 'unklar') {
      alleErfasst = false
      unklar.push(feld)
    }
  }

  if (!alleErfasst) return { kind: 'unvollstaendig', offen, unklar }

  const brutto = (daten.bruttoarbeitslohn as { kind: 'erfasst'; wert: number }).wert
  const lohnsteuer = (daten.lohnsteuer as { kind: 'erfasst'; wert: number }).wert
  const sozialversicherung = (daten.sozialversicherung as { kind: 'erfasst'; wert: number }).wert
  const widerspr = widersprueche(daten)
  if (widerspr.length > 0) return { kind: 'widerspruch', widersprueche: widerspr }

  return { kind: 'vollstaendig', bruttoarbeitslohn: brutto, lohnsteuer, sozialversicherung }
}

export const LSTB_UNKLAR = 'unklar'

export function serialisiereLstbFeld(zustand: LstbFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return LSTB_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

export function deserialisiereLstbFeld(value: string | null): LstbFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === LSTB_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerBetrag(wert)) {
    throw new Error(`lstb: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return { kind: 'erfasst', wert }
}
