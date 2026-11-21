// The owl asks for what still blocks the printout (ADR-0091, Nachtrag). The printout check names a
// gap by a code (`kinder`, `kapital`, `grenzgaengerPersonB`, …); this plan turns each code into the
// concrete fields of a person, a child or a rental object that would close it, reads which of them
// are still empty, and says for each whether the owl may prepare it or where the user enters it.
// Deterministic: the model gets it as a checklist, and the app asks it itself when the model does not.
import { mandatoryCapitalFields, classifyCapitalDepot } from '../domains/capital'
import { lstbSubsidyQuestionOpen } from '../domains/lstb'
import { AMOUNT_LATER } from './interview'
import { PERSON_B_HANDLE, PERSON_B_SCREENS, PERSON_B_INTERVIEW_FIELDS, type AdvisorPerson } from './advisor-household'
import { isAiWritableField } from './field-catalog'
import type { Screen } from './marking'

/** One field the plan reads to decide what to ask: whose, which mask, which record. */
export interface PrintoutGapTarget {
  /** The printout check's code this field belongs to. */
  readonly code: string
  readonly screen: Screen
  readonly field: string
  readonly person: AdvisorPerson
  /** The neutral name of the record („Kind 1“, „Objekt 1“), or „neu“ for one still to create. */
  readonly record?: string | undefined
}

export interface PrintoutGapContext {
  /** A joint return with a Person B (ADR-0054). */
  readonly joint: boolean
  /** Person B, when there is one: `recordable` while the user records B's data (B has no own account). */
  readonly personB: { readonly recordable: boolean } | null
  /** Neutral names of the recorded children and rental objects, in stored order. */
  readonly children: readonly string[]
  readonly rentals: readonly string[]
  /** The user consented to personal data for the owl (ADR-0091). */
  readonly personalDataConsent: boolean
  /** The tax year of the conversation: a question names this year, never a fixed one. */
  readonly taxYear?: number | undefined
}

export interface PrintoutGapQuestion extends PrintoutGapTarget {
  /** `person|screen[:record].field`, the key the values are read under. */
  readonly key: string
  /** Who it is about, as the user reads it: „Du“, „Person B“, „Kind 1“, „Objekt 1“. */
  readonly subject: string
  /** The question in German. */
  readonly question: string
  /** The mask the user fills it in. */
  readonly mask: string
  /** The owl may prepare it as a draft (catalogue, consent, Person B's own masks). */
  readonly owlMayDraft: boolean
  /** Blocks the printout; false for what only makes it complete (religion, Kindergeld flags). */
  readonly required: boolean
  /** Words that show an answer already asks for it. */
  readonly keywords: readonly string[]
}

export interface PrintoutGapPlan {
  readonly questions: readonly PrintoutGapQuestion[]
  /** Codes no field closes here (a form the app does not print yet, a confirmation, a field too long). */
  readonly unplanned: readonly string[]
}

export type PrintoutGapValues = Readonly<Record<string, string | null | undefined>>

export function printoutGapKey(target: Pick<PrintoutGapTarget, 'person' | 'screen' | 'field' | 'record'>): string {
  return `${target.person}|${target.screen}${target.record ? `:${target.record}` : ''}.${target.field}`
}

interface FieldText {
  readonly question: string
  readonly keywords: readonly string[]
}

const KINSHIP: FieldText = { question: 'Verwandtschaft: leibliches Kind, Adoptiv-, Pflege- oder Enkel-/Stiefkind?', keywords: ['leiblich', 'verwandtschaft', 'kindschaft'] }
const OTHER_PARENT = ['elternteil', 'mutter', 'vater']

