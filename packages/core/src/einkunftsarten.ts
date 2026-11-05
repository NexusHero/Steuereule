import type { Answers } from './interview.js'

export type IncomeType =
  | 'Nichtselbstständig'
  | 'Gewerbe'
  | 'Vermietung'
  | 'Kapital'
  | 'Rente'
  | 'Grenzgänger'
export const INCOME_TYPES: readonly IncomeType[] = [
  'Nichtselbstständig',
  'Gewerbe',
  'Vermietung',
  'Kapital',
  'Rente',
  'Grenzgänger',
]

export function isIncomeType(value: string): value is IncomeType {
  return (INCOME_TYPES as readonly string[]).includes(value)
}

export function incomeTypesFromAnswers(answers: Answers): readonly IncomeType[] {
  const declared = new Set<IncomeType>()

  switch (answers.job) {
    case 'Angestellt':
      declared.add('Nichtselbstständig')
      break
    case 'Selbstständig':
      declared.add('Gewerbe')
      break
    case 'Beides':
      declared.add('Nichtselbstständig')
      declared.add('Gewerbe')
      break
    case 'Rente':
      declared.add('Rente')
      break
  }

  if (answers.ausland === 'Ja, in die Schweiz') declared.add('Grenzgänger')

  switch (answers.einkuenfte) {
    case 'Kapitalerträge':
      declared.add('Kapital')
      break
    case 'Vermietung':
      declared.add('Vermietung')
      break
    case 'Beides':
      declared.add('Kapital')
      declared.add('Vermietung')
      break
  }

  return INCOME_TYPES.filter((art) => declared.has(art))
}

export function gatedIncomeTypes(answers: Answers): readonly IncomeType[] {
  const declared = new Set(incomeTypesFromAnswers(answers))
  const gated = new Set<IncomeType>()

  if (declared.has('Gewerbe')) gated.add('Gewerbe')
  if (declared.has('Kapital') && answers['kap-depot'] === 'Krypto') gated.add('Kapital')
  if (declared.has('Vermietung') && answers['vermietung-art'] === 'Verkauf oder möbliert') gated.add('Vermietung')

  return INCOME_TYPES.filter((art) => gated.has(art))
}
