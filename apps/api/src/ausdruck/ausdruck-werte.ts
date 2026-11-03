// From the stored facts to the Vordruck field values (ADR-0050). Pure: no I/O, no rounding
// beyond what the facts already carry — a value the app does not know exactly (the
// Lohnsteuer's cents) is left empty rather than printed with a false precision.
import {
  afaSatzProzent,
  deutschesDatum,
  kapitalPflichtfelder,
  type KapitalDepotEinordnung,
  type KapitalFeldId,
} from '@steuereule/core'
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
  kindschaftsverhaeltnis?: string | null
  kindschaftsverhaeltnisB?: string | null
  familienkasse?: string | null
  wohnsitzInlandGanzjaehrig?: boolean | null
  andererElternteil?: string | null
  andererElternteilName?: string | null
  andererElternteilGeburtsdatum?: string | null
  andererElternteilAdresse?: string | null
  andererElternteilArt?: string | null
  andererElternteilVerstorbenAm?: string | null
  gemeldetBeiMirGanzjaehrig?: boolean | null
  kindergeldAnMichGanzjaehrig?: boolean | null
}

/** Anlage Kind Zeilen 47/48 — answered once per year in the interview. */
export interface AlleinerziehendFakten {
  weiterePerson: string | null
  haushaltsgemeinschaft: string | null
}

/** Zeilen 11–15 are for a parent outside this return — anyone but a joint return of both parents. */
function brauchtAnderenElternteil(k: KindFakten, zusammen: boolean): boolean {
  return !zusammen || !k.kindschaftsverhaeltnisB
}

function andererElternteilLuecke(k: KindFakten): string | null {
  const bekannt = Boolean(k.andererElternteilName && k.andererElternteilGeburtsdatum && k.andererElternteilArt)
  switch (k.andererElternteil) {
    case 'Unbekannt':
      return null
    case 'Ausland':
      return 'anlageKindAndererElternteilAusland'
    case 'Inland':
      return bekannt && k.andererElternteilAdresse ? null : 'kinder'
    case 'Verstorben':
      return bekannt && k.andererElternteilVerstorbenAm ? null : 'kinder'
    default:
      return 'kinder'
  }
}

/**
 * Why a child's Anlage Kind cannot be printed, or null. Missing details are the user's to add
 * ('kinder'); the rest are cases this printout does not cover yet: a child of age (Zeilen 16 ff.),
 * a home abroad (Zeile 9) and the other parent abroad (Zeile 13).
 */
function kindLuecke(k: KindFakten, steuerjahr: number, zusammen: boolean): string | null {
  if (!k.idnr || !k.kindschaftsverhaeltnis || !k.familienkasse || k.wohnsitzInlandGanzjaehrig == null) return 'kinder'
  if (!k.wohnsitzInlandGanzjaehrig) return 'anlageKindAusland'
  if (k.geburtsdatum && Number(k.geburtsdatum.slice(0, 4)) <= steuerjahr - 18) return 'anlageKindVolljaehrig'
  return brauchtAnderenElternteil(k, zusammen) ? andererElternteilLuecke(k) : null
}

export interface VermietungFakten {
  lfdNr?: string
  strasse: string | null
  plz: string | null
  ort: string | null
  wohnflaeche: string | null
  mieteinnahmen: string | null
  /** Building cost and year of completion — the AfA base (§ 7 Abs. 4 EStG). */
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  afaWieVorjahr: boolean | null
}

const ganzeZahl = (wert: string | null): number | null => (wert !== null && /^\d+$/.test(wert) ? Number(wert) : null)

/** Why an Anlage V cannot be printed, or null ('unklar' is the mask's "unreadable"). */
function vermietungLuecke(obj: VermietungFakten): string | null {
  const unklar = [obj.mieteinnahmen, obj.werbungskosten, obj.anschaffungskosten, obj.baujahr].includes('unklar')
  if (unklar || ganzeZahl(obj.mieteinnahmen) === null || ganzeZahl(obj.werbungskosten) === null) return 'vermietung'
  if (!obj.strasse || !obj.plz || !obj.ort) return 'vermietung'
  if (vermietungAfa(obj) === null) return null
  if (obj.afaWieVorjahr === null) return 'vermietung'
  return obj.afaWieVorjahr ? null : 'anlageVAfaNeu'
}