/** What is asked per field, in German, and the words an answer asking for it would contain. */
const TEXTS: Readonly<Record<string, FieldText>> = {
  'profil.firstName': { question: 'Vorname?', keywords: ['vorname'] },
  'profil.lastName': { question: 'Nachname?', keywords: ['nachname'] },
  'profil.steuerId': { question: 'Steuer-ID (11 Ziffern)?', keywords: ['steuer-id', 'identifikationsnummer'] },
  'stammdaten.geburtsdatum': { question: 'Geburtsdatum?', keywords: ['geburtsdatum', 'geboren'] },
  'stammdaten.strasse': { question: 'Straße der Wohnanschrift?', keywords: ['straße', 'anschrift', 'adresse'] },
  'stammdaten.hausnummer': { question: 'Hausnummer?', keywords: ['hausnummer', 'anschrift', 'adresse'] },
  'stammdaten.plz': { question: 'Postleitzahl?', keywords: ['postleitzahl', 'plz', 'anschrift', 'adresse'] },
  'stammdaten.wohnort': { question: 'Wohnort?', keywords: ['wohnort', 'anschrift', 'adresse'] },
  'stammdaten.religion': { question: 'Religionszugehörigkeit (oder konfessionslos)?', keywords: ['religion', 'konfession', 'kirche'] },
  'stammdaten.familienstand': { question: 'Familienstand?', keywords: ['familienstand'] },
  'stammdaten.iban': { question: 'IBAN für die Erstattung?', keywords: ['iban', 'konto'] },
  'stammdaten.finanzamt': { question: 'Zuständiges Finanzamt?', keywords: ['finanzamt'] },
  'stammdaten.beruf': { question: 'Beruf?', keywords: ['beruf'] },
  'kopplung.filingType': { question: 'Zusammen- oder Einzelveranlagung?', keywords: ['veranlag'] },
  'interview.kap-depot': { question: 'Liegt das Depot bei einem deutschen oder einem ausländischen Broker (oder ist es Krypto)?', keywords: ['broker', 'depotart'] },
  'kapital.inhaber': { question: 'Wem gehört das Depot: dir, Person B oder euch gemeinsam?', keywords: ['gehört', 'wessen', 'inhaber', 'gemeinsam'] },
  'kapital.sparerPauschbetrag': { question: 'Wie viel Sparer-Pauschbetrag wurde laut Steuerbescheinigung über Freistellungsaufträge genutzt (auch 0)?', keywords: ['sparer'] },
  'kapital.kapitalertragsteuer': { question: 'Einbehaltene Kapitalertragsteuer (auch 0)?', keywords: ['kapitalertragsteuer'] },
  'kapital.solidaritaetszuschlag': { question: 'Einbehaltener Solidaritätszuschlag (auch 0)?', keywords: ['solidarit'] },
  'kapital.kirchensteuer': { question: 'Einbehaltene Kirchensteuer auf die Kapitalerträge (auch 0)?', keywords: ['kirchensteuer'] },
  // „{jahr}“ is the tax year of the conversation (`questionFor`).
  'interview.ch-wohnsitz': { question: 'Wohnsitz{jahr}: Deutschland oder Schweiz?', keywords: ['wohnsitz', 'wohnt', 'wohnen'] },
  'interview.ch-nichtrueckkehrtage': { question: 'An wie vielen Arbeitstagen nicht nach Hause zurückgekehrt (Nichtrückkehrtage, auch 0)?', keywords: ['nichtrückkehr', 'zurückgekehrt', 'zurückgefahren'] },
  'chLohnausweis.wechselkurs': { question: 'Welcher Wechselkurs: der Jahresdurchschnitt oder ein Monatskurs?', keywords: ['kurs'] },
  'chLohnausweis.bruttolohn-total': { question: 'Bruttolohn total (Lohnausweis Ziffer 8)?', keywords: ['bruttolohn', 'lohnausweis'] },
  'chLohnausweis.ahv-beitraege': { question: 'AHV/IV/EO/ALV/NBUV-Beiträge (Ziffer 9)?', keywords: ['ahv', 'lohnausweis'] },
  'chLohnausweis.quellensteuer': { question: 'Quellensteuer (Ziffer 12, auch 0)?', keywords: ['quellensteuer', 'lohnausweis'] },
  'chLohnausweis.familienzulagenChf': { question: 'Im Lohn enthaltene Familien- oder Kinderzulagen in CHF (auch 0)?', keywords: ['zulage'] },
  'chLohnausweis.krankentaggeldChf': { question: 'Selbst gezahlte Prämie zur Krankentaggeldversicherung in CHF (0, wenn der Arbeitgeber sie ganz trägt)?', keywords: ['krankentaggeld'] },
  'chLohnausweis.krankentaggeldArbeitgeberProzent': { question: 'Welchen Anteil der Krankentaggeld-Prämie trägt der Arbeitgeber (in %)?', keywords: ['krankentaggeld'] },
  'chLohnausweis.krankentaggeldArbeitgeberChf': { question: 'Arbeitgeberanteil der Krankentaggeld-Prämie in CHF?', keywords: ['krankentaggeld'] },
  'chLohnausweis.nbuvArbeitgeberProzent': { question: 'Welchen Anteil der Nichtberufsunfall-Prämie (NBUV) trägt der Arbeitgeber (in %)?', keywords: ['nbu', 'nichtberufsunfall'] },
  'chLohnausweis.nbuvArbeitgeberChf': { question: 'Arbeitgeberanteil der NBUV-Prämie in CHF?', keywords: ['nbu', 'nichtberufsunfall'] },
  'chLohnausweis.pkArbeitnehmerChf': { question: 'Obligatorischer Pensionskassenbeitrag (BVG) des Arbeitnehmers in CHF?', keywords: ['pensionskasse', 'bvg'] },
  'chLohnausweis.pkArbeitgeberChf': { question: 'Obligatorischer Pensionskassenbeitrag (BVG) des Arbeitgebers in CHF?', keywords: ['pensionskasse', 'bvg'] },
  'chLohnausweis.arbeitgeberName': { question: 'Name des Schweizer Arbeitgebers?', keywords: ['arbeitgeber'] },
  'chLohnausweis.arbeitgeberStrasse': { question: 'Straße des Arbeitgebers?', keywords: ['arbeitgeber'] },
  'chLohnausweis.arbeitgeberPlzOrt': { question: 'PLZ und Ort des Arbeitgebers?', keywords: ['arbeitgeber'] },
  'chLohnausweis.nGreSonderfaelle': { question: 'Liegt ein Sonderfall der Anlage N-Gre vor (z. B. Wochenaufenthalt, Arbeit außerhalb der Grenzzone) oder keiner?', keywords: ['sonderfall', 'sonderfälle'] },
  'kind.firstName': { question: 'Welche Kinder: Vorname und Geburtsdatum je Kind?', keywords: ['vorname', 'geburtsdatum'] },
  'kind.taxId': { question: 'Steuer-ID des Kindes?', keywords: ['steuer-id', 'identifikationsnummer'] },
  'kind.kinship': KINSHIP,
  'kind.kinshipB': { question: 'Verwandtschaft zu Person B: leibliches Kind, Adoptiv-, Pflege- oder Enkel-/Stiefkind?', keywords: KINSHIP.keywords },
  'kind.familyBenefitsOffice': { question: 'Welche Familienkasse ist zuständig?', keywords: ['familienkasse'] },
  'kind.domesticResidenceAllYear': { question: 'Hat das Kind das ganze Jahr in Deutschland gewohnt?', keywords: ['inland', 'in deutschland gewohnt', 'ganze jahr'] },
  'kind.otherParent': { question: 'Der andere Elternteil: lebt im Inland, im Ausland, ist verstorben oder unbekannt?', keywords: OTHER_PARENT },
  'kind.otherParentName': { question: 'Name des anderen Elternteils?', keywords: OTHER_PARENT },
  'kind.otherParentBirthDate': { question: 'Geburtsdatum des anderen Elternteils?', keywords: OTHER_PARENT },
  'kind.otherParentAddress': { question: 'Letzte bekannte Anschrift des anderen Elternteils?', keywords: OTHER_PARENT },
  'kind.otherParentKind': { question: 'Ist es das leibliche Kind oder Adoptivkind des anderen Elternteils?', keywords: OTHER_PARENT },
  'kind.otherParentDiedOn': { question: 'Wann ist der andere Elternteil verstorben?', keywords: ['verstorben'] },
  'kind.registeredWithMeAllYear': { question: 'War das Kind das ganze Jahr bei dir gemeldet?', keywords: ['gemeldet'] },
  'kind.childBenefitToMeAllYear': { question: 'Wurde das Kindergeld das ganze Jahr an dich gezahlt?', keywords: ['kindergeld'] },
  'kind.swissFamilyAllowancePayer': { question: 'Über wessen Schweizer Lohn kommt die Kinderzulage für dieses Kind: deinen oder den von Person B?', keywords: ['kinderzulage', 'zulage'] },
  'vermietung.mieteinnahmen': { question: 'Mieteinnahmen im Jahr?', keywords: ['miete'] },
  'vermietung.werbungskosten': { question: 'Laufende Werbungskosten des Objekts im Jahr?', keywords: ['werbungskosten'] },
  'vermietung.anschaffungskosten': { question: 'Anschaffungskosten des Gebäudes?', keywords: ['anschaffung'] },
  'vermietung.baujahr': { question: 'Baujahr?', keywords: ['baujahr'] },
  'vermietung.strasse': { question: 'Straße des Objekts?', keywords: ['adresse', 'anschrift', 'straße'] },
  'vermietung.hausnummer': { question: 'Hausnummer des Objekts?', keywords: ['adresse', 'anschrift', 'hausnummer'] },
  'vermietung.plz': { question: 'Postleitzahl des Objekts?', keywords: ['adresse', 'anschrift', 'postleitzahl'] },
  'vermietung.city': { question: 'Ort des Objekts?', keywords: ['adresse', 'anschrift', 'ort'] },
  'vermietung.depreciationAsLastYear': { question: 'Läuft die Abschreibung (AfA) wie im Vorjahr weiter?', keywords: ['afa', 'abschreibung'] },
  // The fixed rules (ADR-0093): asked while the stored values leave them open.
  'lstb.zuschuesseKvPv': { question: 'Lohnsteuerbescheinigung Zeile 24: steuerfreie Arbeitgeberzuschüsse zur Kranken- und Pflegeversicherung (auch 0)? Zeile 25 oder 26 ist gefüllt, ohne Zeile 24 ist die Sozialversicherung nicht vollständig.', keywords: ['zeile 24', 'arbeitgeberzusch'] },
  'commute.shortestRouteConfirmed': { question: 'Es zählt die kürzeste Straßenverbindung (§ 9 Abs. 1 Nr. 4 EStG): Sind die erfassten Kilometer die kürzeste Strecke zur Arbeit?', keywords: ['kürzeste'] },
  'commute.secondShortestRouteConfirmed': { question: 'Sind auch die Kilometer des zweiten Arbeitswegs die kürzeste Straßenverbindung?', keywords: ['kürzeste'] },
  'commute.periodFrom': { question: 'Es gab im Jahr zwei Arbeitgeber: Für welchen Zeitraum gilt der erfasste Arbeitsweg (von/bis), und gibt es für den anderen Arbeitgeber einen eigenen Weg (Kilometer, Fahrtage) oder keinen?', keywords: ['zeitraum', 'arbeitgeberwechsel', 'anderen arbeitgeber'] },
  'chLohnausweis.steuerfreiesKrankentaggeldChf': {
    question:
      'Wurde im Jahr Krankentaggeld (auch Unfall- oder Mutterschaftstaggeld) ausgezahlt, und ist es im Bruttolohn Ziffer 8 des Lohnausweises enthalten (Hinweis z. B. eine Bemerkung wie „KK-Taggeld Verrechnung“)? Wenn ja: welcher Betrag in CHF laut Taggeld-Abrechnung? Ohne Taggeld: 0.',
    keywords: ['taggeld ausgezahlt', 'ausgezahltes krankentaggeld', 'ausgezahlte krankentaggeld', 'ausgezahltes taggeld', 'ausgezahlte taggeld'],
  },
  'kapital.kapitalertraege': { question: 'Wie hoch waren die Kapitalerträge im Jahr laut Steuerbescheinigung der Bank (auch wenn der Freistellungsauftrag sie abdeckt)?', keywords: ['höhe der kapitalertr', 'steuerbescheinigung'] },
  'kind.childBenefitClaimEur': { question: 'Kindergeld: Für wie viele Monate bestand im Jahr Anspruch auf deutsches Kindergeld (auch wenn eine Schweizer Kinderzulage es kürzt)? Der Anspruch im Jahr gehört in die Anlage Kind, auch 0.', keywords: ['kindergeld'] },
  'chLohnausweis.krankenkasseZusatzChf': { question: 'Krankenkasse: Wie viel vom erfassten Betrag entfällt auf Zusatzversicherungen (VVG) statt auf die Grundversicherung (KVG)? In CHF, auch 0.', keywords: ['zusatzversicherung', 'vvg', 'grundversicherung'] },
  'interview.einkuenfte': { question: 'Gab es Kapitalerträge (Zinsen, Dividenden, ein Depot; auch wenn ein Freistellungsauftrag sie abdeckt oder ohne deutschen Steuerabzug, z. B. bei einer ausländischen Bank), oder Mieteinnahmen?', keywords: ['kapitalertr', 'freistellungsauftrag', 'sparer-pauschbetrag'] },
  'interview.vorauszahlungen-gate': { question: 'Hat das Finanzamt für das Jahr Einkommensteuer-Vorauszahlungen festgesetzt?', keywords: ['vorauszahlung'] },
  'interview.vorauszahlungen-betrag': { question: 'Wie viel hast du für das Jahr an Vorauszahlungen gezahlt, Einkommensteuer, Soli und Kirchensteuer zusammen (Euro)?', keywords: ['vorauszahlung'] },
  'interview.riester-art': { question: 'Riester: unmittelbar oder mittelbar begünstigt?', keywords: ['mittelbar'] },
  'interview.riester-einnahmen-vorjahr': { question: 'Beitragspflichtige Einnahmen des Vorjahrs (für Riester)?', keywords: ['vorjahr'] },
}

