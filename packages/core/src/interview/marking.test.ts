import { describe, expect, it } from 'vitest'
import {
  annexOf,
  confirmAnnex,
  decideWriting,
  missingConfirmations,
  provenanceText,
  provenanceKey,
  acceptProposal,
  dismissProposal,
  decomposeProvenanceKey,
  type Marking,
} from './marking'

const CLAUDE = { kind: 'assistent', name: 'Claude' } as const

function unconfirmed(key: string, value: string | null): Marking {
  return { key, provenance: { kind: 'uebernahme', lastYear: 2024 }, confirmed: false, proposal: null, value }
}

describe('kennzeichnungsKey / zerlegeKennzeichnungsKey', () => {
  it('builds field keys with and without an instance and parses them back', () => {
    expect(provenanceKey('lstb', 'bruttoarbeitslohn')).toBe('lstb.bruttoarbeitslohn')
    expect(provenanceKey('vermietung', 'mieteinnahmen', 'obj-1')).toBe('vermietung:obj-1.mieteinnahmen')
    expect(decomposeProvenanceKey('vermietung:obj-1.mieteinnahmen')).toEqual({ screen: 'vermietung', instance: 'obj-1', field: 'mieteinnahmen' })
    expect(decomposeProvenanceKey('lstb.lohnsteuer')).toEqual({ screen: 'lstb', instance: null, field: 'lohnsteuer' })
  })

  it('rejects an unknown mask or a key without a field instead of guessing', () => {
    expect(() => decomposeProvenanceKey('lstb')).toThrow()
    expect(() => decomposeProvenanceKey('gewerbe.gewinn')).toThrow()
  })
})

describe('anlageVon — every mask belongs to exactly one Anlage', () => {
  it.each([
    ['profil.steuerId', 'hauptvordruck'],
    ['stammdaten.iban', 'hauptvordruck'],
    ['kopplung.personB', 'hauptvordruck'],
    ['interview.kirchensteuer', 'hauptvordruck'],
    ['lstb.bruttoarbeitslohn', 'anlageN'],
    ['chLohnausweis.lohn', 'anlageNGre'],
    ['rente.jahresbetrag', 'anlageR'],
    ['kapital.kapitalertraege', 'anlageKap'],
    ['vermietung:o1.mieteinnahmen', 'anlageV'],
    ['kind:k1.vorname', 'anlageKind'],
    ['commute.oneWayKm', 'anlageN'],
    ['assessment.festgesetzteSteuer', 'hauptvordruck'],
  ])('%s → %s', (key, annex) => {
    expect(annexOf(key)).toBe(annex)
  })
})

describe('entscheideSchreibung — der Nutzer gewinnt (ADR-0052 §7)', () => {
  it('a user write always writes and drops the marker (the value is now the user\'s)', () => {
    expect(decideWriting({ key: 'lstb.lohnsteuer', existing: unconfirmed('lstb.lohnsteuer', '700'), currentValue: '700', newValue: '650', provenance: { kind: 'nutzer' } })).toEqual({ kind: 'schreiben', marking: null })
  })

  it('a non-user write into an empty field writes and stays unconfirmed with its Herkunft', () => {
    expect(decideWriting({ key: 'lstb.lohnsteuer', existing: null, currentValue: null, newValue: '700', provenance: CLAUDE })).toEqual({
      kind: 'schreiben',
      marking: { key: 'lstb.lohnsteuer', provenance: CLAUDE, confirmed: false, proposal: null, value: '700' },
    })
  })

  it('a non-user write over a value the user typed becomes a proposal and never overwrites it', () => {
    expect(decideWriting({ key: 'lstb.bruttoarbeitslohn', existing: null, currentValue: '4750', newValue: '4800', provenance: CLAUDE })).toEqual({
      kind: 'vorschlag',
      marking: { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'nutzer' }, confirmed: true, value: '4750', proposal: { value: '4800', provenance: CLAUDE } },
    })
  })

  it('a value the user marked "unklar" is the user\'s too — proposal, not overwrite', () => {
    expect(decideWriting({ key: 'lstb.lohnsteuer', existing: null, currentValue: 'unklar', newValue: '700', provenance: CLAUDE }).kind).toBe('vorschlag')
  })

  it('a confirmed value is protected like a typed one; the newest proposal replaces the older', () => {
    const confirmed: Marking = { ...unconfirmed('rente.jahresbetrag', '12000'), confirmed: true, proposal: { value: '12100', provenance: CLAUDE } }
    const gemini = { kind: 'assistent', name: 'Gemini' } as const
    expect(decideWriting({ key: 'rente.jahresbetrag', existing: confirmed, currentValue: '12000', newValue: '12200', provenance: gemini })).toEqual({
      kind: 'vorschlag',
      marking: { ...confirmed, proposal: { value: '12200', provenance: gemini } },
    })
  })

  it('an unconfirmed value from someone else is replaced (nobody has vouched for it yet)', () => {
    expect(decideWriting({ key: 'kapital.kapitalertraege', existing: unconfirmed('kapital.kapitalertraege', '300'), currentValue: '300', newValue: '320', provenance: CLAUDE })).toEqual({
      kind: 'schreiben',
      marking: { key: 'kapital.kapitalertraege', provenance: CLAUDE, confirmed: false, proposal: null, value: '320' },
    })
  })

  it('writing what is already there changes nothing', () => {
    expect(decideWriting({ key: 'lstb.lohnsteuer', existing: null, currentValue: '700', newValue: '700', provenance: CLAUDE })).toEqual({ kind: 'unveraendert' })
    expect(decideWriting({ key: 'lstb.lohnsteuer', existing: null, currentValue: null, newValue: null, provenance: CLAUDE })).toEqual({ kind: 'unveraendert' })
  })
})

