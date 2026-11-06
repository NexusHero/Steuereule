import {
  afaSatzProzent,
  anlageNGreBetraege,
  calculateDifferentialChildBenefit,
  deutschesDatum,
  type GrenzgaengerStatus,
  type NGreZeile,
  kapitalPflichtfelder,
  type KapitalDepotEinordnung,
  type KapitalFeldId,
  type Krankenversicherung,
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
  chLohnausweis?: ChLohnausweisFakten | null
  arbeitsweg?: ArbeitswegFakten | null
  krankenversicherung?: readonly Krankenversicherung[] | null
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
  schweizerKinderzulageEur?: string | null
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
  kvBasisEur?: string | null
  pvEur?: string | null
}

/** Anlage Kind Zeilen 47/48 — answered once per year in the interview. */
export interface AlleinerziehendFakten {
  weiterePerson: string | null
  haushaltsgemeinschaft: string | null
}

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
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  afaWieVorjahr: boolean | null
  umlagen?: string | null
  schuldzinsen?: string | null
  einheiten?: string | null
  /** Person A's share in percent (Anlage V Z. 86); null in a joint return = half and half. */
  anteilA?: string | null
}

const ganzeZahl = (wert: string | null): number | null => (wert !== null && /^\d+$/.test(wert) ? Number(wert) : null)

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

export type KapitalFakten = { depot: KapitalDepotEinordnung['kind']; inhaber?: 'A' | 'B' | 'gemeinsam' | null } & Partial<Record<KapitalFeldId, string | null>>

/** The Lohnausweis Ziffern and the N-Gre facts as stored, plus status and Kurs. */
export interface ChLohnausweisFakten {
  status: GrenzgaengerStatus | null
  kurs: number | null
  bruttolohnChf: string | null
  ahvBeitraegeChf: string | null
  quellensteuerChf: string | null
  arbeitgeberName: string | null
  arbeitgeberStrasse: string | null
  arbeitgeberPlzOrt: string | null
  familienzulagenChf: string | null
  krankentaggeldChf: string | null
  pkArbeitnehmerChf: string | null
  pkArbeitgeberChf: string | null
  krankentaggeldArbeitgeberProzent: string | null
  krankentaggeldArbeitgeberChf: string | null
  nbuvArbeitgeberProzent: string | null
  nbuvArbeitgeberChf: string | null
  sonderfaelle: boolean | null
}

/**
 * Who pays a premium must be stated once the employee pays some of it (otherwise Z. 18/19 and 95–98
 * cannot be filled); an employer paying everything also has to give its CHF amount.
 */
function praemieGeklaert(arbeitnehmerChf: number | null, prozent: string | null, arbeitgeberChf: string | null): boolean {
  const anteil = ganzeZahl(prozent)
  if (anteil === null) return arbeitnehmerChf === 0
  return anteil < 100 || ganzeZahl(arbeitgeberChf) !== null
}

function nbuvArbeitnehmerChf(ch: ChLohnausweisFakten): number | null {
  const ahv = ganzeZahl(ch.ahvBeitraegeChf)
  const brutto = ganzeZahl(ch.bruttolohnChf)
  const zulagen = ganzeZahl(ch.familienzulagenChf)
  if (ahv === null || brutto === null || zulagen === null || ch.kurs === null) return null
  return anlageNGreBetraege({
    bruttolohnChf: brutto,
    familienzulagenChf: zulagen,
    ahvBeitraegeChf: ahv,
    quellensteuerChf: 0,
    krankentaggeldChf: 0,
    pkArbeitnehmerChf: 0,
    pkArbeitgeberChf: 0,
    kurs: ch.kurs,
  }).aufteilung.nbuv.arbeitnehmerChf
}

