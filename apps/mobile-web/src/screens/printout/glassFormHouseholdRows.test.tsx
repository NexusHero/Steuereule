// est1aSection / vorsorgeSection / haushaltSection — the rows of the main form and the household annexes.
import { describe, expect, it } from 'vitest'
import type { Answers } from '@steuereule/core'
import type { LinkResponseDto, LstbResponseDto, MasterDataResponseDto } from '@steuereule/api-client'
import { est1aSection, haushaltSection, vorsorgeSection } from './glassFormHouseholdRows'
import type { GlassLiveValues, GlassRowContext } from './glassFormTypes'

const ctx = (isJoint: boolean): GlassRowContext => ({
  year: 2025,
  isJoint,
  partnerName: 'Jonas',
  tr: (key) => key,
  prov: (screen, field) => `${screen}.${field ?? ''}`,
})
const noLive: GlassLiveValues = { forms: [], hasLive: false, settled: true }
const ids = (section: { rows: readonly { id: string }[] } | null) => section?.rows.map((r) => r.id) ?? []

describe('est1aSection', () => {
  it('is no section without any data', () => {
    expect(est1aSection(null, null, {}, {}, ctx(false))).toBeNull()
  })

  it('names the address, the joint filing, the IBAN and the amounts of both persons', () => {
    const md = { strasse: 'Rheinweg', hausnummer: '4', plz: '79539', wohnort: 'Lörrach', familienstand: 'verheiratet', iban: 'DE89' } as unknown as MasterDataResponseDto
    const link = { filingType: 'zusammen', personB: { firstName: 'Jonas', lastName: 'Brenner', beruf: null } } as unknown as LinkResponseDto
    const answers: Answers = { 'lohnersatz-betrag': '1200', 'vorauszahlungen-betrag': '300' }
    const section = est1aSection(md, link, answers, { 'lohnersatz-betrag': '500' }, ctx(true))
    expect(ids(section)).toEqual([
      'est1a-adresse',
      'est1a-familienstand',
      'est1a-veranlagung',
      'est1a-iban',
      'est1a-lohnersatz-a',
      'est1a-lohnersatz-b',
      'est1a-vorauszahlungen',
    ])
    expect(section?.rows[0]?.value).toBe('Rheinweg 4 79539 Lörrach')
    expect(section?.rows[1]).toMatchObject({ value: 'Verheiratet', person: 'gemeinsam', provenanceLabel: 'stammdaten.familienstand' })
    expect(section?.rows[2]).toMatchObject({ label: 'Zusammenveranlagung mit Jonas', value: 'Jonas · Brenner' })
  })
})

describe('vorsorgeSection', () => {
  const lstb = { sozialversicherung: { kind: 'erfasst', value: 8000 } } as unknown as LstbResponseDto

  it('takes the self-paid insurance from the interview only without printed values', () => {
    const answers: Answers = { 'kv-pv-betrag': '900', 'spenden-betrag': '50', 'riester-betrag': '175' }
    expect(ids(vorsorgeSection(lstb, null, answers, noLive, ctx(false)))).toEqual([
      'vorsorge-sv-a',
      'vorsorge-kv-a',
      'sonderausgaben-spenden',
      'anlageAV-riester',
    ])
    expect(ids(vorsorgeSection(lstb, null, answers, { ...noLive, hasLive: true }, ctx(false)))).toEqual([
      'vorsorge-sv-a',
      'sonderausgaben-spenden',
      'anlageAV-riester',
    ])
  })

  it("adds Person B's social insurance only on a joint return", () => {
    expect(ids(vorsorgeSection(null, lstb, {}, noLive, ctx(false)))).toEqual([])
    expect(ids(vorsorgeSection(null, lstb, {}, noLive, ctx(true)))).toEqual(['vorsorge-sv-b'])
  })
})

describe('haushaltSection', () => {
  it('is no section while no amount is above zero', () => {
    expect(haushaltSection({ 'haushalt-handwerker-betrag': '0' }, ctx(false))).toBeNull()
  })

  it('lists the § 35a amounts and the Krankheitskosten', () => {
    const answers: Answers = {
      'haushalt-handwerker-betrag': '1000',
      'haushalt-dienstleistung-betrag': '200',
      'haushalt-minijob-betrag': '300',
      'gesundheit-betrag': '400',
    }
    const section = haushaltSection(answers, ctx(true))
    expect(ids(section)).toEqual(['haushalt-handwerker', 'haushalt-dienstleistung', 'haushalt-minijob', 'agb-krankheit'])
    expect(section?.rows.every((r) => r.person === 'gemeinsam')).toBe(true)
  })
})
