// waysKm / anlageNSection / nGreSection — the employment rows from the masks, without printed values.
import { describe, expect, it } from 'vitest'
import { formatEuro } from '@steuereule/core'
import type { ChSalaryCertificateResponseDto, CommuteResponseDto, LstbResponseDto } from '@steuereule/api-client'
import { anlageNSection, nGreSection, waysKm } from './glassFormEmploymentRows'
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

describe('waysKm', () => {
  it('names one way, or both after a change of job', () => {
    expect(waysKm({ oneWayKm: 18 })).toBe('18 km')
    expect(waysKm({ oneWayKm: 18, secondOneWayKm: 7 })).toBe('18 km + 7 km')
    expect(waysKm({ oneWayKm: null, secondOneWayKm: null })).toBe('')
  })
})

describe('anlageNSection', () => {
  const lstb = { bruttoarbeitslohn: { kind: 'erfasst', value: 50000 }, lohnsteuer: { kind: 'erfasst', value: 7000 } } as unknown as LstbResponseDto
  const commute = {
    inputs: { oneWayKm: 20, homeOfficeDays: 250, workEquipmentEur: 300 },
    workdays: { commuteDays: 130 },
    commuterAllowance: 780,
  } as unknown as CommuteResponseDto

  it('is no section without any data', () => {
    expect(anlageNSection({ lstb: null, lstbB: null, commute: null, commuteB: null, answers: {} }, noLive, ctx(false))).toBeNull()
  })

  it('names the wage, the ways and the Werbungskosten from the masks', () => {
    const section = anlageNSection(
      { lstb, lstbB: null, commute, commuteB: null, answers: { 'fortbildung-kosten': '400', 'umzug-kosten': '900', 'dhf-miete': '650' } },
      noLive,
      ctx(false),
    )
    expect(ids(section)).toEqual([
      'anlageN-brutto-a',
      'anlageN-lst-a',
      'anlageN-weg-a',
      'anlageN-ho-a',
      'anlageN-arbeitsmittel-a',
      'anlageN-fortbildung',
      'anlageN-umzug',
      'anlageN-dhf',
    ])
    const rows = section?.rows ?? []
    expect(rows[2]?.label).toBe('Entfernungspauschale (20 km · 130 Tage)')
    // The Homeoffice-Pauschale stops at 210 days.
    expect(rows.find((r) => r.id === 'anlageN-ho-a')).toMatchObject({ label: 'Homeoffice-Pauschale (250 Tage)', value: formatEuro(1260) })
  })

  it('names no way from the mask while the printed values are still loading', () => {
    const section = anlageNSection({ lstb: null, lstbB: null, commute, commuteB: null, answers: {} }, { ...noLive, settled: false }, ctx(false))
    expect(ids(section)).toEqual(['anlageN-ho-a'])
  })

  it("adds Person B's wage only on a joint return", () => {
    const data = { lstb: null, lstbB: lstb, commute: null, commuteB: null, answers: {} }
    expect(anlageNSection(data, noLive, ctx(false))).toBeNull()
    expect(ids(anlageNSection(data, noLive, ctx(true)))).toEqual(['anlageN-brutto-b', 'anlageN-lst-b'])
  })
})

describe('nGreSection', () => {
  const ch = {
    fields: [
      { id: 'bruttolohn-total', kind: 'erfasst', value: 90000 },
      { id: 'quellensteuer', kind: 'erfasst', value: 4050 },
      { id: 'ahv-beitraege', kind: 'erfasst', value: 5800 },
    ],
    exchangeRate: { rate: 0.95 },
  } as unknown as ChSalaryCertificateResponseDto

  it('falls back to the Lohnausweis without a printed Anlage N-Gre', () => {
    const section = nGreSection(ch, ch, noLive, ctx(true))
    expect(ids(section)).toEqual(['ngre-brutto-a', 'ngre-qst-a', 'ngre-ahv-a', 'ngre-brutto-b', 'ngre-qst-b'])
    expect(section?.rows[0]?.label).toBe('Schweizer Bruttolohn (Lohnausweis Ziff. 8 · Kurs 0.95)')
    expect(section?.rows[0]?.value).toBe('90.000 CHF')
  })

  it('is no section without a Lohnausweis', () => {
    expect(nGreSection(null, null, noLive, ctx(false))).toBeNull()
  })
})