function nGreLuecke(ch: ChLohnausweisFakten): string | null {
  if (ch.status === 'kein-grenzgaenger') return 'anlageNGreKeinGrenzgaenger'
  if (ch.sonderfaelle) return 'anlageNGreSonderfall'
  const betraege = [ch.bruttolohnChf, ch.ahvBeitraegeChf, ch.quellensteuerChf, ch.familienzulagenChf, ch.krankentaggeldChf, ch.pkArbeitnehmerChf, ch.pkArbeitgeberChf]
  const vollstaendig =
    ch.status !== null &&
    ch.sonderfaelle === false &&
    ch.kurs !== null &&
    betraege.every((wert) => ganzeZahl(wert) !== null) &&
    praemieGeklaert(ganzeZahl(ch.krankentaggeldChf), ch.krankentaggeldArbeitgeberProzent, ch.krankentaggeldArbeitgeberChf) &&
    praemieGeklaert(nbuvArbeitnehmerChf(ch), ch.nbuvArbeitgeberProzent, ch.nbuvArbeitgeberChf) &&
    Boolean(ch.arbeitgeberName && ch.arbeitgeberStrasse && ch.arbeitgeberPlzOrt)
  return vollstaendig ? null : 'grenzgaenger'
}

/**
 * One Anlage KAP. `haelfte` -1 = the whole amount, 0 = the first half (rounded up), 1 = the second half.
 */
function kapWerte(
  kapital: KapitalFakten,
  rolle: 'A' | 'B',
  haelfte: -1 | 0 | 1 | number,
  kopf: { name: string | null; vorname: string | null },
  steuernummer: string | null,
): Record<string, string | true> {
  const anteil = (wert: string | null | undefined): number => {
    const zahl = Number(wert ?? 0)
    if (haelfte === -1) return zahl
    return haelfte === 0 ? Math.ceil(zahl / 2) : Math.floor(zahl / 2)
  }
  const werte: Record<string, string | true> = {}
  werte[rolle === 'A' ? 'anlKap.personA' : 'anlKap.personB'] = true
  if (kopf.name) werte['anlKap.name'] = kopf.name
  if (kopf.vorname) werte['anlKap.vorname'] = kopf.vorname
  if (steuernummer) werte['anlKap.steuernummer'] = steuernummer
  werte['anlKap.guenstigerpruefung'] = '1'
  if (kapital.depot === 'deutscher-broker') {
    werte['anlKap.kz210'] = String(anteil(kapital.kapitalertraege))
    werte['anlKap.kz217'] = String(anteil(kapital.sparerPauschbetrag))
    werte['anlKap.kz280'] = `${anteil(kapital.kapitalertragsteuer)},00`
    werte['anlKap.kz281'] = `${anteil(kapital.solidaritaetszuschlag)},00`
    werte['anlKap.kz282'] = `${anteil(kapital.kirchensteuer)},00`
  } else {
    werte['anlKap.kz234'] = String(anteil(kapital.kapitalertraege))
    werte['anlKap.kz217'] = '0'
    werte['anlKap.kz218'] = String(anteil(kapital.sparerPauschbetrag))
  }
  return werte
}

interface NGreErgebnis {
  readonly werte: Record<string, string | true>
  readonly luecke: string | null
}

