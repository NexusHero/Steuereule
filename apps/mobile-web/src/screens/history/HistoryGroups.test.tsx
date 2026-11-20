// The group tabs of „Entwicklung“ (ADR-0099 §3, §7), each with the shapes of data it can get: back
// payments with and without a series, one or two Swiss earners, rental objects before and after the
// 15 % window, capital years by the Günstigerprüfung, a pension with and without its facts.
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { CrossBorderYearDto, YearHistoryResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { HISTORY_ALL_GROUPS_RESPONSE } from '../../test-history-fixture'
import { HistoryGroupPanel } from './HistoryGroups'
import type { HistoryGroupTab } from './historyInsights'

function show(data: YearHistoryResponseDto, tab: HistoryGroupTab) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <HistoryGroupPanel data={data} tab={tab} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

const withGroups = (groups: Partial<YearHistoryResponseDto['groups']>, extra: Partial<YearHistoryResponseDto> = {}): YearHistoryResponseDto => ({
  ...HISTORY_ALL_GROUPS_RESPONSE,
  ...extra,
  groups: { ...HISTORY_ALL_GROUPS_RESPONSE.groups, crossBorder: null, rental: null, capital: null, pension: null, ...groups },
})

const swiss = (year: number, person: 'A' | 'B' | null, over: object = {}): CrossBorderYearDto => ({
  year,
  person: person as CrossBorderYearDto['person'],
  rate: 0.9412,
  period: 'jahresdurchschnitt',
  grossChf: 84000,
  grossEur: 79061,
  rateChangePercent: null,
  withholdingTaxChf: 3780,
  creditedEur: 3558,
  creditCapped: false,
  ...over,
})

const text = (id: string) => screen.getByTestId(id).textContent ?? ''

describe('HistoryGroupPanel — a tab without its data', () => {
  it.each(['schweiz', 'vermietung', 'kapital', 'rente'] as const)('renders nothing for %s when the household has none', (tab) => {
    const view = show(withGroups({}), tab)
    expect(view.container.textContent).toBe('')
  })
})

describe('HistoryGroupPanel — Vorauszahlungen', () => {
  it('names the series of back payments and the advice to have the prepayments adjusted', () => {
    show(HISTORY_ALL_GROUPS_RESPONSE, 'vorauszahlungen')
    expect(text('verlauf-gruppe-vorauszahlungen-hinweis')).toContain('Vorauszahlungen anpassen')
  })

  it('names the series without the advice when no year asks for an adjustment, counting all back payments when none are in a row', () => {
    const data = {
      ...HISTORY_ALL_GROUPS_RESPONSE,
      prepayments: { ...HISTORY_ALL_GROUPS_RESPONSE.prepayments, consecutiveBackPayments: 0, years: HISTORY_ALL_GROUPS_RESPONSE.prepayments.years.map((y) => ({ ...y, adjustPrepayments: false })) },
    }
    show(data, 'vorauszahlungen')
    expect(text('verlauf-gruppe-vorauszahlungen-hinweis')).not.toContain('anpassen lassen')
  })

  it('says nothing about a series when there is no average, and shows a missing prepayment as a dash', () => {
    const data = {
      ...HISTORY_ALL_GROUPS_RESPONSE,
      prepayments: { ...HISTORY_ALL_GROUPS_RESPONSE.prepayments, averageBackPayment: null, years: [{ year: 2024, refund: 300, backPayment: null, prepayments: null, adjustPrepayments: false }] },
    }
    show(data, 'vorauszahlungen')
    expect(screen.queryByTestId('verlauf-gruppe-vorauszahlungen-hinweis')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(within(screen.getByTestId('verlauf-gruppe-tabelle')).getAllByRole('cell').map((c) => c.textContent)).toContain('–')
  })

  it('opens and closes the table with the numbers', () => {
    show(HISTORY_ALL_GROUPS_RESPONSE, 'vorauszahlungen')
    expect(screen.queryByTestId('verlauf-gruppe-tabelle')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(screen.getByTestId('verlauf-gruppe-tabelle')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(screen.queryByTestId('verlauf-gruppe-tabelle')).toBeNull()
  })
})

describe('HistoryGroupPanel — Schweiz', () => {
  it('shows one earner with the rate, the credited tax and the Swiss share', () => {
    show(withGroups({ crossBorder: { years: [swiss(2024, 'A'), swiss(2025, 'A', { rateChangePercent: -1.5 })], swissShare: [{ year: 2025, percent: 62.5 }] } }), 'schweiz')
    expect(text('verlauf-gruppe-schweiz-kurs')).toContain('0,9412')
    expect(text('verlauf-gruppe-schweiz-kurs')).toContain('−1,5')
    expect(text('verlauf-gruppe-schweiz-quellensteuer')).toContain('2025')
    expect(text('verlauf-gruppe-schweiz-anteil')).toContain('62,5')
  })

  it('names the person when both spouses are Grenzgänger, and says where the credit was capped', () => {
    show(withGroups({ crossBorder: { years: [swiss(2025, 'A'), swiss(2025, 'B', { creditCapped: true })], swissShare: [] } }), 'schweiz')
    expect(text('verlauf-gruppe-schweiz-kurs')).toMatch(/2025.*Person A/)
    expect(text('verlauf-gruppe-schweiz-quellensteuer')).toContain('3.780')
    expect(screen.queryByTestId('verlauf-gruppe-schweiz-anteil')).toBeNull()
  })

  it('lists a year without a person as Person A in the table', () => {
    show(withGroups({ crossBorder: { years: [swiss(2025, null)], swissShare: [] } }), 'schweiz')
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(text('verlauf-gruppe-tabelle')).toContain('Person A')
  })
})

describe('HistoryGroupPanel — Vermietung', () => {
  const property = HISTORY_ALL_GROUPS_RESPONSE.groups.rental!.properties[0]!

  it('shows the result per year, the book value, the open year and the closed window', () => {
    show(HISTORY_ALL_GROUPS_RESPONSE, 'vermietung')
    expect(text('verlauf-gruppe-objekt-0')).toContain('Lindenstraße 4')
    expect(text('verlauf-gruppe-objekt-0-grenze')).toContain('37.500')
    expect(text('verlauf-gruppe-verlustvortrag').length).toBeGreaterThan(0)
  })

  it('says the window is open, and over when the limit was exceeded', () => {
    const open = { ...property, acquisitionRelated: { ...property.acquisitionRelated!, windowOpen: true, undatedCounted: 0 } }
    const over = { ...property, propertyKey: 'objekt-2', label: null, acquisitionRelated: { ...property.acquisitionRelated!, exceeds: true, windowOpen: false } }
    show(withGroups({ rental: { properties: [open, over] } }), 'vermietung')
    const t = createAppI18n('de').t
    const w = property.acquisitionRelated!
    const values = { ende: '01.04.2026', grenze: '37.500 €', bisher: '12.300 €' }
    expect(w).toBeTruthy()
    expect(text('verlauf-gruppe-objekt-0-grenze').replace(/[\u00a0\u202f]/g, ' ')).toBe(t('verlauf.gruppe.vermietung.grenzeOffen', values).replace(/[\u00a0\u202f]/g, ' '))
    expect(text('verlauf-gruppe-objekt-1-grenze').replace(/[\u00a0\u202f]/g, ' ')).toBe(t('verlauf.gruppe.vermietung.grenzeUeber', values).replace(/[\u00a0\u202f]/g, ' ') + t('verlauf.gruppe.vermietung.ohneDatum', { count: 1 }))
    expect(text('verlauf-gruppe-objekt-1')).toContain(t('verlauf.gruppe.vermietung.objekt', { nummer: 2 }))
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-1-umschalten'))
    expect(screen.getByTestId('verlauf-gruppe-tabelle-1')).toBeTruthy()
  })

  it('asks for the purchase and the AfA when neither is known, without a book value or years left', () => {
    const bare = { ...property, depreciation: null, acquisitionRelated: null, bookValue: null, yearsLeft: null, years: [{ year: 2025, result: null, missing: ['mieteinnahmen'], depreciation: null, bookValueEnd: null }] }
    show(withGroups({ rental: { properties: [bare] } }), 'vermietung')
    expect(text('verlauf-gruppe-objekt-0')).toContain(createAppI18n('de').t('verlauf.gruppe.vermietung.afaOffen'))
    expect(text('verlauf-gruppe-objekt-0')).toContain(createAppI18n('de').t('verlauf.gruppe.vermietung.kaufOffen'))
    expect(screen.queryByTestId('verlauf-gruppe-objekt-0-grenze')).toBeNull()
  })

  it('shows the AfA with only the rate when the book value and the years left are unknown', () => {
    show(withGroups({ rental: { properties: [{ ...property, bookValue: null, yearsLeft: null }] } }), 'vermietung')
    expect(text('verlauf-gruppe-objekt-0')).toContain('4.200')
    expect(text('verlauf-gruppe-objekt-0')).not.toContain('198.450 € ·')
  })
})

describe('HistoryGroupPanel — Kapital', () => {
  const year = (y: number, over: object = {}) => ({ year: y, income: 1800, allowanceLimit: 1000, allowanceUsed: 1000, aboveAllowance: 800, fullyUsed: true, favourableCheck: null, ...over })
  const check = (statement: string, recommendation: string, delta: number) => ({ statement, recommendation, delta })

  it('says for each year how much allowance was used and what the Günstigerprüfung would have brought', () => {
    show(
      withGroups({
        capital: {
          years: [
            year(2022),
            year(2023, { fullyUsed: false, allowanceUsed: 400, aboveAllowance: 0, favourableCheck: check('zu-knapp', 'pauschal', 0) }),
            year(2024, { favourableCheck: check('eindeutig', 'persoenlich', 120) }),
            year(2025, { favourableCheck: check('eindeutig', 'pauschal', 0) }),
          ],
        } as never,
      }),
      'kapital',
    )
    const t = createAppI18n('de').t
    expect(text('verlauf-gruppe-kapital-pauschbetrag')).toContain('800')
    expect(text('verlauf-gruppe-kapital-pauschbetrag')).toContain('600')
    const guenstiger = text('verlauf-gruppe-kapital-guenstiger')
    expect(guenstiger).toContain(t('verlauf.gruppe.kapital.guenstigerOhne', { jahr: 2022 }))
    expect(guenstiger).toContain(t('verlauf.gruppe.kapital.guenstigerKnapp', { jahr: 2023 }))
    expect(guenstiger).toContain(t('verlauf.gruppe.kapital.guenstigerNein', { jahr: 2025 }))
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(text('verlauf-gruppe-tabelle')).toContain('120')
  })
})

describe('HistoryGroupPanel — Rente', () => {
  it('names the share and the allowance and each year with its taxable part', () => {
    show(HISTORY_ALL_GROUPS_RESPONSE, 'rente')
    expect(text('verlauf-gruppe-rente-jahre')).toContain('81')
    expect(text('verlauf-gruppe-rente-jahre')).toContain('2.944')
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(text('verlauf-gruppe-tabelle')).toContain('16.256')
  })

  it('shows an open year without an amount, and no facts line when they are unknown', () => {
    show(withGroups({ pension: { startYear: null, sharePercent: null, allowance: null, allowanceYear: null, years: [{ year: 2025, amount: null, taxablePart: null }, { year: 2026, amount: 9000, taxablePart: null }] } }), 'rente')
    expect(text('verlauf-gruppe-rente-jahre')).toContain(createAppI18n('de').t('verlauf.nochOffenKurz'))
    expect(text('verlauf-gruppe-rente-jahre')).not.toContain('Besteuerungsanteil')
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(text('verlauf-gruppe-tabelle')).toContain('–')
  })
})
