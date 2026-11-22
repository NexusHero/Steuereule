// A real case as an acceptance test (ADR-0094): a married couple in Baden-Württemberg, both Swiss
// Grenzgänger, one child; 2024 one spouse changes from a German to a Swiss employer in November.
// The amounts and the situation are the real ones; names, employers, addresses and dates of birth are
// made up. The target is not the notice but the notice with the corrections that primary sources carry
// (docs/research/grenzgaenger-schweiz/README.md): the notice repeated mistakes of the filed return.

export type Person = 'A' | 'B'

/** One value as the user gives it: a mask field, for Person B or the child where it says so. */
export interface Answer {
  readonly screen: string
  readonly field: string
  readonly value: string
  readonly person?: Person
  readonly child?: true
}

/** A document the user uploads: its text layer, read by the app's own reader. */
export interface Document {
  readonly fileName: string
  readonly kind: 'chLohnausweis' | 'lstb'
  readonly person: Person
  readonly text: string
  /** The two-path card of a daily benefit: the path the user takes (the card recommends it here). */
  readonly dailyBenefitPath?: 'max' | 'safe'
}

/** A reason the target differs from the notice, with its effect on the result after prepayments. */
export interface Correction {
  readonly id: string
  readonly what: string
  readonly source: string
  readonly certainty: 'hoch' | 'mittel'
}

/** Where the app is known to compute differently from the target: its effect on the zvE and on the result. */
export interface AppDeviation {
  readonly id: string
  readonly what: string
  readonly taxableIncomeEur: number
  readonly resultEur: number
}

export interface CaseYear {
  readonly year: number
  readonly documents: readonly Document[]
  readonly answers: readonly Answer[]
  readonly child: { readonly firstName: string; readonly lastName: string; readonly birthDate: string }
  readonly notice: { readonly taxableIncome: number; readonly resultAfterPrepayments: number }
  readonly corrections: readonly Correction[]
  /** The notice with the corrections, computed in the core (README of the research). */
  readonly target: { readonly taxableIncome: number; readonly resultAfterPrepayments: number }
  readonly appDeviations: readonly AppDeviation[]
}

const A_NAME = { firstName: 'Deniz', lastName: 'Aydin' }
const B_NAME = { firstName: 'Selin', lastName: 'Aydin' }
const CHILD = { firstName: 'Mira', lastName: 'Aydin', birthDate: '2022-03-01' }
const A_EMPLOYER = { name: 'Alpen Systeme AG', street: 'Industriestrasse 10', place: '8050 Zürich' }
const B_EMPLOYER = { name: 'Rhein Pharma AG', street: 'Werkstrasse 5', place: '8200 Schaffhausen' }

/** A Swiss Lohnausweis as its text layer reads (layout of the official form, figures in CHF). */
function lohnausweis(o: {
  year: number
  holder: string
  from: string
  to: string
  lohn: number
  unregelmaessig?: number
  andere?: number
  brutto: number
  ahv: number
  bv: number
  netto: number
  quellensteuer: number
  remarks: readonly string[]
}): string {
  const chf = (n: number) => n.toLocaleString('de-CH').replace(/’/g, "'")
  return [
    'A     X          Lohnausweis - Certificat de salaire - Certificato di salario',
    '      756.0000.0000.00',
    `D     ${o.year}                          E      ${o.from}                 ${o.to}`,
    'H',
    `          ${o.holder}`,
    '          Beispielweg 3, 79539 Lörrach',
    ` 1. Lohn soweit nicht unter Ziffer 2-7 aufzuführen                                       ${chf(o.lohn)}`,
    ...(o.unregelmaessig ? [` 3. Unregelmässige Leistungen                                                            ${chf(o.unregelmaessig)}`] : []),
    ...(o.andere ? [` 7. Andere Leistungen                                                                    ${chf(o.andere)}`] : []),
    ` 8 Bruttolohn total / Rente - Salaire brut total / Rente                       =                  ${chf(o.brutto)}`,
    ` 9. Beiträge AHV/IV/EO/ALV/NBUV - Cotisations AVS/AI/APG/AC/AANP              -                      ${chf(o.ahv)}`,
    `10 Berufliche Vorsorge        2. Säule 10.1 Ordentliche Beiträge               -                      ${chf(o.bv)}`,
    `11. Nettolohn / Rente - Salaire net / Rente                                    =                   ${chf(o.netto)}`,
    `12. Quellensteuerabzug - Retenue de l'impôt à la source                                          ${chf(o.quellensteuer)}`,
    '15. Bemerkungen',
    ...o.remarks.map((r) => `    ${r}`),
  ].join('\n')
}