/** One Anlage N-Gre for Person A or B, or null when that person has no Swiss wage. */
function nGreWerte(
  ch: ChLohnausweisFakten | null | undefined,
  arbeitsweg: ArbeitswegFakten | null | undefined,
  rolle: 'A' | 'B',
  kopf: { name: string | null; vorname: string | null; beruf: string | null; steuernummer: string | null },
): NGreErgebnis | null {
  if (!ch || ch.bruttolohnChf === null) return null
  const luecke = nGreLuecke(ch)
  if (luecke) return { werte: {}, luecke: rolle === 'B' && luecke === 'grenzgaenger' ? 'grenzgaengerPersonB' : luecke }
  const werte: Record<string, string | true> = {}
  const setze = (id: string, wert: string | null) => {
    if (wert) werte[id] = wert
  }
  werte[rolle === 'A' ? 'anlNGre.personA' : 'anlNGre.personB'] = true
  setze('anlNGre.name', kopf.name)
  setze('anlNGre.vorname', kopf.vorname)
  setze('anlNGre.steuernummer', kopf.steuernummer)
  werte['anlNGre.kz117'] = '3'
  setze('anlNGre.beruf', kopf.beruf)
  const { chf, eur, aufteilung } = anlageNGreBetraege({
    bruttolohnChf: Number(ch.bruttolohnChf),
    familienzulagenChf: Number(ch.familienzulagenChf),
    ahvBeitraegeChf: Number(ch.ahvBeitraegeChf),
    quellensteuerChf: Number(ch.quellensteuerChf),
    krankentaggeldChf: Number(ch.krankentaggeldChf),
    pkArbeitnehmerChf: Number(ch.pkArbeitnehmerChf),
    pkArbeitgeberChf: Number(ch.pkArbeitgeberChf),
    kurs: ch.kurs!,
    krankentaggeldArbeitgeberProzent: optionaleZahl(ch.krankentaggeldArbeitgeberProzent),
    krankentaggeldArbeitgeberChf: optionaleZahl(ch.krankentaggeldArbeitgeberChf),
    nbuvArbeitgeberProzent: optionaleZahl(ch.nbuvArbeitgeberProzent),
    nbuvArbeitgeberChf: optionaleZahl(ch.nbuvArbeitgeberChf),
  })
  for (const zeile of Object.keys(chf) as NGreZeile[]) {
    // Z. 18/19 only apply when the employer pays part of a premium; an empty line stays empty.
    if ((zeile === 'z18' || zeile === 'z19') && chf[zeile] === 0) continue
    werte[`anlNGre.${zeile}Chf`] = String(chf[zeile])
    werte[`anlNGre.${zeile}Eur`] = String(eur[zeile])
  }
  for (const [zeilen, teil] of [
    [['z95', 'z96'], aufteilung.krankentaggeld],
    [['z97', 'z98'], aufteilung.nbuv],
  ] as const) {
    if (teil.arbeitgeberChf + teil.arbeitnehmerChf === 0) continue
    werte[`anlNGre.${zeilen[0]}Arbeitgeber`] = String(teil.arbeitgeberProzent)
    werte[`anlNGre.${zeilen[0]}Arbeitnehmer`] = String(teil.arbeitnehmerProzent)
    werte[`anlNGre.${zeilen[1]}Arbeitgeber`] = String(teil.arbeitgeberChf)
    werte[`anlNGre.${zeilen[1]}Arbeitnehmer`] = String(teil.arbeitnehmerChf)
  }
  Object.assign(werte, arbeitswegWerte(arbeitsweg, 'anlNGre'))
  setze('anlNGre.arbeitgeberName', ch.arbeitgeberName)
  setze('anlNGre.arbeitgeberStrasse', ch.arbeitgeberStrasse)
  setze('anlNGre.arbeitgeberPlzOrt', ch.arbeitgeberPlzOrt)
  return { werte, luecke: null }
}

export interface SonderausgabenFakten {
  spenden?: string | null
}

/** Anlage AV: the contributions come from the provider; the form needs the kind of eligibility. */
export interface RiesterFakten {
  art: string | null
  einnahmenVorjahr: string | null
}

/** Anlage N Zeilen 27–31: the facts only — the Finanzamt computes the Entfernungspauschale itself. */
export interface ArbeitswegFakten {
  arbeitstageJeWoche: number
  freieTage: number
  pendlertage: number
  einfacheKm: number | null
  mitPkw: boolean
  taetigkeitsstaette: string | null
}

/** Anlage N Z. 27–31 and Anlage N-Gre Z. 32–36 ask the same facts under their own field prefix. */
function arbeitswegWerte(a: ArbeitswegFakten | null | undefined, prefix: 'anlN' | 'anlNGre' = 'anlN'): Record<string, string> {
  if (!a || a.einfacheKm === null) return {}
  const werte: Record<string, string> = {
    [`${prefix}.wegArt`]: '1',
    [`${prefix}.wegTageJeWoche`]: String(a.arbeitstageJeWoche),
    [`${prefix}.wegFreieTage`]: String(a.freieTage),
    [`${prefix}.kz110Tage`]: String(a.pendlertage),
    [`${prefix}.kz111`]: String(a.einfacheKm),
  }
  if (a.taetigkeitsstaette) werte[`${prefix}.wegOrt`] = a.taetigkeitsstaette
  if (a.mitPkw) werte[`${prefix}.kz112`] = String(a.einfacheKm)
  return werte
}