const MASKS: Readonly<Partial<Record<Screen, string>>> = {
  profil: 'Profil',
  stammdaten: 'Stammdaten',
  kopplung: 'Kopplung',
  kind: 'Kinder',
  kapital: 'Kapitalerträge',
  chLohnausweis: 'Lohnausweis (Schweiz)',
  vermietung: 'Vermietung',
  lstb: 'Lohnsteuerbescheinigung',
  commute: 'Arbeitsweg',
}

function maskOf(screen: Screen, field: string): string {
  if (screen !== 'interview') return MASKS[screen] ?? screen
  if (field.startsWith('ch-')) return 'Schweiz (Grenzgänger)'
  if (field === 'kap-depot') return 'Kapitalerträge'
  if (field === 'einkuenfte') return 'Weitere Einkünfte'
  if (field.startsWith('vorauszahlungen')) return 'Vorauszahlungen'
  return 'Riester'
}

/** Master data the printout names by the field itself (`printoutValues`, REQUIRED_MASTER_DATA). */
const MASTER_DATA_CODES: Readonly<Record<string, readonly [Screen, string]>> = {
  name: ['profil', 'lastName'],
  vorname: ['profil', 'firstName'],
  steuerId: ['profil', 'steuerId'],
  geburtsdatum: ['stammdaten', 'geburtsdatum'],
  strasse: ['stammdaten', 'strasse'],
  hausnummer: ['stammdaten', 'hausnummer'],
  plz: ['stammdaten', 'plz'],
  wohnort: ['stammdaten', 'wohnort'],
  religion: ['stammdaten', 'religion'],
  familienstand: ['stammdaten', 'familienstand'],
  iban: ['stammdaten', 'iban'],
  finanzamt: ['stammdaten', 'finanzamt'],
}