/** The German Lohnsteuerbescheinigung as the printout of the electronic certificate reads. */
function lstb(o: { year: number; employer: string; brutto: string; lohnsteuer: string; soli: string; rvAg: string; rvAn: string; zuschussKv: string; zuschussPv: string; kv: string; pv: string; av: string }): string {
  return [
    `Ausdruck der elektronischen Lohnsteuerbescheinigung für ${o.year}`,
    `Arbeitgeber: ${o.employer}`,
    'Steuerklasse: IV',
    `3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.    ${o.brutto}`,
    `4. Einbehaltene Lohnsteuer von 3.                           ${o.lohnsteuer}`,
    `5. Einbehaltener Solidaritätszuschlag                         ${o.soli}`,
    '6. Einbehaltene Kirchensteuer des Arbeitnehmers                 0,00',
    `22a Arbeitgeberanteil zur gesetzlichen Rentenversicherung   ${o.rvAg}`,
    `23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung  ${o.rvAn}`,
    `24a Steuerfreie Arbeitgeberzuschüsse zur Krankenversicherung ${o.zuschussKv}`,
    `24c Steuerfreie Arbeitgeberzuschüsse zur Pflegeversicherung  ${o.zuschussPv}`,
    `25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung ${o.kv}`,
    `26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung     ${o.pv}`,
    `27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung        ${o.av}`,
  ].join('\n')
}

const own = (screen: string, fields: Record<string, string>, person?: Person): Answer[] =>
  Object.entries(fields).map(([field, value]) => ({ screen, field, value, ...(person ? { person } : {}) }))
const forChild = (fields: Record<string, string>): Answer[] => Object.entries(fields).map(([field, value]) => ({ screen: 'kind', field, value, child: true }))

const PEOPLE: Answer[] = [
  ...own('stammdaten', { geburtsdatum: '12.03.1990', kirchensteuerpflichtig: 'false', familienstand: 'verheiratet', strasse: 'Beispielweg', hausnummer: '3', plz: '79539', wohnort: 'Lörrach' }, 'A'),
  ...own('stammdaten', { geburtsdatum: '04.09.1991', kirchensteuerpflichtig: 'false', familienstand: 'verheiratet' }, 'B'),
]

const NGRE_COMMON = { kvZuschussAnspruch: 'false', krankentaggeldArbeitgeberProzent: '100', nbuvArbeitgeberProzent: '100', nGreSonderfaelle: 'false', krankentaggeldChf: '0', krankenkasseZusatzChf: '0' }

