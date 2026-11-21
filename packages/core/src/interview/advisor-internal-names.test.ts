import { describe, expect, it } from 'vitest'
import { withoutInternalNames } from './advisor-internal-names'

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