const CAPITAL_AMOUNTS = ['sparerPauschbetrag', 'kapitalertragsteuer', 'solidaritaetszuschlag', 'kirchensteuer'] as const
const CROSS_BORDER_FIELDS = [
  'wechselkurs',
  'bruttolohn-total',
  'ahv-beitraege',
  'quellensteuer',
  'familienzulagenChf',
  'krankentaggeldChf',
  'pkArbeitnehmerChf',
  'pkArbeitgeberChf',
  'arbeitgeberName',
  'arbeitgeberStrasse',
  'arbeitgeberPlzOrt',
  'nGreSonderfaelle',
  'krankentaggeldArbeitgeberProzent',
  'krankentaggeldArbeitgeberChf',
  'nbuvArbeitgeberProzent',
  'nbuvArbeitgeberChf',
] as const
const CHILD_FIELDS = [
  'taxId',
  'kinship',
  'kinshipB',
  'familyBenefitsOffice',
  'domesticResidenceAllYear',
  'otherParent',
  'otherParentName',
  'otherParentBirthDate',
  'otherParentAddress',
  'otherParentKind',
  'otherParentDiedOn',
  'registeredWithMeAllYear',
  'childBenefitToMeAllYear',
  'swissFamilyAllowancePayer',
] as const
const RENTAL_FIELDS = ['mieteinnahmen', 'werbungskosten', 'anschaffungskosten', 'baujahr', 'strasse', 'hausnummer', 'plz', 'city', 'depreciationAsLastYear'] as const
const PERSON_B_FIELDS: readonly (readonly [Screen, string, boolean])[] = [
  ['profil', 'firstName', true],
  ['profil', 'lastName', true],
  ['profil', 'steuerId', true],
  ['stammdaten', 'geburtsdatum', true],
  ['stammdaten', 'religion', false],
  ['stammdaten', 'beruf', false],
]

