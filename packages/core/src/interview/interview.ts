export type MinimalGateQuestionId = 'job' | 'ausland' | 'kinder' | 'familienstand' | 'partner-job' | 'partner-ausland'

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

export type SingleParentQuestionId = 'ae-weitere-person' | 'ae-haushaltsgemeinschaft'

export type HouseholdQuestionId =
  | 'haushalt-gate'
  | 'haushalt-dienstleistung-betrag'
  | 'haushalt-handwerker-betrag'
  | 'haushalt-handwerker-rechnungsbetrag'
  | 'haushalt-minijob-betrag'

export type HealthQuestionId = 'gesundheit-gate' | 'gesundheit-betrag'

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

export const QUESTION_ORDER: readonly MinimalGateQuestionId[] = ['job', 'ausland', 'kinder', 'familienstand']

export const GATE_ACKNOWLEDGED = 'weiter'

export const AMOUNT_LATER = 'spaeter'

export const LATER_ALLOWED_STEPS = [
  'dhf-miete',
  'umzug-kosten',
  'spenden-betrag',
  'kv-pv-betrag',
  'pv-betrag',
  'kv-wahl-betrag',
  'riester-betrag',
  'haushalt-dienstleistung-betrag',
  'haushalt-handwerker-betrag',
  'haushalt-handwerker-rechnungsbetrag',
  'haushalt-minijob-betrag',
  'vorauszahlungen-betrag',
] as const

const LATER_ALLOWED_SET: ReadonlySet<string> = new Set<string>(LATER_ALLOWED_STEPS)

/**
 * Steps still marked „später“. A stored answer whose parent was later answered differently
 * (Umzug „Ja“ → Kosten später → Umzug „Nein“) stays in storage but is no longer reachable, so it
 * must not widen the range, raise a notice or keep a tile on „Betrag offen“.
 */
export function laterAmountSteps(answers: Answers): readonly EntryStepId[] {
  return Object.entries(answers)
    .filter(([step, value]) => Object.hasOwn(QUESTIONS, step) && value === AMOUNT_LATER)
    .map(([step]) => step as EntryStepId)
    .filter((step) => {
      const entry = entryForStep(step)
      return entry !== undefined && isReachableFor(ENTRIES[entry], answers, step)
    })
}

export function amountFromAnswer(value: string | undefined): number | null {
  if (value === undefined || value === AMOUNT_LATER) return null
  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) ? n : null
}

export type ValueForm =
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number }

export type FollowUpTarget = EntryStepId | { readonly step: EntryStepId; readonly terminal: true }

export interface QuestionDeclaration {
  readonly id: EntryStepId
  readonly kind: 'question' | 'gate'
  readonly form: ValueForm
  readonly followUps?: Readonly<Record<string, readonly FollowUpTarget[]>>
  readonly defaultFollowUp?: readonly FollowUpTarget[]
}