describe('bestaetigeAnlage / fehlendeBestaetigungen — unbestätigt wirkt wie offen', () => {
  const list: Marking[] = [
    unconfirmed('lstb.bruttoarbeitslohn', '50000'),
    unconfirmed('rente.jahresbetrag', '12000'),
    unconfirmed('vermietung:o1.mieteinnahmen', '9000'),
  ]

  it('names every Anlage with an unconfirmed value once, in a stable order', () => {
    expect(missingConfirmations(list)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageR', 'unbestaetigt.anlageV'])
  })

  it('confirming one Anlage confirms all of its values and keeps their Herkunft', () => {
    const afterwards = confirmAnnex(list, 'anlageR')
    expect(afterwards.find((k) => k.key === 'rente.jahresbetrag')).toEqual({ ...list[1], confirmed: true })
    expect(missingConfirmations(afterwards)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageV'])
  })

  it('an open proposal on a confirmed value does not block the printout', () => {
    const withProposal: Marking = { key: 'lstb.lohnsteuer', provenance: { kind: 'nutzer' }, confirmed: true, value: '700', proposal: { value: '720', provenance: CLAUDE } }
    expect(missingConfirmations([withProposal])).toEqual([])
  })
})

describe('nimmVorschlagAn / verwirfVorschlag', () => {
  const withProposal: Marking = { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'nutzer' }, confirmed: true, value: '4750', proposal: { value: '4800', provenance: CLAUDE } }

  it('accepting writes the proposed value as confirmed (the user chose it) with the proposer as Herkunft', () => {
    expect(acceptProposal(withProposal)).toEqual({ key: 'lstb.bruttoarbeitslohn', provenance: CLAUDE, confirmed: true, value: '4800', proposal: null })
  })

  it('discarding a proposal on a user value leaves no marker behind', () => {
    expect(dismissProposal(withProposal)).toBeNull()
  })

  it('discarding a proposal on an unconfirmed value keeps the value unconfirmed', () => {
    const k: Marking = { ...unconfirmed('rente.jahresbetrag', '12000'), proposal: { value: '1', provenance: CLAUDE } }
    expect(dismissProposal(k)).toEqual({ ...k, proposal: null })
  })

  it('there is nothing to accept without a proposal', () => {
    expect(() => acceptProposal({ ...withProposal, proposal: null })).toThrow()
  })
})

describe('herkunftText — der Herkunfts-Chip', () => {
  it.each([
    [{ kind: 'nutzer' } as const, 'Selbst eingetragen'],
    [{ kind: 'uebernahme', lastYear: 2024 } as const, 'Übernahme aus 2024'],
    [CLAUDE, 'Assistent: Claude'],
    [{ kind: 'assistent', name: 'Claude', receiptId: 'b1' } as const, 'Assistent: Claude, aus Beleg'],
    [{ kind: 'beleg', receiptId: 'b1' } as const, 'Aus Beleg'],
  ])('%j → %s', (provenance, text) => {
    expect(provenanceText(provenance)).toBe(text)
  })
})