const optionaleZahl = (wert: string | null): number | undefined => {
  const zahl = ganzeZahl(wert)
  return zahl === null ? undefined : zahl
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
  bruttoarbeitslohn: string | null
  rente?: { rentenart: string | null; jahresbetrag: string | null } | null
  kopplung?: KopplungFakten | null
  kapital?: KapitalFakten | null
  chLohnausweis?: ChLohnausweisFakten | null
  vermietung?: readonly VermietungFakten[] | null
  kinder?: readonly KindFakten[] | null
  sonderausgaben?: SonderausgabenFakten | null
  riester?: RiesterFakten | null
  alleinerziehend?: AlleinerziehendFakten | null
  arbeitsweg?: ArbeitswegFakten | null
  /** Self-paid health and care insurance of Person A (Anlage Vorsorgeaufwand Z. 16–33). */
  krankenversicherung?: readonly Krankenversicherung[] | null
}

/**
 * Anlage Vorsorgeaufwand for self-paid insurance (Person A Kennzahlen 3xx): voluntary statutory Z. 16–18
 * and 22, private Z. 23, 24 and 27, foreign Z. 28–30 and 33. Contributions withheld from a German salary
 * are e-data (Z. 11–13) and Swiss ones via the employer are in the Anlage N-Gre — neither is repeated here.
 */
function vorsorgeaufwandWerte(versicherungen: readonly Krankenversicherung[] | null | undefined, rolle: 'A' | 'B' = 'A'): Record<string, string> {
  const summen = new Map<string, number>()
  const addiere = (kz: string, betrag: number) => summen.set(kz, (summen.get(kz) ?? 0) + betrag)
  for (const kv of versicherungen ?? []) {
    if (kv.art === 'gesetzlich') {
      addiere('326', kv.kvBasis)
      if (kv.mitKrankengeld) addiere('328', kv.kvBasis)
      addiere('329', kv.pv)
      addiere('338', kv.wahlleistungen)
    } else if (kv.art === 'privat') {
      addiere('350', kv.kvBasis)
      addiere('351', kv.pv)
      addiere('354', kv.wahlleistungen)
    } else {
      addiere('333', kv.kvBasis)
      if (!kv.mitKrankengeld) addiere('334', kv.kvBasis)
      addiere('335', kv.pv)
      addiere('339', kv.wahlleistungen)
    }
  }
  const werte: Record<string, string> = {}
  // Person B's column carries the same Kennzahlen with a leading 4 instead of 3.
  for (const [kz, betrag] of summen) if (betrag > 0) werte[`anlVor.kz${rolle === 'A' ? kz : `4${kz.slice(1)}`}`] = String(betrag)
  return werte
}

const RENTE_KENNZAHL: Record<string, string> = {
  GesetzlicheRente: 'anlR.kz101',
  WitwenWaisenrente: 'anlR.kz101',
  PrivateRentenversicherung: 'anlR.kz131',
}

const RENTE_ANDERER_VORDRUCK: Record<string, string> = {
  Betriebsrente: 'anlageRAvBav',
  AuslaendischeRente: 'anlageRAus',
}

export interface AusdruckWerte {
  werte: FeldWerte
  instanzen?: Record<string, FeldWerte[]>
  fehlend: string[]
}

const PFLICHT_STAMMDATEN = ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'] as const

