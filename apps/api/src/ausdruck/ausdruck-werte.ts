// From the stored facts to the Vordruck field values (ADR-0050). Pure: no I/O, no rounding
// beyond what the facts already carry — a value the app does not know exactly (the
// Lohnsteuer's cents) is left empty rather than printed with a false precision.
import { deutschesDatum } from '@steuereule/core'
import type { FeldWerte } from './vordruck-renderer.js'

export interface PersonBFakten {
  firstName: string | null
  lastName: string | null
  steuerId: string | null
  geburtsdatum: string | null
  religion?: string | null
  beruf?: string | null
  bruttoarbeitslohn?: string | null
  rente?: { rentenart: string | null; jahresbetrag: string | null } | null
}

export interface KopplungFakten {
  veranlagungsart: 'einzel' | 'zusammen'
  personB?: PersonBFakten | null
}

export interface KindFakten {
  lfdNr?: string
  vorname: string | null
  nachname: string | null
  geburtsdatum: string | null
  idnr: string | null
  kindergeldAnspruchEur?: string | null
}

export interface VermietungFakten {
  lfdNr?: string
  strasse: string | null
  plz: string | null
  ort: string | null
  wohnflaeche: string | null
  mieteinnahmen: string | null
  afa: string | null
  werbungskosten: string | null
}

export interface KapitalFakten {
  kapitalertraege: string | null
  abzugssteuer?: string | null
  guenstigerpruefung?: boolean
}

export interface ChLohnausweisFakten {
  bruttolohnEur: string | null
  abzugssteuerEur?: string | null
  vorsorgeEur?: string | null
  nichtrueckkehrtage?: string | null
}

export interface SonderausgabenFakten {
  spenden?: string | null
}

