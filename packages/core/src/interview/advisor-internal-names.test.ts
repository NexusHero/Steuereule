import { describe, expect, it } from 'vitest'
import { metaWithoutInternalNames, withoutInternalNames } from './advisor-internal-names'

describe('internal names never reach the user (real-data run)', () => {
  it('takes a field id out of a parenthesis and keeps what the user can read', () => {
    expect(withoutInternalNames('Kindergeldanspruch 2024 (kind.childBenefitClaimEur, Kind 1): 3.060 €')).toBe('Kindergeldanspruch 2024 (Kind 1): 3.060 €')
    expect(withoutInternalNames('Weitere Einkünfte (interview.einkuenfte):')).toBe('Weitere Einkünfte:')
    expect(withoutInternalNames('Kontoführung (`commute.accountFeesEur`, Person B): 16 €')).toBe('Kontoführung (Person B): 16 €')
  })

  it('names the mask where a field id stands in a sentence', () => {
    expect(withoutInternalNames('Erst ein Entwurf `kopplung.filingType` = „zusammen“.')).toBe('Erst ein Entwurf in der Maske „Kopplung“ = „zusammen“.')
    expect(withoutInternalNames('Bitte chLohnausweis.krankenkasseChf prüfen.')).toBe('Bitte in der Maske „Lohnausweis (Schweiz)“ prüfen.')
  })

  it('drops a tool name written like a source', () => {
    expect(withoutInternalNames('Ihr steht bei einer Erstattung von 226 € [read_current_estimate].')).toBe('Ihr steht bei einer Erstattung von 226 €.')
    expect(withoutInternalNames('laut `read_current_estimate` sind es 226 €')).toBe('laut Schätzung der App sind es 226 €')
  })

  it('leaves legal sources, amounts, file names and ordinary words alone', () => {
    const text = 'Nach [estg-9-1] zählt die kürzeste Strecke; siehe z. B. 1.230 € und beleg.pdf, www.elster.de oder „Anlage N“.'
    expect(withoutInternalNames(text)).toBe(text)
    expect(withoutInternalNames('Das Interview.Ende ist erreicht.')).toBe('Das Interview.Ende ist erreicht.')
  })
})

// Real-data run 5: „Maske chLohnausweis“, „pkArbeitnehmerChf“, „domesticResidenceAllYear“, „kinship: 1“,
// „(stammdaten)“ and „Beleg geprüft: krankenkasseChf“ in the text and the workbench.
describe('mask ids and bare field ids in the text and the workbench', () => {
  it('names the mask instead of its id', () => {
    expect(withoutInternalNames('Trag es in der Maske chLohnausweis ein.')).toBe('Trag es in der Maske „Lohnausweis (Schweiz)“ ein.')
    expect(withoutInternalNames('Das steht in den Angaben (stammdaten).')).toBe('Das steht in den Angaben.')
    expect(withoutInternalNames('Bitte in Maske `kind` nachsehen.')).toBe('Bitte in Maske „Kinder“ nachsehen.')
  })

  it('puts the label in place of a bare field id', () => {
    expect(withoutInternalNames('Ich habe pkArbeitnehmerChf vorbereitet.')).toBe('Ich habe „Pensionskasse, obligatorischer Teil (dein Beitrag)“ vorbereitet.')
    expect(withoutInternalNames('Offen ist noch domesticResidenceAllYear.')).toBe('Offen ist noch „Ganzjährig im Inland gewohnt“.')
    expect(withoutInternalNames('Beleg geprüft: krankenkasseChf')).toBe('Beleg geprüft: „Krankenkasse Grundversicherung“')
    expect(withoutInternalNames('kinship: 1, kinshipB: 1')).toBe('„Kindschaftsverhältnis“: 1, „Kindschaftsverhältnis zu Person B“: 1')
  })

  it('leaves German words that are also field names alone', () => {
    const text = 'Wir möchten spenden und die Religion angeben; der Beruf und das Baujahr stehen fest.'
    expect(withoutInternalNames(text)).toBe(text)
  })
})

describe('the workbench texts of an answer', () => {
  it('cleans draft labels and reasons, the two paths and the plan like the reply', () => {
    const draft = { actionId: 'a', status: 'pending' as const, screen: 'chLohnausweis' as const, field: 'pkArbeitnehmerChf', instance: null, label: 'pkArbeitnehmerChf', previousValue: null, newValue: '5000', beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'Aus der Maske chLohnausweis', sourceId: 'estg-9-1' as const }
    const meta = metaWithoutInternalNames({ actions: [draft], plan: [{ text: 'domesticResidenceAllYear fragen (kind)', status: 'offen' as const }] })
    expect(meta.actions![0]).toMatchObject({ label: '„Pensionskasse, obligatorischer Teil (dein Beitrag)“', reason: 'Aus der Maske „Lohnausweis (Schweiz)“' })
    expect(meta.plan![0]!.text).toBe('„Ganzjährig im Inland gewohnt“ fragen')
  })
})

