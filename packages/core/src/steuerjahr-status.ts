export type TaxYearStatus =
  | 'draft'
  | 'review'
  | 'submitted'
  | 'query'
  | 'assessment'
  | 'completed'
  | 'externally-completed'

export type SteuerjahrStatus =
  | 'entwurf'
  | 'pruefung'
  | 'eingereicht'
  | 'rueckfrage'
  | 'bescheid'
  | 'abgeschlossen'
  | 'extern-erledigt'

const STATUS_MAP_DE_TO_EN: Readonly<Record<SteuerjahrStatus, TaxYearStatus>> = {
  entwurf: 'draft',
  pruefung: 'review',
  eingereicht: 'submitted',
  rueckfrage: 'query',
  bescheid: 'assessment',
  abgeschlossen: 'completed',
  'extern-erledigt': 'externally-completed',
}

const _STATUS_MAP_EN_TO_DE: Readonly<Record<TaxYearStatus, SteuerjahrStatus>> = {
  draft: 'entwurf',
  review: 'pruefung',
  submitted: 'eingereicht',
  query: 'rueckfrage',
  assessment: 'bescheid',
  completed: 'abgeschlossen',
  'externally-completed': 'extern-erledigt',
}

const TRANSITIONS_EN: Readonly<Record<TaxYearStatus, readonly TaxYearStatus[]>> = {
  draft: ['review', 'externally-completed'],
  review: ['submitted', 'draft', 'externally-completed'],
  submitted: ['query', 'assessment'],
  query: ['submitted', 'assessment'],
  assessment: ['completed'],
  completed: [],
  'externally-completed': [],
}

const UEBERGAENGE_DE: Readonly<Record<SteuerjahrStatus, readonly SteuerjahrStatus[]>> = {
  entwurf: ['pruefung', 'extern-erledigt'],
  pruefung: ['eingereicht', 'entwurf', 'extern-erledigt'],
  eingereicht: ['rueckfrage', 'bescheid'],
  rueckfrage: ['eingereicht', 'bescheid'],
  bescheid: ['abgeschlossen'],
  abgeschlossen: [],
  'extern-erledigt': [],
}

export function isTransitionAllowed(from: TaxYearStatus | SteuerjahrStatus, to: TaxYearStatus | SteuerjahrStatus): boolean {
  if (from in UEBERGAENGE_DE && to in UEBERGAENGE_DE) {
    return UEBERGAENGE_DE[from as SteuerjahrStatus].includes(to as SteuerjahrStatus)
  }
  const fromEn = (STATUS_MAP_DE_TO_EN[from as SteuerjahrStatus] ?? from) as TaxYearStatus
  const toEn = (STATUS_MAP_DE_TO_EN[to as SteuerjahrStatus] ?? to) as TaxYearStatus
  return (TRANSITIONS_EN[fromEn] ?? []).includes(toEn)
}

export function nextStates(from: TaxYearStatus): readonly TaxYearStatus[] {
  return TRANSITIONS_EN[from] ?? []
}

export function naechsteZustaende(von: SteuerjahrStatus): readonly SteuerjahrStatus[] {
  return UEBERGAENGE_DE[von] ?? []
}

export type AssessmentNoticeStatus = 'received' | 'audited' | 'appealed'
export type BescheidStatus = 'eingegangen' | 'geprüft' | 'einspruch-eingelegt'

const BESCHEID_UEBERGAENGE: Readonly<Record<BescheidStatus, readonly BescheidStatus[]>> = {
  eingegangen: ['geprüft'],
  geprüft: ['einspruch-eingelegt'],
  'einspruch-eingelegt': [],
}

export function istBescheidUebergangErlaubt(von: BescheidStatus, nach: BescheidStatus): boolean {
  return BESCHEID_UEBERGAENGE[von].includes(nach)
}

export function naechsteBescheidZustaende(von: BescheidStatus): readonly BescheidStatus[] {
  return BESCHEID_UEBERGAENGE[von]
}