function vermietungAfa(obj: VermietungFakten): { satz: number; betrag: number } | null {
  const kosten = ganzeZahl(obj.anschaffungskosten)
  const baujahr = ganzeZahl(obj.baujahr)
  if (kosten === null || baujahr === null) return null
  const satz = afaSatzProzent(baujahr)
  return satz === null ? null : { satz, betrag: Math.round((kosten * satz) / 100) }
}

/** The Kapital facts as stored, plus the depot answer that decides the KAP line (ADR-032). */
export type KapitalFakten = { depot: KapitalDepotEinordnung['kind'] } & Partial<Record<KapitalFeldId, string | null>>

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
  steuerjahr: number
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
  alleinerziehend?: AlleinerziehendFakten | null
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

  // Anlage KAP: a German broker's income sits in Zeile 7 with the withheld taxes to credit
  // (Zeilen 37–39, EUR/Ct); a foreign broker's in Zeile 19, where nothing was withheld.
  const kapital = fakten.kapital
  if (kapital && kapital.kapitalertraege != null) {
    const pflicht = kapitalPflichtfelder(kapital.depot)
    const vollstaendig = pflicht.every((feld) => ganzeZahl(kapital[feld] ?? null) !== null)
    if (kapital.depot === 'krypto') fehlend.push('anlageKapKrypto')
    else if (kapital.depot === 'unbekannt' || !vollstaendig) fehlend.push('kapital')
    else {
      werte['anlKap.personA'] = true
      setze('anlKap.name', profil.lastName)
      setze('anlKap.vorname', profil.firstName)
      setze('anlKap.steuernummer', profil.steuernummer)
      werte['anlKap.guenstigerpruefung'] = '1'
      if (kapital.depot === 'deutscher-broker') {
        werte['anlKap.kz210'] = kapital.kapitalertraege
        werte['anlKap.kz217'] = kapital.sparerPauschbetrag!
        werte['anlKap.kz280'] = `${kapital.kapitalertragsteuer},00`
        werte['anlKap.kz281'] = `${kapital.solidaritaetszuschlag},00`
        werte['anlKap.kz282'] = `${kapital.kirchensteuer},00`
      } else {
        werte['anlKap.kz234'] = kapital.kapitalertraege
        werte['anlKap.kz217'] = '0'
        werte['anlKap.kz218'] = kapital.sparerPauschbetrag!
      }
    }
  }

  // Anlage N-Gre (Grenzgänger Schweiz) is not printable yet: the form needs the country key
  // (Kz 117), the taxable wage after Zeilen 7–22 (Kz 116), the employer (Zeilen 89–91) and the
  // split of the Swiss social contributions (Zeilen 75–88), none of which is captured.
  if (fakten.chLohnausweis?.bruttolohnEur) fehlend.push('anlageNGre')

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
      if (obj.wohnflaeche) {
        vWerte['anlV.wohnflaeche'] = obj.wohnflaeche
        vWerte['anlV.z13Wohnflaeche'] = obj.wohnflaeche
      }
      const miete = ganzeZahl(obj.mieteinnahmen)
      const laufend = ganzeZahl(obj.werbungskosten)
      if (miete === null || laufend === null) return vWerte
      vWerte['anlV.z13Miete'] = String(miete)
      vWerte['anlV.kz01'] = String(miete)
      vWerte['anlV.z32Einnahmen'] = String(miete)
      const afa = vermietungAfa(obj)
      if (afa && obj.afaWieVorjahr) {
        vWerte['anlV.z33Linear'] = '1'
        vWerte['anlV.z33Satz'] = String(afa.satz).replace('.', ',')
        vWerte['anlV.z33WieVorjahr'] = '1'
        vWerte['anlV.z33Afa'] = String(afa.betrag)
        vWerte['anlV.kz30'] = String(afa.betrag)
      }
      if (laufend > 0) {
        vWerte['anlV.z80Text'] = 'Laufende Werbungskosten'
        vWerte['anlV.z80Betrag'] = String(laufend)
        vWerte['anlV.kz49'] = String(laufend)
      }
      const summe = laufend + (afa && obj.afaWieVorjahr ? afa.betrag : 0)
      vWerte['anlV.werbungskostenSumme'] = String(summe)
      vWerte['anlV.ueberschuss'] = String(miete - summe)
      vWerte['anlV.kz20'] = String(miete - summe)
      return vWerte
    })
    for (const obj of fakten.vermietung) {
      const luecke = vermietungLuecke(obj)
      if (luecke && !fehlend.includes(luecke)) fehlend.push(luecke)
    }
  }

  // Anlage Kind
  if (fakten.kinder && fakten.kinder.length > 0) {
    const zusammen = fakten.kopplung?.veranlagungsart === 'zusammen'
    // § 24b EStG: only a filer living alone with the child. The printout claims it for whole
    // years only; a part-year or a 'Ja' in Zeile 47/48 needs periods it does not ask yet.
    const alleinstehend =
      !zusammen &&
      sd?.familienstand !== 'verheiratet' &&
      fakten.alleinerziehend?.weiterePerson === 'Nein' &&
      fakten.alleinerziehend.haushaltsgemeinschaft === 'Nein'
    instanzen['anlage-kind'] = fakten.kinder.map((k, i) => {
      const kWerte: Record<string, string | true> = {}
      if (profil.lastName) kWerte['anlKind.name'] = profil.lastName
      if (profil.firstName) kWerte['anlKind.vornameEltern'] = profil.firstName
      if (profil.steuernummer) kWerte['anlKind.steuernummer'] = profil.steuernummer
      kWerte['anlKind.lfdNr'] = k.lfdNr ?? String(i + 1)
      if (k.idnr) kWerte['anlKind.idnr'] = k.idnr
      if (k.vorname) kWerte['anlKind.vorname'] = k.vorname
      if (k.nachname && k.nachname !== profil.lastName) kWerte['anlKind.nachname'] = k.nachname
      if (k.geburtsdatum) kWerte['anlKind.geburtsdatum'] = deutschesDatum(k.geburtsdatum)
      if (k.kindergeldAnspruchEur) kWerte['anlKind.kindergeld'] = k.kindergeldAnspruchEur
      if (k.familienkasse) kWerte['anlKind.familienkasse'] = k.familienkasse
      const beginn = k.geburtsdatum?.startsWith(`${fakten.steuerjahr}-`) ? k.geburtsdatum : `${fakten.steuerjahr}-01-01`
      const ende = `${fakten.steuerjahr}-12-31`
      if (k.wohnsitzInlandGanzjaehrig) {
        kWerte['anlKind.inlandVon'] = deutschesDatum(beginn)
        kWerte['anlKind.inlandBis'] = deutschesDatum(ende)
      }
      if (k.kindschaftsverhaeltnis) kWerte['anlKind.kz02'] = k.kindschaftsverhaeltnis
      if (zusammen && k.kindschaftsverhaeltnisB) kWerte['anlKind.kz03'] = k.kindschaftsverhaeltnisB
      if (alleinstehend && k.gemeldetBeiMirGanzjaehrig && k.kindergeldAnMichGanzjaehrig) {
        kWerte['anlKind.kz42Von'] = deutschesDatum(beginn)
        kWerte['anlKind.kz42Bis'] = deutschesDatum(ende)
        kWerte['anlKind.kz44Von'] = deutschesDatum(beginn)
        kWerte['anlKind.kz44Bis'] = deutschesDatum(ende)
        kWerte['anlKind.kz46'] = '2'
        kWerte['anlKind.kz49'] = '2'
      }
      if (brauchtAnderenElternteil(k, zusammen)) {
        if (k.andererElternteil === 'Unbekannt') kWerte['anlKind.kz05'] = '1'
        if (k.andererElternteil === 'Inland' || k.andererElternteil === 'Verstorben') {
          if (k.andererElternteilName) kWerte['anlKind.aeName'] = k.andererElternteilName
          if (k.andererElternteilGeburtsdatum) kWerte['anlKind.aeGeburtsdatum'] = deutschesDatum(k.andererElternteilGeburtsdatum)
          if (k.andererElternteilAdresse) kWerte['anlKind.aeAdresse'] = k.andererElternteilAdresse
          if (k.andererElternteilArt) kWerte['anlKind.aeArt'] = k.andererElternteilArt
          const tod = k.andererElternteil === 'Verstorben' ? k.andererElternteilVerstorbenAm : null
          if (tod) kWerte['anlKind.kz06'] = deutschesDatum(tod)
          const bis = tod && tod < ende ? tod : ende
          if (bis >= beginn) {
            kWerte['anlKind.aeVon'] = deutschesDatum(beginn)
            kWerte['anlKind.aeBis'] = deutschesDatum(bis)
          }
        }
      }
      return kWerte
    })
    for (const kind of fakten.kinder) {
      const luecke = kindLuecke(kind, fakten.steuerjahr, zusammen)
      if (luecke && !fehlend.includes(luecke)) fehlend.push(luecke)
    }
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
