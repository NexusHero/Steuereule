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

export interface GrenzgaengerEingaben {
  readonly jahr: number
  readonly einnahmenEur: number
  readonly quellensteuerEur: number
  readonly ahvEur: number
  readonly pensionskasseEur: number
  readonly krankenkasseEur: number
  readonly selbstGezahlteKvPv: number
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

/** Ziffer 9 mixes AHV/IV/EO (Altersvorsorge) with ALV and NBUV (sonstige Vorsorge, usually absorbed). */
const AHV_ABZIEHBAR: Spanne = { von: 0.72, bis: 1 }

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
  const fest = e.pensionskasseEur + e.krankenkasseEur + e.selbstGezahlteKvPv
  const vorsorge = {
    von: fest + Math.round(e.ahvEur * AHV_ABZIEHBAR.von),
    bis: fest + Math.round(e.ahvEur * AHV_ABZIEHBAR.bis),
  }
  const werbungskosten = Math.max(ARBEITNEHMER_PAUSCHBETRAG, e.pendlerpauschale)
  return schaetzung({
    jahr: e.jahr,
    einnahmen: e.einnahmenEur,
    werbungskosten,
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
  const solidaritaetszuschlag = { von: soli(einkommensteuer.von, input.jahr), bis: soli(einkommensteuer.bis, input.jahr) }
  return {
    kind: 'spanne',
    werbungskosten: input.werbungskosten,
    vorsorge: input.vorsorge,
    sonderausgaben,
    zuVersteuerndesEinkommen,
    einkommensteuer,
    solidaritaetszuschlag,
    anrechnung: input.anrechnung,
    ergebnis: {
      von: input.bereitsGezahlt(einkommensteuer.bis) - solidaritaetszuschlag.bis,
      bis: input.bereitsGezahlt(einkommensteuer.von) - solidaritaetszuschlag.von,
    },
  }
}

function soli(einkommensteuer: number, jahr: number): number {
  if (!isSupportedIncomeTaxYear(jahr)) return 0
  return solidaritaetszuschlag(einkommensteuer, soliFreigrenzen(jahr).einzel)
}