/** Every field that may close one of the gaps; the app reads them so the plan asks only what is empty. */
export function printoutGapReads(missing: readonly string[], ctx: PrintoutGapContext): PrintoutGapTarget[] {
  const reads = new Map<string, PrintoutGapTarget>()
  const add = (code: string, person: AdvisorPerson, screen: Screen, field: string, record?: string) => {
    const target: PrintoutGapTarget = { code, screen, field, person, ...(record ? { record } : {}) }
    const key = printoutGapKey(target)
    if (!reads.has(key)) reads.set(key, target)
  }
  for (const code of missing) {
    if (code === 'kapital') {
      add(code, 'A', 'interview', 'kap-depot')
      for (const field of ['kapitalertraege', ...CAPITAL_AMOUNTS, 'inhaber']) add(code, 'A', 'kapital', field)
    } else if (code === 'grenzgaenger' || code === 'grenzgaengerPersonB') {
      const person = code === 'grenzgaenger' ? 'A' : 'B'
      add(code, person, 'interview', 'ch-wohnsitz')
      add(code, person, 'interview', 'ch-nichtrueckkehrtage')
      for (const field of CROSS_BORDER_FIELDS) add(code, person, 'chLohnausweis', field)
    } else if (code === 'kinder') {
      for (const handle of ctx.children) for (const field of CHILD_FIELDS) add(code, 'A', 'kind', field, handle)
      for (const person of ['A', 'B'] as const) add(code, person, 'chLohnausweis', 'familienzulagenChf')
    } else if (code === 'personB') {
      for (const [screen, field] of PERSON_B_FIELDS) add(code, 'B', screen, field)
    } else if (code === 'vermietung') {
      for (const handle of ctx.rentals) for (const field of RENTAL_FIELDS) add(code, 'A', 'vermietung', field, handle)
    } else if (code === 'riester') {
      add(code, 'A', 'interview', 'riester-art')
      add(code, 'A', 'interview', 'riester-einnahmen-vorjahr')
    } else if (code === 'regelKindergeld') {
      for (const handle of ctx.children) add(code, 'A', 'kind', 'childBenefitClaimEur', handle)
    } else if (code in RULE_READS) {
      const person = rulePerson(code)
      if (person === 'B' && ctx.personB === null) continue
      for (const [screen, field] of RULE_READS[code]!) add(code, person, screen, field)
    }
  }
  return [...reads.values()]
}

const rulePerson = (code: string): AdvisorPerson => (code.endsWith('PersonB') ? 'B' : 'A')

const LSTB_RULE_READS: readonly (readonly [Screen, string])[] = [['lstb', 'kvArbeitnehmer'], ['lstb', 'pvArbeitnehmer'], ['lstb', 'zuschuesseKvPv']]
const COMMUTE_RULE_READS: readonly (readonly [Screen, string])[] = [
  ['commute', 'oneWayKm'],
  ['commute', 'shortestRouteConfirmed'],
  ['commute', 'secondOneWayKm'],
  ['commute', 'secondShortestRouteConfirmed'],
  ['commute', 'periodFrom'],
  ['commute', 'periodTo'],
  ['lstb', 'bruttoarbeitslohn'],
  ['chLohnausweis', 'bruttolohn-total'],
]
const HEALTH_RULE_READS: readonly (readonly [Screen, string])[] = [['chLohnausweis', 'krankenkasseChf'], ['chLohnausweis', 'krankenkasseZusatzChf']]
const SICK_PAY_RULE_READS: readonly (readonly [Screen, string])[] = [['chLohnausweis', 'bruttolohn-total'], ['chLohnausweis', 'steuerfreiesKrankentaggeldChf']]

/** What each fixed rule (ADR-0093) reads to decide whether it is still open. */
const RULE_READS: Readonly<Record<string, readonly (readonly [Screen, string])[]>> = {
  regelLstb: LSTB_RULE_READS,
  regelLstbPersonB: LSTB_RULE_READS,
  regelArbeitsweg: COMMUTE_RULE_READS,
  regelArbeitswegPersonB: COMMUTE_RULE_READS,
  regelKrankenkasse: HEALTH_RULE_READS,
  regelKrankenkassePersonB: HEALTH_RULE_READS,
  regelKrankentaggeld: SICK_PAY_RULE_READS,
  regelKrankentaggeldPersonB: SICK_PAY_RULE_READS,
  regelKapital: [['interview', 'einkuenfte'], ['kapital', 'kapitalertraege']],
  regelVorauszahlungen: [['interview', 'vorauszahlungen-gate'], ['interview', 'vorauszahlungen-betrag']],
}

/** The fields a fixed rule still needs, from the values read for it. */
function ruleGaps(code: string, read: (screen: Screen, field: string) => string | null | undefined): [Screen, string][] {
  const amount = (screen: Screen, field: string): number | null => (isInteger(read(screen, field)) ? Number(read(screen, field)) : null)
  const out: [Screen, string][] = []
  if (code.startsWith('regelLstb')) {
    if (lstbSubsidyQuestionOpen({ kvArbeitnehmer: amount('lstb', 'kvArbeitnehmer'), pvArbeitnehmer: amount('lstb', 'pvArbeitnehmer'), zuschuesseKvPv: amount('lstb', 'zuschuesseKvPv') })) {
      out.push(['lstb', 'zuschuesseKvPv'])
    }
  } else if (code.startsWith('regelArbeitsweg')) {
    const first = (amount('commute', 'oneWayKm') ?? 0) > 0
    const second = (amount('commute', 'secondOneWayKm') ?? 0) > 0
    if (first && read('commute', 'shortestRouteConfirmed') !== 'true') out.push(['commute', 'shortestRouteConfirmed'])
    if (second && read('commute', 'secondShortestRouteConfirmed') !== 'true') out.push(['commute', 'secondShortestRouteConfirmed'])
    // Two employers in the year (a German certificate and a Swiss one): one way for the whole year
    // is a guess. A period or a second way answers it.
    const twoEmployers = amount('lstb', 'bruttoarbeitslohn') !== null && amount('chLohnausweis', 'bruttolohn-total') !== null
    if (twoEmployers && first && !second && empty(read('commute', 'periodFrom')) && empty(read('commute', 'periodTo'))) out.push(['commute', 'periodFrom'])
  } else if (code.startsWith('regelKrankenkasse')) {
    if ((amount('chLohnausweis', 'krankenkasseChf') ?? 0) > 0 && amount('chLohnausweis', 'krankenkasseZusatzChf') === null) out.push(['chLohnausweis', 'krankenkasseZusatzChf'])
  } else if (code.startsWith('regelKrankentaggeld')) {
    // A recorded Swiss wage statement without the answer: a tax-free benefit may still sit in the wage (real-data run).
    if ((amount('chLohnausweis', 'bruttolohn-total') ?? 0) > 0 && amount('chLohnausweis', 'steuerfreiesKrankentaggeldChf') === null) out.push(['chLohnausweis', 'steuerfreiesKrankentaggeldChf'])
  } else if (code === 'regelKapital') {
    const answer = read('interview', 'einkuenfte')
    if (empty(answer)) out.push(['interview', 'einkuenfte'])
    // „Yes, capital income“ without its amount records nothing.
    else if ((answer === 'Kapitalerträge' || answer === 'Beides') && amount('kapital', 'kapitalertraege') === null) out.push(['kapital', 'kapitalertraege'])
  } else if (code === 'regelVorauszahlungen') {
    const gate = read('interview', 'vorauszahlungen-gate')
    const paid = read('interview', 'vorauszahlungen-betrag')
    if (gate !== 'Ja' && gate !== 'Nein') out.push(['interview', 'vorauszahlungen-gate'])
    else if (gate === 'Ja' && !isInteger(paid) && paid !== AMOUNT_LATER) out.push(['interview', 'vorauszahlungen-betrag'])
  }
  return out
}

