/**
 * The answer model of the interview: the step ids, the answer values and the reading helpers.
 * The tax rules in `domains` read answers through it; the interview graph in `interview/interview.ts`
 * builds on it (ADR-0102).
 */
export type MinimalGateQuestionId =
  | 'job'
  | 'rente-selbststaendig'
  | 'ausland'
  | 'de-job'
  | 'kinder'
  | 'familienstand'
  | 'partner-job'
  | 'partner-ausland'
  | 'partner-de-job'

export type MinimalGateGateId = 'gewerbe' | 'ch-only'

export type SegmentTwoQuestionId =
  | 'partner'
  | 'homeoffice'
  | 'weg'
  | 'tage'
  | 'fortbildung'
  | 'fortbildung-kosten'
  | 'einkuenfte'
  | 'kap-depot'
  | 'vermietung-art'

export type SegmentTwoGateId = 'krypto-gate' | 'vermietung-gate'

export type LifeSituationQuestionId =
  | 'dhf'
  | 'dhf-miete'
  | 'umzug'
  | 'umzug-kosten'
  | 'abfindung'
  | 'abfindung-betrag'
  | 'lohnersatz'
  | 'lohnersatz-betrag'
  | 'nebenjob'
  | 'nebenjob-brutto'

export type SpecialExpenseQuestionId =
  | 'spenden'
  | 'spenden-betrag'
  | 'kv-pv'
  | 'kv-pv-art'
  | 'kv-krankengeld'
  | 'kv-pv-betrag'
  | 'pv-betrag'
  | 'kv-wahl-betrag'
  | 'riester'
  | 'riester-betrag'
  | 'riester-art'
  | 'riester-einnahmen-vorjahr'
  | 'altersvorsorge'
  | 'av-rv-betrag'
  | 'av-versorgungswerk-betrag'
  | 'av-basisrente-betrag'
  | 'av-ksk'
  | 'versicherungen'
  | 'versicherungen-betrag'

export type SingleParentQuestionId = 'ae-weitere-person' | 'ae-haushaltsgemeinschaft'

export type HouseholdQuestionId =
  | 'haushalt-gate'
  | 'haushalt-dienstleistung-betrag'
  | 'haushalt-handwerker-betrag'
  | 'haushalt-handwerker-rechnungsbetrag'
  | 'haushalt-minijob-betrag'

export type HealthQuestionId = 'gesundheit-gate' | 'gesundheit-betrag' | 'gesundheit-erstattung'

/** Income tax prepayments of the year (§ 37 EStG), credited against the tax like withheld wage tax (ADR-0081). */
export type PrepaymentQuestionId = 'vorauszahlungen-gate' | 'vorauszahlungen-betrag'

/** Asked where the advice lives (the Eule tab), not in the Minimal-Gate — value first (ADR-0045). */
export type ProfessionQuestionId = 'beruf'

export type SegmentChQuestionId = 'ch-wohnsitz' | 'ch-nichtrueckkehrtage'

export type QuestionId = MinimalGateQuestionId

export type GateId = MinimalGateGateId

export type StepId = QuestionId | GateId

export type Step =
  | { readonly kind: 'question'; readonly id: QuestionId }
  | { readonly kind: 'gate'; readonly id: GateId }
  | { readonly kind: 'done' }

export type EntryQuestionId =
  | MinimalGateQuestionId
  | SegmentTwoQuestionId
  | LifeSituationQuestionId
  | SpecialExpenseQuestionId
  | SegmentChQuestionId
  | SingleParentQuestionId
  | HouseholdQuestionId
  | HealthQuestionId
  | PrepaymentQuestionId
  | ProfessionQuestionId
export type EntryGateId = MinimalGateGateId | SegmentTwoGateId

export type EntryStepId = EntryQuestionId | EntryGateId

export type EntryStep =
  | { readonly kind: 'question'; readonly id: EntryQuestionId }
  | { readonly kind: 'gate'; readonly id: EntryGateId }
  | { readonly kind: 'done' }

export type Answers = Partial<Record<EntryStepId, string>>

export const JOB_VALUES = ['Angestellt', 'Selbstständig', 'Beides', 'Rente'] as const

/**
 * The occupation group behind the job — asked in the Eule tab, so the owl can give
 * tips that fit the work (an IT pro's certificates, a nurse's work clothes). Coarse groups only:
 * no employer, no job title — nothing that identifies a person.
 */
