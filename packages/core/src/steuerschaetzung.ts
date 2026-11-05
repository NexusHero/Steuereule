import { incomeTax, isSupportedIncomeTaxYear, soliFreigrenzen, solidaritaetszuschlag } from './tarif'

export interface Spanne {
  readonly von: number
  readonly bis: number
}

export type Steuerschaetzung =
  | {
      readonly kind: 'spanne'
      readonly werbungskosten: number
      readonly vorsorge: Spanne
      readonly sonderausgaben: number
      readonly zuVersteuerndesEinkommen: Spanne
      readonly einkommensteuer: Spanne
      readonly solidaritaetszuschlag: Spanne
      readonly anrechnung: number
      /** Positive = Erstattung, negative = Nachzahlung. */
      readonly ergebnis: Spanne
    }
  | { readonly kind: 'nicht-moeglich'; readonly grund: 'jahr-ohne-tarif' }

export interface AngestelltEingaben {
  readonly jahr: number
  readonly bruttoarbeitslohn: number
  readonly lohnsteuer: number
  readonly sozialversicherung: number
  readonly pendlerpauschale: number
  readonly weitereWerbungskosten: number
  readonly spenden: number
  readonly selbstGezahlteKvPv: number
}

/** The EUR lines of the Anlage N-Gre (anlageNGreBetraege) plus what the user pays outside the salary. */
export interface GrenzgaengerEingaben {
  readonly jahr: number
  /** Z. 23: Arbeitslohn after Familienzulagen. */
  readonly arbeitslohnEur: number
  /** Z. 25: creditable Swiss withholding tax, at most 4.5 %. */
  readonly quellensteuerEur: number
  /** Z. 85: employee AHV/IV plus Pensionskasse Obligatorium — treated like gesetzliche Rentenversicherung. */
  readonly altersvorsorgeEur: number
  /** Z. 82: EO, ALV, Krankentaggeld and half the NBUV — sonstige Vorsorgeaufwendungen. */
  readonly sonstigeVorsorgeEur: number
  /** Basic health and care insurance paid outside the salary (Swiss Krankenkasse, German KV/PV). */
  readonly krankenversicherungEur: number
  readonly pendlerpauschale: number
  readonly spenden: number
}

const ARBEITNEHMER_PAUSCHBETRAG = 1230
const SONDERAUSGABEN_PAUSCHBETRAG = 36

/**
 * Deductible share of the employee's social security contributions (RV fully, KV less 4 % for Krankengeld, PV
 * fully, AV absorbed by the Höchstbetrag): 91–93 % depending on Zusatzbeitrag and Kinderlosenzuschlag.
 */
const SV_ABZIEHBAR: Spanne = { von: 0.91, bis: 0.93 }

/** § 10 Abs. 4 EStG for someone who pays their health insurance entirely themselves, as a Grenzgänger does. */
const HOECHSTBETRAG_SONSTIGE_VORSORGE = 2800

/** A ranged estimate of the Einkommensteuer for one single Angestellte — never a point value (product ADR-015). */
export function steuerschaetzungAngestellt(e: AngestelltEingaben): Steuerschaetzung {
  if (!isSupportedIncomeTaxYear(e.jahr)) return { kind: 'nicht-moeglich', grund: 'jahr-ohne-tarif' }
  const vorsorge = {
    von: Math.round(e.sozialversicherung * SV_ABZIEHBAR.von) + e.selbstGezahlteKvPv,
    bis: Math.round(e.sozialversicherung * SV_ABZIEHBAR.bis) + e.selbstGezahlteKvPv,
  }
  const werbungskosten = Math.max(ARBEITNEHMER_PAUSCHBETRAG, e.pendlerpauschale + e.weitereWerbungskosten)
  return schaetzung({
    jahr: e.jahr,
    einnahmen: e.bruttoarbeitslohn,
    werbungskosten,
    vorsorge,
    spenden: e.spenden,
    bereitsGezahlt: (est) => e.lohnsteuer - est + soli(e.lohnsteuer, e.jahr),
    anrechnung: e.lohnsteuer,
  })
}

/** A ranged estimate for a Grenzgänger CH: German tax against the creditable Swiss withholding tax (Art. 15a DBA). */
export function steuerschaetzungGrenzgaenger(e: GrenzgaengerEingaben): Steuerschaetzung {
  if (!isSupportedIncomeTaxYear(e.jahr)) return { kind: 'nicht-moeglich', grund: 'jahr-ohne-tarif' }
  const sonstigeAbziehbar = Math.max(e.krankenversicherungEur, Math.min(HOECHSTBETRAG_SONSTIGE_VORSORGE, e.krankenversicherungEur + e.sonstigeVorsorgeEur))
  const vorsorge = {
    von: e.altersvorsorgeEur + e.krankenversicherungEur,
    bis: e.altersvorsorgeEur + sonstigeAbziehbar,
  }
  return schaetzung({
    jahr: e.jahr,
    einnahmen: e.arbeitslohnEur,
    werbungskosten: Math.max(ARBEITNEHMER_PAUSCHBETRAG, e.pendlerpauschale),
    vorsorge,
    spenden: e.spenden,
    bereitsGezahlt: (est) => e.quellensteuerEur - est,
    anrechnung: e.quellensteuerEur,
  })
}

function schaetzung(input: {
  readonly jahr: number
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly vorsorge: Spanne
  readonly spenden: number
  readonly bereitsGezahlt: (einkommensteuer: number) => number
  readonly anrechnung: number
}): Steuerschaetzung {
  const sonderausgaben = Math.max(SONDERAUSGABEN_PAUSCHBETRAG, input.spenden)
  const zve = (vorsorge: number) => Math.max(0, input.einnahmen - input.werbungskosten - vorsorge - sonderausgaben)
  const zuVersteuerndesEinkommen = { von: zve(input.vorsorge.bis), bis: zve(input.vorsorge.von) }
  const einkommensteuer = {
    von: incomeTax(zuVersteuerndesEinkommen.von, input.jahr),
    bis: incomeTax(zuVersteuerndesEinkommen.bis, input.jahr),
  }
  const soliSpanne = { von: soli(einkommensteuer.von, input.jahr), bis: soli(einkommensteuer.bis, input.jahr) }
  return {
    kind: 'spanne',
    werbungskosten: input.werbungskosten,
    vorsorge: input.vorsorge,
    sonderausgaben,
    zuVersteuerndesEinkommen,
    einkommensteuer,
    solidaritaetszuschlag: soliSpanne,
    anrechnung: input.anrechnung,
    ergebnis: {
      von: input.bereitsGezahlt(einkommensteuer.bis) - soliSpanne.bis,
      bis: input.bereitsGezahlt(einkommensteuer.von) - soliSpanne.von,
    },
  }
}

function soli(einkommensteuer: number, jahr: number): number {
  if (!isSupportedIncomeTaxYear(jahr)) return 0
  return solidaritaetszuschlag(einkommensteuer, soliFreigrenzen(jahr).einzel)
}