const SEIT_FELD: Record<string, string> = {
  verheiratet: 'est1a.verheiratetSeit',
  verwitwet: 'est1a.verwitwetSeit',
  geschieden: 'est1a.geschiedenSeit',
  'dauernd-getrennt': 'est1a.getrenntSeit',
}

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

  const brutto = fakten.bruttoarbeitslohn
  const bruttoB = fakten.kopplung?.veranlagungsart === 'zusammen' ? fakten.kopplung.personB?.bruttoarbeitslohn ?? null : null
  const hatBruttoA = brutto !== null && /^\d+$/.test(brutto)
  const hatBruttoB = bruttoB !== null && /^\d+$/.test(bruttoB)

  if (hatBruttoA && !hatBruttoB) {
    werte['anlN.kz110'] = brutto!
    werte['anlN.personA'] = true
    Object.assign(werte, arbeitswegWerte(fakten.arbeitsweg))
    setze('anlN.name', profil.lastName)
    setze('anlN.vorname', profil.firstName)
    setze('anlN.steuernummer', profil.steuernummer)
  } else if (hatBruttoB) {
    const nInstanzen: FeldWerte[] = []
    if (hatBruttoA) {
      const nA: Record<string, string | true> = { 'anlN.kz110': brutto!, 'anlN.personA': true, ...arbeitswegWerte(fakten.arbeitsweg) }
      if (profil.lastName) nA['anlN.name'] = profil.lastName
      if (profil.firstName) nA['anlN.vorname'] = profil.firstName
      if (profil.steuernummer) nA['anlN.steuernummer'] = profil.steuernummer
      nInstanzen.push(nA)
    }
    const b = fakten.kopplung?.personB
    const nB: Record<string, string | true> = { 'anlN.kz110': bruttoB!, 'anlN.personB': true }
    // B's commute belongs to their Anlage N unless they are a Grenzgänger (then it is in their N-Gre).
    if (!b?.chLohnausweis) Object.assign(nB, arbeitswegWerte(b?.arbeitsweg))
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

  const kapital = fakten.kapital
  if (kapital && kapital.kapitalertraege != null) {
    const pflicht = kapitalPflichtfelder(kapital.depot)
    const vollstaendig = pflicht.every((feld) => ganzeZahl(kapital[feld] ?? null) !== null)
    if (kapital.depot === 'krypto') fehlend.push('anlageKapKrypto')
    else if (kapital.depot === 'unbekannt' || !vollstaendig) fehlend.push('kapital')
    else {
      // ADR-0054: in a joint return a joint account is split half and half across an Anlage KAP for
      // each spouse; an account of Person B goes onto B's Anlage KAP. A gets the odd euro.
      const zusammen = fakten.kopplung?.veranlagungsart === 'zusammen'
      const b = zusammen ? fakten.kopplung?.personB ?? null : null
      const inhaber = zusammen ? (kapital.inhaber ?? 'A') : 'A'
      const kopfA = { name: profil.lastName, vorname: profil.firstName }
      const kopfB = { name: b?.lastName ?? null, vorname: b?.firstName ?? null }
      const teile: [('A' | 'B'), number][] =
        inhaber === 'gemeinsam' ? [['A', 0], ['B', 1]] : inhaber === 'B' ? [['B', -1]] : [['A', -1]]
      const kapInstanzen = teile.map(([rolle, haelfte]) =>
        kapWerte(kapital, rolle, haelfte, rolle === 'A' ? kopfA : kopfB, profil.steuernummer),
      )
      if (kapInstanzen.length === 1 && teile[0]![0] === 'A') Object.assign(werte, kapInstanzen[0])
      else instanzen['anlage-kap'] = kapInstanzen
    }
  }

  // Anlage N-Gre: one per Grenzgänger. A couple where both commute to Switzerland gets two instances.
  const personB = fakten.kopplung?.veranlagungsart === 'zusammen' ? fakten.kopplung.personB : null
  const nGreA = nGreWerte(fakten.chLohnausweis, fakten.arbeitsweg, 'A', {
    name: profil.lastName,
    vorname: profil.firstName,
    beruf: sd?.beruf ?? null,
    steuernummer: profil.steuernummer,
  })
  const nGreB = nGreWerte(personB?.chLohnausweis, personB?.arbeitsweg, 'B', {
    name: personB?.lastName ?? null,
    vorname: personB?.firstName ?? null,
    beruf: personB?.beruf ?? null,
    steuernummer: profil.steuernummer,
  })
  for (const n of [nGreA, nGreB]) if (n?.luecke) fehlend.push(n.luecke)
  const nGreInstanzen = [nGreA, nGreB].filter((n): n is NGreErgebnis => n !== null && n.luecke === null).map((n) => n.werte)
  if (nGreInstanzen.length === 1 && nGreA?.luecke === null) Object.assign(werte, nGreInstanzen[0])
  else if (nGreInstanzen.length > 0) instanzen['anlage-n-gre'] = nGreInstanzen

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
      // Several flats of one building go into Z. 13 together, named as such.
      const einheiten = ganzeZahl(obj.einheiten ?? null)
      if (einheiten !== null && einheiten > 1) vWerte['anlV.z13Bezeichnung'] = `${einheiten} Wohneinheiten`
      const miete = ganzeZahl(obj.mieteinnahmen)
      const laufend = ganzeZahl(obj.werbungskosten)
      if (miete === null || laufend === null) return vWerte
      vWerte['anlV.z13Miete'] = String(miete)
      vWerte['anlV.kz01'] = String(miete)
      const umlagen = ganzeZahl(obj.umlagen ?? null) ?? 0
      if (umlagen > 0) vWerte['anlV.kz04'] = String(umlagen)
      vWerte['anlV.z32Einnahmen'] = String(miete + umlagen)
      const schuldzinsen = ganzeZahl(obj.schuldzinsen ?? null) ?? 0
      if (schuldzinsen > 0) {
        vWerte['anlV.z46Text'] = 'Darlehen für das Objekt'
        vWerte['anlV.z46Betrag'] = String(schuldzinsen)
        vWerte['anlV.kz33'] = String(schuldzinsen)
      }
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
      const summe = laufend + schuldzinsen + (afa && obj.afaWieVorjahr ? afa.betrag : 0)
      const ueberschuss = miete + umlagen - summe
      vWerte['anlV.werbungskostenSumme'] = String(summe)
      vWerte['anlV.ueberschuss'] = String(ueberschuss)
      // Z. 86: in a joint return the result is attributed to both spouses (ADR-0054), half and half by default.
      if (fakten.kopplung?.veranlagungsart === 'zusammen') {
        const anteilA = Math.min(100, ganzeZahl(obj.anteilA ?? null) ?? 50)
        const teilA = Math.round((ueberschuss * anteilA) / 100)
        vWerte['anlV.kz20'] = String(teilA)
        vWerte['anlV.kz21'] = String(ueberschuss - teilA)
      } else vWerte['anlV.kz20'] = String(ueberschuss)
      return vWerte
    })
    for (const obj of fakten.vermietung) {
      const luecke = vermietungLuecke(obj)
      if (luecke && !fehlend.includes(luecke)) fehlend.push(luecke)
    }
  }

  if (fakten.kinder && fakten.kinder.length > 0) {
    const zusammen = fakten.kopplung?.veranlagungsart === 'zusammen'
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
      if (k.schweizerKinderzulageEur && Number(k.schweizerKinderzulageEur) > 0) {
        const swissEur = Number(k.schweizerKinderzulageEur)
        const diff = calculateDifferentialChildBenefit(k.geburtsdatum ?? `${fakten.steuerjahr}-01-01`, fakten.steuerjahr, swissEur)
        const anspruchEur = k.kindergeldAnspruchEur ? Number(k.kindergeldAnspruchEur) : 0
        kWerte['anlKind.kindergeld'] = String(Math.max(anspruchEur, diff.totalClaim))
      } else if (k.kindergeldAnspruchEur) {
        kWerte['anlKind.kindergeld'] = k.kindergeldAnspruchEur
      }
      if (k.familienkasse) kWerte['anlKind.familienkasse'] = k.familienkasse
      // Z. 27/28: KV/PV of the child the parents pay as policyholders — an empty or zero line stays empty.
      if (k.kvBasisEur && Number(k.kvBasisEur) > 0) kWerte['anlKind.kz66'] = k.kvBasisEur
      if (k.pvEur && Number(k.pvEur) > 0) kWerte['anlKind.kz67'] = k.pvEur
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

  if (fakten.sonderausgaben?.spenden && /^\d+$/.test(fakten.sonderausgaben.spenden)) {
    setze('anlSo.name', profil.lastName)
    setze('anlSo.vorname', profil.firstName)
    setze('anlSo.steuernummer', profil.steuernummer)
    werte['anlSo.spenden'] = fakten.sonderausgaben.spenden
  }

  const vorsorge = {
    ...vorsorgeaufwandWerte(fakten.krankenversicherung),
    ...vorsorgeaufwandWerte(personB?.krankenversicherung, 'B'),
  }
  if (Object.keys(vorsorge).length > 0) {
    setze('anlVor.name', profil.lastName)
    setze('anlVor.vorname', profil.firstName)
    setze('anlVor.steuernummer', profil.steuernummer)
    Object.assign(werte, vorsorge)
  }

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

  const ergebnis: AusdruckWerte = { werte, fehlend }
  if (Object.keys(instanzen).length > 0) ergebnis.instanzen = instanzen
  return ergebnis
}