/** Anlage AV: the contributions come from the provider; the form needs the kind of eligibility. */
export interface RiesterFakten {
  art: string | null
  /** Beitragspflichtige Einnahmen of the previous year (Zeile 5, Kz 100) — only for 'Unmittelbar'. */
  einnahmenVorjahr: string | null
}

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
  kopplung?: KopplungFakten | null
  kapital?: KapitalFakten | null
  chLohnausweis?: ChLohnausweisFakten | null
  vermietung?: readonly VermietungFakten[] | null
  kinder?: readonly KindFakten[] | null
  sonderausgaben?: SonderausgabenFakten | null
  riester?: RiesterFakten | null
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
  instanzen?: Record<string, FeldWerte[]>
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
export function ausdruckWerte(fakten: AusdruckFakten): AusdruckWerte {
  const { profil, stammdaten: sd } = fakten
  const fehlend: string[] = []
  if (!profil.lastName) fehlend.push('name')
  if (!profil.firstName) fehlend.push('vorname')
  if (!profil.steuerId) fehlend.push('steuerId')
  for (const feld of PFLICHT_STAMMDATEN) if (!sd?.[feld]) fehlend.push(feld)

  const werte: Record<string, string | true> = {}
  const instanzen: Record<string, FeldWerte[]> = {}
  const setze = (id: string, wert: string | null | undefined) => {
    if (wert) werte[id] = wert
  }

  // Married: Zeile 19 needs the Veranlagungsart and a joint return needs Person B facts.
  if (sd?.familienstand === 'verheiratet') {
    if (!fakten.kopplung) {
      fehlend.push('ehegatte')
    } else if (fakten.kopplung.veranlagungsart === 'zusammen') {
      werte['est1a.zusammenveranlagung'] = true
      const b = fakten.kopplung.personB
      if (!b || !b.lastName || !b.firstName || !b.steuerId || !b.geburtsdatum) {
        fehlend.push('personB')
      } else {
        setze('est1a.idnrB', b.steuerId)
        setze('est1a.geburtsdatumB', deutschesDatum(b.geburtsdatum))
        setze('est1a.nameB', b.lastName)
        setze('est1a.vornameB', b.firstName)
        setze('est1a.religionB', b.religion)
        setze('est1a.berufB', b.beruf)
      }
    } else if (fakten.kopplung.veranlagungsart === 'einzel') {
      werte['est1a.einzelveranlagung'] = true
    }
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
    setze('est1a.geburtsdatum', sd.geburtsdatum ? deutschesDatum(sd.geburtsdatum) : null)
    setze('est1a.religion', sd.religion)
    setze('est1a.beruf', sd.beruf)
    setze('est1a.strasse', sd.strasse)
    setze('est1a.hausnummer', sd.hausnummer)
    setze('est1a.hausnummerZusatz', sd.hausnummerZusatz)
    setze('est1a.plz', sd.plz)
    setze('est1a.wohnort', sd.wohnort)
    const seitFeld = sd.familienstand ? SEIT_FELD[sd.familienstand] : undefined
    if (seitFeld) setze(seitFeld, sd.familienstandSeit ? deutschesDatum(sd.familienstandSeit) : null)
    if (sd.iban?.startsWith('DE')) setze('est1a.ibanInland', sd.iban.slice(2))
    else setze('est1a.ibanAusland', sd.iban)
    if (sd.kontoinhaber) setze('est1a.kontoinhaberName', sd.kontoinhaber)
    else if (sd.iban) werte['est1a.kontoinhaberSelbst'] = true
  }

  // Anlage N only when there is something for it — a form without any entry is not handed in.
  const brutto = fakten.bruttoarbeitslohn
  const bruttoB = fakten.kopplung?.veranlagungsart === 'zusammen' ? fakten.kopplung.personB?.bruttoarbeitslohn ?? null : null
  const hatBruttoA = brutto !== null && /^\d+$/.test(brutto)
  const hatBruttoB = bruttoB !== null && /^\d+$/.test(bruttoB)

  if (hatBruttoA && !hatBruttoB) {
    werte['anlN.kz110'] = brutto!
    werte['anlN.personA'] = true
    setze('anlN.name', profil.lastName)
    setze('anlN.vorname', profil.firstName)
    setze('anlN.steuernummer', profil.steuernummer)
  } else if (hatBruttoB) {
    const nInstanzen: FeldWerte[] = []
    if (hatBruttoA) {
      const nA: Record<string, string | true> = { 'anlN.kz110': brutto!, 'anlN.personA': true }
      if (profil.lastName) nA['anlN.name'] = profil.lastName
      if (profil.firstName) nA['anlN.vorname'] = profil.firstName
      if (profil.steuernummer) nA['anlN.steuernummer'] = profil.steuernummer
      nInstanzen.push(nA)
    }
    const b = fakten.kopplung?.personB
    const nB: Record<string, string | true> = { 'anlN.kz110': bruttoB!, 'anlN.personB': true }
    if (b?.lastName) nB['anlN.name'] = b.lastName
    if (b?.firstName) nB['anlN.vorname'] = b.firstName
    if (profil.steuernummer) nB['anlN.steuernummer'] = profil.steuernummer
    nInstanzen.push(nB)
    instanzen['anlage-n'] = nInstanzen
  }

  const rente = fakten.rente
  const renteB = fakten.kopplung?.veranlagungsart === 'zusammen' ? fakten.kopplung.personB?.rente ?? null : null
  if (rente?.rentenart) {
    const andererVordruck = RENTE_ANDERER_VORDRUCK[rente.rentenart]
    if (andererVordruck) fehlend.push(andererVordruck)
  }
  if (renteB?.rentenart) {
    const andererVordruckB = RENTE_ANDERER_VORDRUCK[renteB.rentenart]
    if (andererVordruckB && !fehlend.includes(andererVordruckB)) fehlend.push(andererVordruckB)
  }

  const kennzahlA = rente?.rentenart ? RENTE_KENNZAHL[rente.rentenart] : undefined
  const hatRenteA = Boolean(kennzahlA && rente?.jahresbetrag !== null && rente?.jahresbetrag !== undefined && /^\d+$/.test(rente.jahresbetrag))
  const kennzahlB = renteB?.rentenart ? RENTE_KENNZAHL[renteB.rentenart] : undefined
  const hatRenteB = Boolean(kennzahlB && renteB?.jahresbetrag !== null && renteB?.jahresbetrag !== undefined && /^\d+$/.test(renteB.jahresbetrag))

  if (hatRenteA && !hatRenteB) {
    werte[kennzahlA!] = rente!.jahresbetrag!
    werte['anlR.personA'] = true
    werte['anlR.lfdNr'] = '1'
    setze('anlR.name', profil.lastName)
    setze('anlR.vorname', profil.firstName)
    setze('anlR.steuernummer', profil.steuernummer)
  } else if (hatRenteB) {
    const rInstanzen: FeldWerte[] = []
    if (hatRenteA) {
      const rA: Record<string, string | true> = {
        [kennzahlA!]: rente!.jahresbetrag!,
        'anlR.personA': true,
        'anlR.lfdNr': '1',
      }
      if (profil.lastName) rA['anlR.name'] = profil.lastName
      if (profil.firstName) rA['anlR.vorname'] = profil.firstName
      if (profil.steuernummer) rA['anlR.steuernummer'] = profil.steuernummer
      rInstanzen.push(rA)
    }
    const b = fakten.kopplung?.personB
    const rB: Record<string, string | true> = {
      [kennzahlB!]: renteB!.jahresbetrag!,
      'anlR.personB': true,
      'anlR.lfdNr': '1',
    }
    if (b?.lastName) rB['anlR.name'] = b.lastName
    if (b?.firstName) rB['anlR.vorname'] = b.firstName
    if (profil.steuernummer) rB['anlR.steuernummer'] = profil.steuernummer
    rInstanzen.push(rB)
    instanzen['anlage-r'] = rInstanzen
  }

  // Anlage KAP
  if (fakten.kapital?.kapitalertraege && /^\d+$/.test(fakten.kapital.kapitalertraege)) {
    werte['anlKap.personA'] = true
    setze('anlKap.name', profil.lastName)
    setze('anlKap.vorname', profil.firstName)
    setze('anlKap.steuernummer', profil.steuernummer)
    werte['anlKap.guenstigerpruefung'] = true
    werte['anlKap.kz210'] = fakten.kapital.kapitalertraege
    if (fakten.kapital.abzugssteuer && /^\d+$/.test(fakten.kapital.abzugssteuer)) {
      werte['anlKap.kz234'] = fakten.kapital.abzugssteuer
    }
  }

  // Anlage N-Gre (Grenzgänger Schweiz)
  if (fakten.chLohnausweis?.bruttolohnEur && /^\d+$/.test(fakten.chLohnausweis.bruttolohnEur)) {
    werte['anlNGre.personA'] = true
    setze('anlNGre.name', profil.lastName)
    setze('anlNGre.vorname', profil.firstName)
    setze('anlNGre.steuernummer', profil.steuernummer)
    werte['anlNGre.bruttolohnEur'] = fakten.chLohnausweis.bruttolohnEur
    if (fakten.chLohnausweis.abzugssteuerEur && /^\d+$/.test(fakten.chLohnausweis.abzugssteuerEur)) {
      werte['anlNGre.abzugssteuer'] = fakten.chLohnausweis.abzugssteuerEur
    }
    if (fakten.chLohnausweis.vorsorgeEur && /^\d+$/.test(fakten.chLohnausweis.vorsorgeEur)) {
      werte['anlNGre.vorsorge'] = fakten.chLohnausweis.vorsorgeEur
    }
    if (fakten.chLohnausweis.nichtrueckkehrtage && /^\d+$/.test(fakten.chLohnausweis.nichtrueckkehrtage)) {
      werte['anlNGre.nichtrueckkehrtage'] = fakten.chLohnausweis.nichtrueckkehrtage
    }
  }

  // Anlage V (Vermietung)
  if (fakten.vermietung && fakten.vermietung.length > 0) {
    instanzen['anlage-v'] = fakten.vermietung.map((obj, i) => {
      const vWerte: Record<string, string | true> = {}
      if (profil.lastName) vWerte['anlV.name'] = profil.lastName
      if (profil.firstName) vWerte['anlV.vorname'] = profil.firstName
      if (profil.steuernummer) vWerte['anlV.steuernummer'] = profil.steuernummer
      vWerte['anlV.lfdNr'] = obj.lfdNr ?? String(i + 1)
      if (obj.strasse) vWerte['anlV.strasse'] = obj.strasse
      if (obj.plz) vWerte['anlV.plz'] = obj.plz
      if (obj.ort) vWerte['anlV.ort'] = obj.ort
      if (obj.wohnflaeche) vWerte['anlV.wohnflaeche'] = obj.wohnflaeche
      if (obj.mieteinnahmen) vWerte['anlV.mieteinnahmen'] = obj.mieteinnahmen
      if (obj.afa) vWerte['anlV.afa'] = obj.afa
      if (obj.werbungskosten) vWerte['anlV.werbungskosten'] = obj.werbungskosten
      return vWerte
    })
  }

  // Anlage Kind
  if (fakten.kinder && fakten.kinder.length > 0) {
    instanzen['anlage-kind'] = fakten.kinder.map((k, i) => {
      const kWerte: Record<string, string | true> = {}
      if (profil.lastName) kWerte['anlKind.name'] = profil.lastName
      if (profil.firstName) kWerte['anlKind.vornameEltern'] = profil.firstName
      if (profil.steuernummer) kWerte['anlKind.steuernummer'] = profil.steuernummer
      kWerte['anlKind.lfdNr'] = k.lfdNr ?? String(i + 1)
      if (k.idnr) kWerte['anlKind.idnr'] = k.idnr
      if (k.vorname) kWerte['anlKind.vorname'] = k.vorname
      if (k.nachname) kWerte['anlKind.nachname'] = k.nachname
      if (k.geburtsdatum) kWerte['anlKind.geburtsdatum'] = deutschesDatum(k.geburtsdatum)
      if (k.kindergeldAnspruchEur) kWerte['anlKind.kindergeld'] = k.kindergeldAnspruchEur
      return kWerte
    })
  }

  // Anlage Sonderausgaben
  if (fakten.sonderausgaben?.spenden && /^\d+$/.test(fakten.sonderausgaben.spenden)) {
    setze('anlSo.name', profil.lastName)
    setze('anlSo.vorname', profil.firstName)
    setze('anlSo.steuernummer', profil.steuernummer)
    werte['anlSo.spenden'] = fakten.sonderausgaben.spenden
  }

  // Anlage AV (Riester): Kz 106 takes a digit, 1 = unmittelbar (then Zeile 5 is required),
  // 2 = mittelbar (Zeile 14). Without that the Anlage would be incomplete, so the printout waits.
  if (fakten.riester) {
    const { art, einnahmenVorjahr } = fakten.riester
    const unmittelbar = art === 'Unmittelbar' && einnahmenVorjahr !== null && /^\d+$/.test(einnahmenVorjahr)
    if (unmittelbar || art === 'Mittelbar') {
      setze('anlAv.name', profil.lastName)
      setze('anlAv.vorname', profil.firstName)
      setze('anlAv.steuernummer', profil.steuernummer)
      if (unmittelbar) {
        werte['anlAv.unmittelbar'] = '1'
        werte['anlAv.kz100'] = einnahmenVorjahr
      } else {
        werte['anlAv.mittelbar'] = '2'
      }
    } else {
      fehlend.push('riester')
    }
  }

  // Anlage Vorsorgeaufwand stays unprinted: the employee lines (LStB Nr. 22/23/25/26/27) are
  // ⓔ-Zeilen the Finanzamt already has, and a figure there overrides the transmitted one. The
  // interview's single KV+PV sum fits none of the form's separate lines.

  const ergebnis: AusdruckWerte = { werte, fehlend }
  if (Object.keys(instanzen).length > 0) ergebnis.instanzen = instanzen
  return ergebnis
}