const empty = (value: string | null | undefined): boolean => value === null || value === undefined || value.trim() === ''
const isInteger = (value: string | null | undefined): boolean => value !== null && value !== undefined && /^\d+$/.test(value)

/** Whether the owl may draft this field for this person, as the write path would allow it. */
function owlMayDraft(ctx: PrintoutGapContext, target: PrintoutGapTarget): boolean {
  if (!isAiWritableField(target.screen, target.field, ctx.personalDataConsent)) return false
  if (target.person === 'A') return true
  if (ctx.personB?.recordable !== true) return false
  return PERSON_B_SCREENS.has(target.screen) || (target.screen === 'interview' && PERSON_B_INTERVIEW_FIELDS.has(target.field))
}

function subjectOf(target: PrintoutGapTarget): string {
  if (target.record === 'neu') return 'Kinder'
  if (target.record) return target.record
  return target.person === 'B' ? PERSON_B_HANDLE : 'Du'
}

function questionFor(ctx: PrintoutGapContext, target: PrintoutGapTarget, required: boolean): PrintoutGapQuestion {
  const known = TEXTS[`${target.screen}.${target.field}`] ?? { question: `${target.field}?`, keywords: [target.field.toLowerCase()] }
  const text = { ...known, question: known.question.replace('{jahr}', ctx.taxYear === undefined ? '' : ` ${ctx.taxYear}`) }
  const mask = maskOf(target.screen, target.field)
  return {
    ...target,
    key: printoutGapKey(target),
    subject: subjectOf(target),
    question: text.question,
    mask: target.person === 'B' ? (ctx.personB?.recordable === true ? `${mask} von ${PERSON_B_HANDLE}` : `im eigenen Konto von ${PERSON_B_HANDLE}`) : mask,
    owlMayDraft: owlMayDraft(ctx, target),
    required,
    keywords: text.keywords,
  }
}

/** The fields of one Grenzgänger that the N-Gre still lacks (`nGreGap` in the printout, field by field). */
function crossBorderGaps(read: (screen: Screen, field: string) => string | null | undefined): [Screen, string][] {
  const out: [Screen, string][] = []
  const residence = read('interview', 'ch-wohnsitz')
  if (empty(residence)) out.push(['interview', 'ch-wohnsitz'])
  if (residence !== 'Schweiz' && !isInteger(read('interview', 'ch-nichtrueckkehrtage'))) out.push(['interview', 'ch-nichtrueckkehrtage'])
  for (const field of CROSS_BORDER_FIELDS.slice(0, 12)) {
    const value = read('chLohnausweis', field)
    const amount = !['wechselkurs', 'arbeitgeberName', 'arbeitgeberStrasse', 'arbeitgeberPlzOrt', 'nGreSonderfaelle'].includes(field)
    if (amount ? !isInteger(value) : empty(value)) out.push(['chLohnausweis', field])
  }
  // Who pays the premiums (printout `premiumClarified`): a share is needed once the employee pays
  // something; an employer paying all of it gives its CHF amount too.
  const sickPay = read('chLohnausweis', 'krankentaggeldChf')
  const sickShare = read('chLohnausweis', 'krankentaggeldArbeitgeberProzent')
  if (empty(sickShare) && isInteger(sickPay) && sickPay !== '0') out.push(['chLohnausweis', 'krankentaggeldArbeitgeberProzent'])
  if (sickShare === '100' && !isInteger(read('chLohnausweis', 'krankentaggeldArbeitgeberChf'))) out.push(['chLohnausweis', 'krankentaggeldArbeitgeberChf'])
  const accidentShare = read('chLohnausweis', 'nbuvArbeitgeberProzent')
  if (empty(accidentShare)) out.push(['chLohnausweis', 'nbuvArbeitgeberProzent'])
  if (accidentShare === '100' && !isInteger(read('chLohnausweis', 'nbuvArbeitgeberChf'))) out.push(['chLohnausweis', 'nbuvArbeitgeberChf'])
  return out
}