const year2024: CaseYear = {
  year: 2024,
  child: CHILD,
  documents: [
    {
      fileName: 'lstb-2024-a.pdf',
      kind: 'lstb',
      person: 'A',
      // The electronic certificate the tax office has (the paper copy differed: 78.564,97 € / 18.669,39 €).
      text: lstb({ year: 2024, employer: 'Muster Maschinenbau SE', brutto: '79.646,00', lohnsteuer: '19.125,00', soli: '190,46', rvAg: '7.021,48', rvAn: '7.021,48', zuschussKv: '4.191,80', zuschussPv: '879,80', kv: '8.383,50', pv: '1.759,50', av: '981,51' }),
    },
    {
      fileName: 'lohnausweis-2024-a.pdf',
      kind: 'chLohnausweis',
      person: 'A',
      text: lohnausweis({ year: 2024, holder: `${A_NAME.firstName} ${A_NAME.lastName}`, from: '01.11.2024', to: '31.12.2024', lohn: 19900, brutto: 19900, ahv: 1347, bv: 1181, netto: 17372, quellensteuer: 896, remarks: ['Kinderzulagen CHF 400', 'Krankentaggeld 63,00 vom Arbeitgeber übernommen', 'NBU 99,45 vom Arbeitgeber übernommen'] }),
    },
    {
      fileName: 'lohnausweis-2024-b.pdf',
      kind: 'chLohnausweis',
      person: 'B',
      text: lohnausweis({ year: 2024, holder: `${B_NAME.firstName} ${B_NAME.lastName}`, from: '01.01.2024', to: '31.12.2024', lohn: 99784, unregelmaessig: 2099, andere: 853, brutto: 102736, ahv: 5205, bv: 4316, netto: 93215, quellensteuer: 4623, remarks: ["KK-Taggeld Verrechnung: 20'843 CHF", 'Krankentaggeld 5.124,00 vom Arbeitgeber übernommen', 'NBU 452,60 vom Arbeitgeber übernommen'] }),
      dailyBenefitPath: 'max',
    },
  ],
  answers: [
    ...own('interview', { job: 'Angestellt', ausland: 'Ja, in die Schweiz', 'de-job': 'Auch in Deutschland', kinder: '1 Kind', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz', 'partner-de-job': 'Nur in der Schweiz' }),
    ...PEOPLE,
    ...own('chLohnausweis', { ...NGRE_COMMON, krankenkasseChf: '949', familienzulagenImBruttolohn: 'true', pkArbeitnehmerChf: '469', pkArbeitgeberChf: '469', pkArbeitgeberGesamtChf: '1181', wechselkurs: '1.045', arbeitgeberName: A_EMPLOYER.name, arbeitgeberStrasse: A_EMPLOYER.street, arbeitgeberPlzOrt: A_EMPLOYER.place }, 'A'),
    ...own('chLohnausweis', { ...NGRE_COMMON, krankenkasseChf: '3794', familienzulagenChf: '0', pkArbeitnehmerChf: '2812', pkArbeitgeberChf: '2812', pkArbeitgeberGesamtChf: '6474', wechselkurs: '1.045', arbeitgeberName: B_EMPLOYER.name, arbeitgeberStrasse: B_EMPLOYER.street, arbeitgeberPlzOrt: B_EMPLOYER.place }, 'B'),
    ...own('commute', { oneWayKm: '67', transport: 'pkw', travelDays: '38', periodFrom: '01.11.2024', periodTo: '31.12.2024', homeOfficeDays: '0', shortestRouteConfirmed: 'true', workEquipmentEur: '110', accountFeesEur: '32' }, 'A'),
    ...own('commute', { oneWayKm: '26', transport: 'pkw', travelDays: '230', homeOfficeDays: '0', shortestRouteConfirmed: 'true', workEquipmentEur: '110', accountFeesEur: '32' }, 'B'),
    ...own('interview', { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }, 'A'),
    ...own('interview', { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }, 'B'),
    ...own('interview', { einkuenfte: 'Kapitalerträge', 'kap-depot': 'Deutscher Broker', spenden: 'Ja', 'haushalt-gate': 'Ja', 'vorauszahlungen-gate': 'Ja', 'kv-pv': 'Nein', altersvorsorge: 'Nein', versicherungen: 'Nein', riester: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein', abfindung: 'Nein', umzug: 'Nein', dhf: 'Nein', fortbildung: 'Nein', homeoffice: 'Nie', partner: 'Ja', beruf: 'IT & Software', 'spenden-betrag': '3498', 'haushalt-handwerker-betrag': '6745', 'haushalt-handwerker-rechnungsbetrag': '15156', 'vorauszahlungen-betrag': '26751' }),
    ...own('kapital', { kapitalertraege: '2682', sparerPauschbetrag: '2000', kapitalertragsteuer: '0', solidaritaetszuschlag: '0', kirchensteuer: '0', inhaber: 'gemeinsam' }),
    ...forChild({ kinship: '1', kinshipB: '1', domesticResidenceAllYear: 'true', registeredWithMeAllYear: 'true', childBenefitToMeAllYear: 'true', familyBenefitsOffice: 'Familienkasse Baden-Württemberg West', healthInsuranceAbroad: 'true', childcareProvider: 'Kindertagespflege', childBenefitClaimEur: '3000', healthBasicEur: '266', childcareEur: '616', childcareFrom: '01.10.2024', childcareTo: '31.12.2024', swissFamilyAllowancePayer: 'A' }),
  ],
  notice: { taxableIncome: 174855, resultAfterPrepayments: -4059.9 },
  corrections: [
    { id: 'taggeld', what: 'Krankentaggeld der Kollektivversicherung 20.843 CHF steuerfrei, ohne Progressionsvorbehalt (N-Gre Z. 8)', source: 'Anleitung Anlage N-Gre 2024; § 3 Nr. 1a EStG; FG BW 14 K 2647/18', certainty: 'hoch' },
    { id: 'kinderzulage', what: 'Kinderzulage 400 CHF steuerfrei (N-Gre Z. 7)', source: 'Anleitung Anlage N-Gre 2024; § 65 EStG; BFH VI R 24/17', certainty: 'hoch' },
    { id: 'nbu', what: 'Hälfte der NBUV-Prämie als Werbungskosten', source: 'Anleitung Anlage N-Gre Z. 97/98; BMF 28.10.2009 Tz. 1.3', certainty: 'hoch' },
    { id: 'ahv-grundlage', what: 'Folge von Taggeld und Kinderzulage: beide sind kein AHV-Lohn, die abziehbare Altersvorsorge sinkt (AHV 5,05 % von Z. 77)', source: 'Anleitung Anlage N-Gre Z. 75 bis 77 und 83', certainty: 'hoch' },
    { id: 'anrechnung', what: 'Quellensteuer auf die steuerfreien Teile nicht angerechnet', source: 'Anleitung Anlage N-Gre Z. 25', certainty: 'mittel' },
  ],
  target: { taxableIncome: 153276, resultAfterPrepayments: 5082.72 },
  appDeviations: [
    { id: 'anrechnung', what: 'Die App rechnet die Quellensteuer auf den ganzen Bruttolohn an (4,5 %), auch auf die steuerfreien Teile', taxableIncomeEur: 0, resultEur: 1000 },
    { id: 'entfernung-rundung', what: 'Entfernungspauschale von Person B 1.904 statt 1.905 € (230 × 8,28 € = 1.904,40, das Finanzamt rundet auf)', taxableIncomeEur: 1, resultEur: 0 },
  ],
}

const year2025: CaseYear = {
  year: 2025,
  child: CHILD,
  documents: [
    {
      fileName: 'lohnausweis-2025-a.pdf',
      kind: 'chLohnausweis',
      person: 'A',
      text: lohnausweis({ year: 2025, holder: `${A_NAME.firstName} ${A_NAME.lastName}`, from: '01.01.2025', to: '31.12.2025', lohn: 119580, unregelmaessig: 1560, andere: -118, brutto: 121022, ahv: 8015, bv: 7186, netto: 105821, quellensteuer: 5446, remarks: ['Krankentaggeld 377,55 vom Arbeitgeber übernommen', 'NBU 537,45 vom Arbeitgeber übernommen'] }),
    },
    {
      fileName: 'lohnausweis-2025-b.pdf',
      kind: 'chLohnausweis',
      person: 'B',
      text: lohnausweis({ year: 2025, holder: `${B_NAME.firstName} ${B_NAME.lastName}`, from: '01.01.2025', to: '31.12.2025', lohn: 111839, unregelmaessig: 3302, andere: 462, brutto: 115603, ahv: 7257, bv: 4908, netto: 103438, quellensteuer: 5202, remarks: ['KK-Taggeld Verrechnung: 3.853,10 CHF', 'NBU 608,40 vom Arbeitgeber übernommen', 'Krankentaggeld 6.382,35 vom Arbeitgeber übernommen'] }),
      // Ziffer 9 cannot tell the source here (too close); the user knows it from the benefit statement.
      dailyBenefitPath: 'max',
    },
  ],
  answers: [
    ...own('interview', { job: 'Angestellt', ausland: 'Ja, in die Schweiz', 'de-job': 'Nur in der Schweiz', kinder: '1 Kind', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz', 'partner-de-job': 'Nur in der Schweiz' }),
    ...PEOPLE,
    // The Kinderzulage is in Ziffer 1 without a remark: the user names it from the payslips (215 CHF a month).
    ...own('chLohnausweis', { ...NGRE_COMMON, krankenkasseChf: '3593', familienzulagenChf: '2580', familienzulagenImBruttolohn: 'true', pkArbeitnehmerChf: '2892', pkArbeitgeberChf: '2892', pkArbeitgeberGesamtChf: '7186', wechselkurs: '1.065', arbeitgeberName: A_EMPLOYER.name, arbeitgeberStrasse: A_EMPLOYER.street, arbeitgeberPlzOrt: A_EMPLOYER.place }, 'A'),
    ...own('chLohnausweis', { ...NGRE_COMMON, krankenkasseChf: '3593', familienzulagenChf: '0', pkArbeitnehmerChf: '2892', pkArbeitgeberChf: '2892', pkArbeitgeberGesamtChf: '7362', wechselkurs: '1.065', arbeitgeberName: B_EMPLOYER.name, arbeitgeberStrasse: B_EMPLOYER.street, arbeitgeberPlzOrt: B_EMPLOYER.place }, 'B'),
    ...own('commute', { oneWayKm: '67', transport: 'pkw', travelDays: '226', homeOfficeDays: '0', shortestRouteConfirmed: 'true', workEquipmentEur: '110', accountFeesEur: '32' }, 'A'),
    ...own('commute', { oneWayKm: '24', transport: 'pkw', travelDays: '226', homeOfficeDays: '0', shortestRouteConfirmed: 'true', workEquipmentEur: '110', accountFeesEur: '32' }, 'B'),
    ...own('interview', { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }, 'A'),
    ...own('interview', { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }, 'B'),
    ...own('interview', { einkuenfte: 'Kapitalerträge', 'kap-depot': 'Deutscher Broker', spenden: 'Ja', 'haushalt-gate': 'Ja', 'vorauszahlungen-gate': 'Ja', 'kv-pv': 'Nein', altersvorsorge: 'Nein', versicherungen: 'Nein', riester: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein', abfindung: 'Nein', umzug: 'Nein', dhf: 'Nein', fortbildung: 'Nein', homeoffice: 'Nie', partner: 'Ja', beruf: 'IT & Software', 'spenden-betrag': '3135', 'gesundheit-gate': 'Ja', 'gesundheit-betrag': '390', 'vorauszahlungen-betrag': '62144', 'haushalt-handwerker-betrag': '350', 'haushalt-handwerker-rechnungsbetrag': '2938' }),
    ...own('kapital', { kapitalertraege: '2449', sparerPauschbetrag: '2000', kapitalertragsteuer: '0', solidaritaetszuschlag: '0', kirchensteuer: '0', inhaber: 'gemeinsam' }),
    ...forChild({ kinship: '1', kinshipB: '1', domesticResidenceAllYear: 'true', registeredWithMeAllYear: 'true', childBenefitToMeAllYear: 'true', familyBenefitsOffice: 'Familienkasse Baden-Württemberg West', healthInsuranceAbroad: 'true', childcareProvider: 'Kindergarten', childBenefitClaimEur: '3060', healthBasicEur: '963', childcareEur: '591', childcareFrom: '01.01.2025', childcareTo: '31.12.2025', swissFamilyAllowancePayer: 'A' }),
  ],
  notice: { taxableIncome: 221690, resultAfterPrepayments: -4633.52 },
  corrections: [
    { id: 'kv-wechsel', what: 'Grundversicherung des zweiten Versicherers (Juli bis Dezember) für alle drei, Kind in Kz 89', source: '§ 10 Abs. 1 Nr. 3 a EStG; BMF 24.05.2017 Rz. 140', certainty: 'hoch' },
    { id: 'kinderzulage', what: 'Kinderzulage 2.580 CHF steuerfrei (N-Gre Z. 8)', source: 'Anleitung Anlage N-Gre 2025; § 65 EStG; BFH VI R 24/17', certainty: 'hoch' },
    { id: 'nbu', what: 'Hälfte der NBUV-Prämie als Werbungskosten', source: 'Anleitung Anlage N-Gre Z. 97/98; BMF 28.10.2009 Tz. 1.3', certainty: 'hoch' },
    { id: 'ahv-grundlage', what: 'Folge der Kinderzulage: sie ist kein AHV-Lohn, die abziehbare Altersvorsorge sinkt (AHV 5,05 % von Z. 77)', source: 'Anleitung Anlage N-Gre Z. 75 bis 77 und 83', certainty: 'hoch' },
    { id: 'anrechnung', what: 'Quellensteuer auf die steuerfreie Kinderzulage nicht angerechnet', source: 'Anleitung Anlage N-Gre Z. 25', certainty: 'mittel' },
  ],
  target: { taxableIncome: 214556, resultAfterPrepayments: -1405 },
  appDeviations: [{ id: 'anrechnung', what: 'Die App rechnet die Quellensteuer auf den ganzen Bruttolohn an (4,5 %), auch auf die steuerfreie Kinderzulage', taxableIncomeEur: 0, resultEur: 124 }],
}

export const GRENZGAENGER_PAAR = { personA: A_NAME, personB: B_NAME, years: [year2024, year2025] } as const
