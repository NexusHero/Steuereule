// From the stored facts to the Vordruck field values (ADR-0050). Pure: no I/O, no rounding
// beyond what the facts already carry — a value the app does not know exactly (the
// Lohnsteuer's cents) is left empty rather than printed with a false precision.
import type { FeldWerte } from './vordruck-renderer.js'

export interface AusdruckFakten {
  profil: { firstName: string | null; lastName: string | null; steuerId: string | null; steuernummer: string | null }
  stammdaten: {
    geburtsdatum: string | null
    strasse: string | null
    hausnummer: string | null
    hausnummerZusatz: string | null
    plz: string | null
    wohnort: string | null
    beruf: string | null
    religion: string | null
    familienstand: string | null
    familienstandSeit: string | null
    iban: string | null
    kontoinhaber: string | null
    finanzamt: string | null
    telefon: string | null
  } | null
  /** LStB Bruttoarbeitslohn in whole euros as stored ("unklar" or null = not usable). */
  bruttoarbeitslohn: string | null
  /** The tax year's pension as stored (Rentenart + Jahresbetrag in whole euros), or null. */
  rente?: { rentenart: string | null; jahresbetrag: string | null } | null
  /** Facts the user recorded for verticals whose Anlage is not printable yet. */
  nochNichtDruckbar?: readonly ('anlageV' | 'anlageKap' | 'anlageNGre')[]
}

/** Anlage R line per Rentenart. Gesetzliche and Witwen-/Waisenrente go through the
 *  Besteuerungsanteil (Zeile 4) — the same table the core taxes them with; the private
 *  Rentenversicherung through the Ertragsanteil (Zeile 13). */
const RENTE_KENNZAHL: Record<string, string> = {
  GesetzlicheRente: 'anlR.kz101',
  WitwenWaisenrente: 'anlR.kz101',
  PrivateRentenversicherung: 'anlR.kz131',
}

/** Pensions that belong on a form we hold no template for. Printing the return without
 *  them would hand in an incomplete Erklärung, so the printout waits instead. */
const RENTE_ANDERER_VORDRUCK: Record<string, string> = {
  Betriebsrente: 'anlageRAvBav',
  AuslaendischeRente: 'anlageRAus',
}

export interface AusdruckWerte {
  werte: FeldWerte
  /** What the Hauptvordruck cannot do without and is still missing — the Ausdruck refuses until empty. */
  fehlend: string[]
}

const PFLICHT_STAMMDATEN = ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'] as const

const SEIT_FELD: Record<string, string> = {
  verheiratet: 'est1a.verheiratetSeit',
  verwitwet: 'est1a.verwitwetSeit',
  geschieden: 'est1a.geschiedenSeit',
  'dauernd-getrennt': 'est1a.getrenntSeit',
}

/** ISO date → TT.MM.JJJJ with the points the form's date format asks for. */
export function datumFuerVordruck(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

export function ausdruckWerte(fakten: AusdruckFakten): AusdruckWerte {
  const { profil, stammdaten: sd } = fakten
  const fehlend: string[] = []
  if (!profil.lastName) fehlend.push('name')
  if (!profil.firstName) fehlend.push('vorname')
  if (!profil.steuerId) fehlend.push('steuerId')
  for (const feld of PFLICHT_STAMMDATEN) if (!sd?.[feld]) fehlend.push(feld)
  // Married: Zeile 19 needs the Veranlagungsart and a joint return needs Person B. The app
  // collects neither yet, and ticking Einzelveranlagung for the user would be a tax
  // decision (Splitting) made silently — so the printout waits instead.
  if (sd?.familienstand === 'verheiratet') fehlend.push('ehegatte')

  const werte: Record<string, string | true> = {}
  const setze = (id: string, wert: string | null | undefined) => {
    if (wert) werte[id] = wert
  }

  werte['est1a.einkommensteuererklaerung'] = true
  setze('est1a.steuernummer', profil.steuernummer)
  setze('est1a.idnr', profil.steuerId)
  setze('est1a.name', profil.lastName)
  setze('est1a.vorname', profil.firstName)
  setze(
    'est1a.kopfSeite2',
    [profil.steuernummer, profil.lastName, profil.firstName].filter(Boolean).join(', ') || null,
  )

  if (sd) {
    setze('est1a.finanzamt', sd.finanzamt)
    setze('est1a.telefon', sd.telefon)
    setze('est1a.geburtsdatum', sd.geburtsdatum ? datumFuerVordruck(sd.geburtsdatum) : null)
    setze('est1a.religion', sd.religion)
    setze('est1a.beruf', sd.beruf)
    setze('est1a.strasse', sd.strasse)
    setze('est1a.hausnummer', sd.hausnummer)
    setze('est1a.hausnummerZusatz', sd.hausnummerZusatz)
    setze('est1a.plz', sd.plz)
    setze('est1a.wohnort', sd.wohnort)
    const seitFeld = sd.familienstand ? SEIT_FELD[sd.familienstand] : undefined
    if (seitFeld) setze(seitFeld, sd.familienstandSeit ? datumFuerVordruck(sd.familienstandSeit) : null)
    if (sd.iban?.startsWith('DE')) setze('est1a.ibanInland', sd.iban.slice(2))
    else setze('est1a.ibanAusland', sd.iban)
    if (sd.kontoinhaber) setze('est1a.kontoinhaberName', sd.kontoinhaber)
    else if (sd.iban) werte['est1a.kontoinhaberSelbst'] = true
  }

  // Anlage N only when there is something for it — a form without any entry is not handed in.
  const brutto = fakten.bruttoarbeitslohn
  if (brutto !== null && /^\d+$/.test(brutto)) {
    werte['anlN.kz110'] = brutto
    werte['anlN.personA'] = true
    setze('anlN.name', profil.lastName)
    setze('anlN.vorname', profil.firstName)
    setze('anlN.steuernummer', profil.steuernummer)
  }

  // Recorded income without a printable Anlage would make the return silently incomplete:
  // the printout waits and names which Anlage is missing.
  fehlend.push(...(fakten.nochNichtDruckbar ?? []))

  const rente = fakten.rente
  if (rente?.rentenart) {
    const andererVordruck = RENTE_ANDERER_VORDRUCK[rente.rentenart]
    if (andererVordruck) fehlend.push(andererVordruck)
    const kennzahl = RENTE_KENNZAHL[rente.rentenart]
    if (kennzahl && rente.jahresbetrag !== null && /^\d+$/.test(rente.jahresbetrag)) {
      werte[kennzahl] = rente.jahresbetrag
      werte['anlR.personA'] = true
      werte['anlR.lfdNr'] = '1'
      setze('anlR.name', profil.lastName)
      setze('anlR.vorname', profil.firstName)
      setze('anlR.steuernummer', profil.steuernummer)
    }
  }

  return { werte, fehlend }
}