/** The fields of one child the Anlage Kind still lacks (`childGap` in the printout); soft ones last. */
function childGaps(ctx: PrintoutGapContext, read: (field: string) => string | null | undefined, swissAllowance: boolean): { hard: string[]; soft: string[] } {
  const hard: string[] = []
  const soft: string[] = []
  const residence = read('domesticResidenceAllYear')
  // A child abroad has its own form the app does not print yet; nothing asked here closes that.
  if (residence === 'false') return { hard, soft }
  for (const field of ['taxId', 'kinship'] as const) if (empty(read(field))) hard.push(field)
  if (ctx.joint && empty(read('kinshipB'))) hard.push('kinshipB')
  for (const field of ['familyBenefitsOffice', 'domesticResidenceAllYear'] as const) if (empty(read(field))) hard.push(field)
  if (!ctx.joint) {
    const otherParent = read('otherParent')
    if (empty(otherParent)) hard.push('otherParent')
    if (otherParent === 'Inland' || otherParent === 'Verstorben') {
      for (const field of ['otherParentName', 'otherParentBirthDate', 'otherParentKind'] as const) if (empty(read(field))) hard.push(field)
      if (otherParent === 'Inland' && empty(read('otherParentAddress'))) hard.push('otherParentAddress')
      if (otherParent === 'Verstorben' && empty(read('otherParentDiedOn'))) hard.push('otherParentDiedOn')
    }
    for (const field of ['registeredWithMeAllYear', 'childBenefitToMeAllYear'] as const) if (empty(read(field))) soft.push(field)
  }
  if (swissAllowance && empty(read('swissFamilyAllowancePayer'))) soft.push('swissFamilyAllowancePayer')
  return { hard, soft }
}

function rentalGaps(read: (field: string) => string | null | undefined): string[] {
  const out: string[] = []
  for (const field of ['mieteinnahmen', 'werbungskosten'] as const) if (!isInteger(read(field))) out.push(field)
  for (const field of ['anschaffungskosten', 'baujahr'] as const) if (read(field) === 'unklar') out.push(field)
  for (const field of ['strasse', 'hausnummer', 'plz', 'city'] as const) if (empty(read(field))) out.push(field)
  if (isInteger(read('anschaffungskosten')) && isInteger(read('baujahr')) && empty(read('depreciationAsLastYear'))) out.push('depreciationAsLastYear')
  return out
}

/** The questions that would close the printout's gaps, from the values read for `printoutGapReads`. */
export function planPrintoutGaps(missing: readonly string[], ctx: PrintoutGapContext, values: PrintoutGapValues): PrintoutGapPlan {
  const questions = new Map<string, PrintoutGapQuestion>()
  const unplanned: string[] = []
  const ask = (target: PrintoutGapTarget, required = true) => {
    const question = questionFor(ctx, target, required)
    if (!questions.has(question.key)) questions.set(question.key, question)
  }
  const valueOf = (person: AdvisorPerson, screen: Screen, field: string, record?: string) => values[printoutGapKey({ person, screen, field, record })]

  for (const code of missing) {
    const master = MASTER_DATA_CODES[code]
    if (master) {
      ask({ code, person: 'A', screen: master[0], field: master[1] })
    } else if (code === 'ehegatte' || (code === 'personB' && ctx.personB === null)) {
      ask({ code, person: 'A', screen: 'kopplung', field: 'filingType' })
    } else if (code === 'personB') {
      for (const [screen, field, required] of PERSON_B_FIELDS) if (empty(valueOf('B', screen, field))) ask({ code, person: 'B', screen, field }, required)
    } else if (code === 'kapital') {
      const depot = valueOf('A', 'interview', 'kap-depot')
      const known = depot === 'Deutscher Broker' || depot === 'Ausländischer Broker'
      if (!known) ask({ code, person: 'A', screen: 'interview', field: 'kap-depot' })
      else {
        for (const field of mandatoryCapitalFields(classifyCapitalDepot(depot).kind)) {
          if (field !== 'kapitalertraege' && !isInteger(valueOf('A', 'kapital', field))) ask({ code, person: 'A', screen: 'kapital', field })
        }
      }
      // In a joint return the account's owner decides whose Anlage KAP it goes on (ADR-0054).
      if (ctx.joint && empty(valueOf('A', 'kapital', 'inhaber'))) ask({ code, person: 'A', screen: 'kapital', field: 'inhaber' })
    } else if (code === 'grenzgaenger' || code === 'grenzgaengerPersonB') {
      const person: AdvisorPerson = code === 'grenzgaenger' ? 'A' : 'B'
      for (const [screen, field] of crossBorderGaps((onScreen, name) => valueOf(person, onScreen, name))) ask({ code, person, screen, field })
    } else if (code === 'kinder') {
      if (ctx.children.length === 0) {
        ask({ code, person: 'A', screen: 'kind', field: 'firstName', record: 'neu' })
        continue
      }
      const swissAllowance = (['A', 'B'] as const).some((person) => Number(valueOf(person, 'chLohnausweis', 'familienzulagenChf') ?? 0) > 0)
      for (const record of ctx.children) {
        // A child's soft fields follow its own hard ones, so one child is asked in one go.
        const gaps = childGaps(ctx, (field) => valueOf('A', 'kind', field, record), swissAllowance)
        for (const field of gaps.hard) ask({ code, person: 'A', screen: 'kind', field, record })
        for (const field of gaps.soft) ask({ code, person: 'A', screen: 'kind', field, record }, false)
      }
    } else if (code === 'vermietung') {
      for (const record of ctx.rentals) for (const field of rentalGaps((name) => valueOf('A', 'vermietung', name, record))) ask({ code, person: 'A', screen: 'vermietung', field, record })
    } else if (code === 'riester') {
      const kind = valueOf('A', 'interview', 'riester-art')
      if (kind !== 'Unmittelbar' && kind !== 'Mittelbar') ask({ code, person: 'A', screen: 'interview', field: 'riester-art' })
      else if (kind === 'Unmittelbar' && !isInteger(valueOf('A', 'interview', 'riester-einnahmen-vorjahr'))) ask({ code, person: 'A', screen: 'interview', field: 'riester-einnahmen-vorjahr' })
    } else if (code === 'regelKindergeld') {
      // The form showed 0 € of Kindergeld in a year nobody had asked for it (real-data run).
      for (const record of ctx.children) if (empty(valueOf('A', 'kind', 'childBenefitClaimEur', record))) ask({ code, person: 'A', screen: 'kind', field: 'childBenefitClaimEur', record })
    } else if (code in RULE_READS) {
      const person = rulePerson(code)
      if (person === 'B' && ctx.personB === null) continue
      for (const [screen, field] of ruleGaps(code, (onScreen, name) => valueOf(person, onScreen, name))) ask({ code, person, screen, field })
    } else if (!unplanned.includes(code)) {
      unplanned.push(code)
    }
  }
  return { questions: [...questions.values()], unplanned }
}

