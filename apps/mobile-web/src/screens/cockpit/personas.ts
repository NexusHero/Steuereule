import type { Answers } from '@steuereule/core'
import type { MasterDataResponseDto } from '@steuereule/api-client'

export type Persona =
  | 'angestellt'
  | 'grenzgaenger'
  | 'rentner'
  | 'vermieter'
  | 'verheiratet'
  | 'alleinerziehend'
  | 'eltern'

const SINGLE_PARENT_INTERVIEW_STATUSES = new Set([
  'Ledig',
  'Geschieden oder getrennt',
  'Verwitwet',
])

const SINGLE_PARENT_MASTER_DATA_STATUSES = new Set([
  'ledig',
  'geschieden',
  'dauernd-getrennt',
  'verwitwet',
])

export function derivePersonas(
  answers: Answers,
  masterData?: MasterDataResponseDto | null,
): ReadonlySet<Persona> {
  const result = new Set<Persona>()

  if (
    (answers.job === 'Angestellt' || answers.job === 'Beides') &&
    answers.ausland !== 'Ja, in die Schweiz'
  ) {
    result.add('angestellt')
  }
  if (answers.ausland === 'Ja, in die Schweiz') {
    result.add('grenzgaenger')
  }
  if (answers.job === 'Rente') {
    result.add('rentner')
  }
  if (answers.einkuenfte === 'Vermietung' || answers.einkuenfte === 'Beides') {
    result.add('vermieter')
  }

  const mdStatus = masterData?.familienstand ?? null
  const isMarried =
    mdStatus !== null ? mdStatus === 'verheiratet' : answers.familienstand === 'Verheiratet'
  if (isMarried) {
    result.add('verheiratet')
  }

  const hasChildren = answers.kinder !== undefined && answers.kinder !== 'Nein'
  if (hasChildren) {
    result.add('eltern')
    const isSingleStatus =
      mdStatus !== null
        ? SINGLE_PARENT_MASTER_DATA_STATUSES.has(mdStatus)
        : SINGLE_PARENT_INTERVIEW_STATUSES.has(answers.familienstand ?? '')
    if (isSingleStatus) {
      result.add('alleinerziehend')
    }
  }

  return result
}