export const PROFESSION_VALUES = [
  'IT & Software',
  'Pflege & Gesundheit',
  'Lehrkraft & Erziehung',
  'Handwerk & Technik',
  'Büro & Verwaltung',
  'Vertrieb & Außendienst',
  'Ausbildung oder Studium',
  'Etwas anderes',
] as const

export type Profession = (typeof PROFESSION_VALUES)[number]

export const FOREIGN_VALUES = ['Ja, in die Schweiz', 'In ein anderes Land', 'Nein'] as const

export const KINDER_VALUES = ['Nein', '1 Kind', '2 oder mehr'] as const

/** Asked up front so the estimate never treats a married couple as single (ADR-0054). */
export const MARITAL_STATUS_VALUES = ['Ledig', 'Verheiratet', 'Geschieden oder getrennt', 'Verwitwet'] as const

export const PARTNER_VALUES = ['Ja', 'Nein'] as const

/** What Person B does, asked of a married user so only B's fields that apply appear (ADR-0088). */
export const PARTNER_JOB_VALUES = ['Angestellt', 'Rente', 'Nicht berufstätig'] as const

/** Whether an employed Person B works in Switzerland (Grenzgänger) too. */
export const PARTNER_FOREIGN_VALUES = ['Ja, in die Schweiz', 'Nein'] as const

/**
 * Whether a cross-border commuter (or Person B) also had a German job in the year (ADR-0079): then the
 * German Lohnsteuerbescheinigung belongs in the Strom too. Asked right after „Ja, in die Schweiz“.
 */
export const GERMAN_JOB_VALUES = ['Nur in der Schweiz', 'Auch in Deutschland'] as const

export const GERMAN_JOB_TOO = 'Auch in Deutschland'

export const HOME_OFFICE_VALUES = ['Nie', '1–2 Tage pro Woche', 'Fast immer'] as const

export const TRAINING_VALUES = ['Ja', 'Nein'] as const

export const INCOME_VALUES = ['Nein', 'Kapitalerträge', 'Vermietung', 'Beides'] as const

export const KAP_DEPOT_VALUES = ['Deutscher Broker', 'Ausländischer Broker', 'Krypto'] as const

export const RENTAL_KIND_VALUES = ['Einfach', 'Mehrere', 'Verkauf oder möbliert'] as const

export const YES_NO_VALUES = ['Ja', 'Nein'] as const

export const RIESTER_KIND_VALUES = ['Unmittelbar', 'Mittelbar'] as const

/** Anlage Vorsorgeaufwand: voluntary statutory (Z. 16–18), private (Z. 23–27) or foreign (Z. 28–33) insurance. */
export const KV_KIND_VALUES = ['Gesetzlich (freiwillig)', 'Privat', 'Ausländisch'] as const

export const SIDE_JOB_VALUES = ['Nein', 'Minijob', 'Midijob', 'Nebenjob'] as const

export const CH_RESIDENCE_VALUES = ['Deutschland', 'Schweiz'] as const

export type ChResidence = (typeof CH_RESIDENCE_VALUES)[number]

export const AMOUNT_LATER = 'spaeter'

export function amountFromAnswer(value: string | undefined): number | null {
  if (value === undefined || value === AMOUNT_LATER) return null
  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Server switches that change the graph (ADR-0101 §20). `selfEmployment` is `SELBSTSTAENDIGE_ENABLED`:
 * off (also when the option is not passed) the Gewerbe-Gate stops the self-employed as REQ-015 says; on, they
 * walk on. The server has it on unless `SELBSTSTAENDIGE_ENABLED` is set to off (PO decision of 20.11.2026).
 */
export interface InterviewOptions {
  readonly selfEmployment?: boolean | undefined
}

/** The answers that put a business behind the year (REQ-015, ADR-0101 §22): self-employed, both, or a pensioner with one. */
export function declaresBusiness(answers: Answers): boolean {
  return answers.job === 'Selbstständig' || answers.job === 'Beides' || (answers.job === 'Rente' && answers['rente-selbststaendig'] === 'Ja')
}

/** A business and no wage: no wage tax certificate carries the pension and the insurance, the person pays them himself. */
export function paysOwnProvision(answers: Answers): boolean {
  return answers.job === 'Selbstständig' || (answers.job === 'Rente' && answers['rente-selbststaendig'] === 'Ja')
}