export const QUESTIONS: Readonly<Record<EntryStepId, QuestionDeclaration>> = {
  job: {
    id: 'job',
    kind: 'question',
    form: { kind: 'enum', values: JOB_VALUES },
    followUps: {
      Selbstständig: [{ step: 'gewerbe', terminal: true }],
      Beides: ['gewerbe'],
      Angestellt: [],
      Rente: [],
    },
    defaultFollowUp: ['gewerbe'],
  },
  beruf: { id: 'beruf', kind: 'question', form: { kind: 'enum', values: PROFESSION_VALUES } },
  ausland: {
    id: 'ausland',
    kind: 'question',
    form: { kind: 'enum', values: FOREIGN_VALUES },
    followUps: {
      'In ein anderes Land': ['ch-only'],
    },
  },
  kinder: { id: 'kinder', kind: 'question', form: { kind: 'enum', values: KINDER_VALUES } },
  familienstand: {
    id: 'familienstand',
    kind: 'question',
    form: { kind: 'enum', values: MARITAL_STATUS_VALUES },
    followUps: { Verheiratet: ['partner-job'] },
  },
  'partner-job': {
    id: 'partner-job',
    kind: 'question',
    form: { kind: 'enum', values: PARTNER_JOB_VALUES },
    followUps: { Angestellt: ['partner-ausland'] },
  },
  'partner-ausland': { id: 'partner-ausland', kind: 'question', form: { kind: 'enum', values: PARTNER_FOREIGN_VALUES } },
  gewerbe: { id: 'gewerbe', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },
  'ch-only': { id: 'ch-only', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },

  partner: { id: 'partner', kind: 'question', form: { kind: 'enum', values: PARTNER_VALUES } },
  homeoffice: { id: 'homeoffice', kind: 'question', form: { kind: 'enum', values: HOME_OFFICE_VALUES } },
  weg: { id: 'weg', kind: 'question', form: { kind: 'integer', min: 0, max: 999 } },
  tage: { id: 'tage', kind: 'question', form: { kind: 'integer', min: 0, max: 366 } },
  fortbildung: { id: 'fortbildung', kind: 'question', form: { kind: 'enum', values: TRAINING_VALUES }, followUps: { Ja: ['fortbildung-kosten'] } },
  /** What the training cost in whole euros (fees, materials, travel): Werbungskosten, § 9 Abs. 1 EStG (#476). */
  'fortbildung-kosten': { id: 'fortbildung-kosten', kind: 'question', form: { kind: 'integer', min: 0, max: 100000 } },
  einkuenfte: {
    id: 'einkuenfte',
    kind: 'question',
    form: { kind: 'enum', values: INCOME_VALUES },
    followUps: {
      Kapitalerträge: ['kap-depot'],
      Vermietung: ['vermietung-art'],
      Beides: ['kap-depot', 'vermietung-art'],
    },
  },
  'kap-depot': {
    id: 'kap-depot',
    kind: 'question',
    form: { kind: 'enum', values: KAP_DEPOT_VALUES },
    followUps: {
      Krypto: ['krypto-gate'],
    },
  },
  'krypto-gate': { id: 'krypto-gate', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },
  'vermietung-art': {
    id: 'vermietung-art',
    kind: 'question',
    form: { kind: 'enum', values: RENTAL_KIND_VALUES },
    followUps: {
      'Verkauf oder möbliert': ['vermietung-gate'],
    },
  },
  'vermietung-gate': { id: 'vermietung-gate', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },

  dhf: { id: 'dhf', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES }, followUps: { Ja: ['dhf-miete'] } },
  'dhf-miete': { id: 'dhf-miete', kind: 'question', form: { kind: 'integer', min: 0, max: 10000 } },
  umzug: { id: 'umzug', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES }, followUps: { Ja: ['umzug-kosten'] } },
  'umzug-kosten': { id: 'umzug-kosten', kind: 'question', form: { kind: 'integer', min: 0, max: 100000 } },
  abfindung: {
    id: 'abfindung',
    kind: 'question',
    form: { kind: 'enum', values: YES_NO_VALUES },
    followUps: { Ja: ['abfindung-betrag'] },
  },
  'abfindung-betrag': { id: 'abfindung-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  lohnersatz: {
    id: 'lohnersatz',
    kind: 'question',
    form: { kind: 'enum', values: YES_NO_VALUES },
    followUps: { Ja: ['lohnersatz-betrag'] },
  },
  'lohnersatz-betrag': { id: 'lohnersatz-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  nebenjob: {
    id: 'nebenjob',
    kind: 'question',
    form: { kind: 'enum', values: SIDE_JOB_VALUES },
    followUps: {
      Midijob: ['nebenjob-brutto'],
      Nebenjob: ['nebenjob-brutto'],
    },
  },
  'nebenjob-brutto': { id: 'nebenjob-brutto', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },

  spenden: { id: 'spenden', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES }, followUps: { Ja: ['spenden-betrag'] } },
  'spenden-betrag': { id: 'spenden-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'kv-pv': {
    id: 'kv-pv',
    kind: 'question',
    form: { kind: 'enum', values: YES_NO_VALUES },
    followUps: { Ja: ['kv-pv-art', 'kv-pv-betrag', 'pv-betrag', 'kv-wahl-betrag'] },
  },
  'kv-pv-art': {
    id: 'kv-pv-art',
    kind: 'question',
    form: { kind: 'enum', values: KV_KIND_VALUES },
    // Only statutory and foreign contributions are split by the Krankengeld claim on the form.
    followUps: { 'Gesetzlich (freiwillig)': ['kv-krankengeld'], Ausländisch: ['kv-krankengeld'], Privat: [] },
  },
  'kv-krankengeld': { id: 'kv-krankengeld', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES } },
  'kv-pv-betrag': { id: 'kv-pv-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'pv-betrag': { id: 'pv-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'kv-wahl-betrag': { id: 'kv-wahl-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  riester: { id: 'riester', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES }, followUps: { Ja: ['riester-betrag', 'riester-art'] } },
  'riester-betrag': { id: 'riester-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'riester-art': {
    id: 'riester-art',
    kind: 'question',
    form: { kind: 'enum', values: RIESTER_KIND_VALUES },
    followUps: { Unmittelbar: ['riester-einnahmen-vorjahr'], Mittelbar: [] },
  },
  'ae-weitere-person': { id: 'ae-weitere-person', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES } },
  'ae-haushaltsgemeinschaft': { id: 'ae-haushaltsgemeinschaft', kind: 'question', form: { kind: 'enum', values: YES_NO_VALUES } },
  'haushalt-gate': {
    id: 'haushalt-gate',
    kind: 'question',
    form: { kind: 'enum', values: YES_NO_VALUES },
    followUps: { Ja: ['haushalt-dienstleistung-betrag', 'haushalt-handwerker-betrag', 'haushalt-handwerker-rechnungsbetrag', 'haushalt-minijob-betrag'] },
  },
  'haushalt-dienstleistung-betrag': { id: 'haushalt-dienstleistung-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'haushalt-handwerker-betrag': { id: 'haushalt-handwerker-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  /**
   * The invoices' totals behind the labour share (Anlage Haushaltsnahe Aufwendungen Z. 6), ADR-0078.
   * Asked after the labour share; the craftsmen's invoices fill it on their own.
   */
  'haushalt-handwerker-rechnungsbetrag': { id: 'haushalt-handwerker-rechnungsbetrag', kind: 'question', form: { kind: 'integer', min: 0, max: 10000000 } },
  'haushalt-minijob-betrag': { id: 'haushalt-minijob-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'gesundheit-gate': {
    id: 'gesundheit-gate',
    kind: 'question',
    form: { kind: 'enum', values: YES_NO_VALUES },
    followUps: { Ja: ['gesundheit-betrag'] },
  },
  'gesundheit-betrag': { id: 'gesundheit-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },
  'vorauszahlungen-gate': {
    id: 'vorauszahlungen-gate',
    kind: 'question',
    form: { kind: 'enum', values: YES_NO_VALUES },
    followUps: { Ja: ['vorauszahlungen-betrag'] },
  },
  'vorauszahlungen-betrag': { id: 'vorauszahlungen-betrag', kind: 'question', form: { kind: 'integer', min: 0, max: 10000000 } },
  'riester-einnahmen-vorjahr': { id: 'riester-einnahmen-vorjahr', kind: 'question', form: { kind: 'integer', min: 0, max: 1000000 } },

  'ch-wohnsitz': { id: 'ch-wohnsitz', kind: 'question', form: { kind: 'enum', values: CH_RESIDENCE_VALUES } },
  'ch-nichtrueckkehrtage': { id: 'ch-nichtrueckkehrtage', kind: 'question', form: { kind: 'integer', min: 0, max: 365 } },
}

export type EntryId =
  | 'minimal-gate'
  | 'segment-2'
  | 'lebenslagen'
  | 'einkuenfte'
  | 'sonderausgaben'
  | 'segment-ch'
  | 'alleinerziehend'
  | 'haushalt'
  | 'gesundheit'
  | 'vorauszahlungen'
  | 'berufsprofil'

export interface CatalogueEntry {
  readonly id: EntryId
  readonly steps: readonly EntryQuestionId[]
}

export const ENTRIES: Readonly<Record<EntryId, CatalogueEntry>> = {
  'minimal-gate': { id: 'minimal-gate', steps: ['job', 'ausland', 'kinder', 'familienstand'] },
  'segment-2': { id: 'segment-2', steps: ['partner', 'homeoffice', 'weg', 'tage', 'fortbildung'] },
  /** Kapital and Vermietung: the depot and the kind of letting decide what the masks and the Anlagen ask. */
  einkuenfte: { id: 'einkuenfte', steps: ['einkuenfte'] },
  lebenslagen: {
    id: 'lebenslagen',
    steps: ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob'],
  },
  sonderausgaben: {
    id: 'sonderausgaben',
    steps: ['spenden', 'kv-pv', 'riester'],
  },
  'segment-ch': { id: 'segment-ch', steps: ['ch-wohnsitz', 'ch-nichtrueckkehrtage'] },
  alleinerziehend: { id: 'alleinerziehend', steps: ['ae-weitere-person', 'ae-haushaltsgemeinschaft'] },
  haushalt: { id: 'haushalt', steps: ['haushalt-gate'] },
  gesundheit: { id: 'gesundheit', steps: ['gesundheit-gate'] },
  /** Prepayments the tax office set for the year (§ 37 EStG): they count against the tax like wage tax. */
  vorauszahlungen: { id: 'vorauszahlungen', steps: ['vorauszahlungen-gate'] },
  /** The occupation group for the owl's profession tips — one question, asked in the Eule tab. */
  berufsprofil: { id: 'berufsprofil', steps: ['beruf'] },
}

function targetId(target: FollowUpTarget): EntryStepId {
  return typeof target === 'string' ? target : target.step
}

function isTerminalTarget(target: FollowUpTarget): boolean {
  return typeof target !== 'string' && target.terminal === true
}

export function buildStepIndex<TEntryId extends string>(
  entries: Readonly<Record<TEntryId, CatalogueEntry>>,
  questions: Readonly<Partial<Record<EntryStepId, QuestionDeclaration>>> = QUESTIONS,
): ReadonlyMap<EntryStepId, TEntryId> {
  const index = new Map<EntryStepId, TEntryId>()

  function claim(id: EntryStepId, entryId: TEntryId): void {
    const owner = index.get(id)
    if (owner !== undefined && owner !== entryId) {
      throw new Error(
        `catalogue seam (D3): "${id}" is claimed by both entry "${owner}" and entry "${entryId}" — ` +
          'entries must partition the question-id space.',
      )
    }
    index.set(id, entryId)
  }

  function walkDeclared(ids: readonly FollowUpTarget[], entryId: TEntryId): void {
    for (const target of ids) {
      const id = targetId(target)
      claim(id, entryId)

      const decl = questions[id]
      if (decl === undefined) {
        throw new Error(`catalogue seam: "${id}" is referenced by entry "${entryId}" but has no QUESTIONS declaration.`)
      }
      if (decl.followUps !== undefined) {
        for (const branch of Object.values(decl.followUps)) {
          walkDeclared(branch, entryId)
        }
      }
      if (decl.defaultFollowUp !== undefined) {
        walkDeclared(decl.defaultFollowUp, entryId)
      }
    }
  }

  for (const entryId of Object.keys(entries) as TEntryId[]) {
    const entry = entries[entryId]
    for (const id of entry.steps) {
      const decl = questions[id]
      if (decl === undefined) {
        throw new Error(`catalogue seam: "${id}" is listed in entry "${entryId}".steps but has no QUESTIONS declaration.`)
      }
      if (decl.kind !== 'question') {
        throw new Error(
          `catalogue seam (ADR-0031 §4): "${id}" is a gate but appears directly in entry "${entryId}".steps — ` +
            "a gate must only be reachable as a follow-up of the question that determines it, never as a bare " +
            "position in an entry's own step list.",
        )
      }
    }
    walkDeclared(entry.steps, entryId)
  }

  return index
}

const STEP_INDEX: ReadonlyMap<EntryStepId, EntryId> = buildStepIndex(ENTRIES)

export function entryForStep(step: EntryStepId): EntryId | undefined {
  return STEP_INDEX.get(step)
}

function stepFor(id: EntryStepId): EntryStep {
  const decl = QUESTIONS[id]
  return decl.kind === 'gate' ? { kind: 'gate', id: id as EntryGateId } : { kind: 'question', id: id as EntryQuestionId }
}

function branchFor(decl: QuestionDeclaration, answer: string): readonly FollowUpTarget[] {
  const followUps = decl.followUps
  const declared = followUps !== undefined && Object.hasOwn(followUps, answer) ? followUps[answer] : undefined
  if (declared !== undefined) return declared
  return decl.defaultFollowUp ?? []
}

function walk(ids: readonly FollowUpTarget[], answers: Answers): EntryStep {
  for (const target of ids) {
    const id = targetId(target)
    if (isTerminalTarget(target)) return stepFor(id)

    const answer = answers[id]
    if (answer === undefined) return stepFor(id)

    const decl = QUESTIONS[id]
    const branch = branchFor(decl, answer)
    const next = walk(branch, answers)
    if (next.kind !== 'done') return next
  }
  return { kind: 'done' }
}

export function nextStepFor(entry: CatalogueEntry, answers: Answers): EntryStep {
  return walk(entry.steps, answers)
}

export function isReachableFor(entry: CatalogueEntry, answers: Answers, target: EntryStepId): boolean {
  const seen = new Set<EntryStepId>()
  let reached: Answers = {}

  for (;;) {
    const step = nextStepFor(entry, reached)
    const id = step.kind === 'done' ? undefined : step.id
    if (id === undefined) return false
    if (id === target) return true

    const answer = answers[id]
    if (answer === undefined) return false

    if (seen.has(id)) return false
    seen.add(id)

    reached = { ...reached, [id]: answer }
  }
}

const TERMINAL_STOP = Symbol('terminal-stop')

function countRemaining(ids: readonly FollowUpTarget[], answers: Answers): number | typeof TERMINAL_STOP {
  let total = 0
  for (const target of ids) {
    if (isTerminalTarget(target)) return TERMINAL_STOP

    const id = targetId(target)
    const decl = QUESTIONS[id]
    const answer = answers[id]

    if (answer === undefined) {
      if (decl.kind === 'question') total += 1
      continue
    }

    const sub = countRemaining(branchFor(decl, answer), answers)
    if (sub === TERMINAL_STOP) return TERMINAL_STOP
    total += sub
  }
  return total
}

export function remainingStepsFor(entry: CatalogueEntry, answers: Answers): number {
  const result = countRemaining(entry.steps, answers)
  return result === TERMINAL_STOP ? 0 : result
}

export function nextStep(answers: Answers): Step {
  return nextStepFor(ENTRIES['minimal-gate'], answers) as Step
}

export function remainingSteps(answers: Answers): number {
  return remainingStepsFor(ENTRIES['minimal-gate'], answers)
}

export function isReachable(answers: Answers, target: StepId): boolean {
  return isReachableFor(ENTRIES['minimal-gate'], answers, target)
}

function isAccepted(form: ValueForm, value: string): boolean {
  if (form.kind === 'enum') return form.values.includes(value)
  if (!/^(0|-?[1-9]\d*)$/.test(value)) return false
  const n = Number(value)
  return n >= form.min && n <= form.max
}

export function isValidAnswer(step: EntryStepId, value: string): boolean {
  const decl = Object.hasOwn(QUESTIONS, step) ? QUESTIONS[step] : undefined
  if (decl === undefined) return false
  if (value === AMOUNT_LATER) return LATER_ALLOWED_SET.has(step)
  return isAccepted(decl.form, value)
}