/** The next questions to ask: whole groups (one person, one child) in order while they fit, few per turn. */
export function nextPrintoutGapQuestions(plan: PrintoutGapPlan, max = 4): PrintoutGapQuestion[] {
  const groups: PrintoutGapQuestion[][] = []
  for (const question of plan.questions) {
    const group = groups.find((g) => g[0]!.subject === question.subject)
    if (group) group.push(question)
    else groups.push([question])
  }
  const next: PrintoutGapQuestion[] = []
  for (const group of groups) {
    if (next.length === 0 && group.length > max) return group.slice(0, max)
    if (next.length + group.length > max) break
    next.push(...group)
  }
  return next
}

function targetOf(question: PrintoutGapQuestion): string {
  return [
    `\`${question.screen}.${question.field}\``,
    question.person === 'B' ? ' (person „B“)' : '',
    question.record ? ` (instance „${question.record}“)` : '',
  ].join('')
}

/** The checklist as the case prompt states it, in the plan's order. */
export function describePrintoutPlanForPrompt(plan: PrintoutGapPlan): string[] {
  if (plan.questions.length === 0) return []
  return [
    '',
    'Ausdruck-Checkliste (genau diese Angaben halten den Ausdruck noch auf, in dieser Reihenfolge; „Pflicht“ blockiert den Ausdruck, „ergänzend“ macht ihn vollständig):',
    ...plan.questions.map(
      (q) =>
        `- ${q.subject}: ${q.question} → ${targetOf(q)}, ${q.required ? 'Pflicht' : 'ergänzend'}; ${q.owlMayDraft ? 'du darfst den Entwurf vorbereiten' : `kein Entwurf, der Nutzer trägt es in der Maske „${q.mask}“ ein`}`,
    ),
  ]
}

const MISSING_QUESTION =
  /\b(fehlt|fehlen)\b[^.?!]*\b(noch|jetzt|etwas|was)\b|\bnoch\b[^.?!]*\b(offen|fehlt)\b|\bvollständig\b|\bausdruck(en)?\b|\bdrucken\b|\bmissing\b|\banything (else )?(left|open)\b|\bcomplete\b/iu

/** Whether the user asks what is still missing for the return or its printout. */
export function asksWhatIsMissing(message: string): boolean {
  return MISSING_QUESTION.test(message)
}

export interface PrintoutGapFollowUpInput {
  readonly plan: PrintoutGapPlan
  /** The user's message of this turn. */
  readonly message: string
  /** The owl's reply of this turn, as the model wrote it. */
  readonly reply: string
  /** The drafts of the previous answer were taken over: a natural point to ask the next gaps. */
  readonly previousDraftsApplied: boolean
  /** The keys the previous answer asked already, so the app does not ask the same twice unprompted. */
  readonly previousAsked?: readonly string[] | undefined
  /** Targets the model drafted in this turn (`printoutGapKey`): they are on their way. */
  readonly stagedKeys: readonly string[]
  /** What the user reads for a record handle, e.g. a child's first name. */
  readonly subjectLabels?: Readonly<Record<string, string>> | undefined
}

/**
 * The app's own follow-up when the model leaves the printout's gaps out: when the user asks what is
 * missing, or the previous drafts were applied and this answer asks nothing. `asked` is what is
 * asked now (by the model or here); `text` is what the app adds, empty when the model asked it all.
 */
export function printoutGapFollowUp(input: PrintoutGapFollowUpInput): { readonly text: string; readonly asked: readonly string[] } | null {
  const staged = new Set(input.stagedKeys)
  const open = input.plan.questions.filter((q) => !staged.has(q.key))
  if (open.length === 0) return null
  const asks = asksWhatIsMissing(input.message)
  const quiet = input.previousDraftsApplied && staged.size === 0 && !input.reply.includes('?')
  if (!asks && !quiet) return null
  const next = nextPrintoutGapQuestions({ questions: open, unplanned: [] })
  const asked = next.map((q) => q.key)
  if (!asks && input.previousAsked !== undefined && asked.length === input.previousAsked.length && asked.every((key) => input.previousAsked!.includes(key))) return null
  const reply = input.reply.toLowerCase()
  const unasked = next.filter((q) => !q.keywords.some((word) => reply.includes(word)))
  if (unasked.length === 0) return { text: '', asked }
  const lines: string[] = []
  for (const subject of new Set(unasked.map((q) => q.subject))) {
    const label = input.subjectLabels?.[subject] ? `${subject} (${input.subjectLabels[subject]})` : subject
    const items = unasked
      .filter((q) => q.subject === subject)
      .map((q) => (q.owlMayDraft ? q.question : `${q.question} (trägst du in der Maske „${q.mask}“ ein)`))
    lines.push(`- ${label}: ${items.join(' ')}`)
  }
  const closing = unasked.some((q) => q.owlMayDraft) ? '\nSag mir das, dann bereite ich die Einträge vor.' : ''
  return { text: `\n\nDamit der Ausdruck vollständig ist, fehlt noch:\n${lines.join('\n')}${closing}`, asked }
}
