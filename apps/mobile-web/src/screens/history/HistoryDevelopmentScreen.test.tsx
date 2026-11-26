// ADR-0098 §2, §6 — „Entwicklung über die Jahre“ on its own page, one tap from the timeline, against the
// `GET /v1/verlauf` wire with the mock's example household: the refund first, the person toggle only
// where it applies, the detail of the picked year with its tier and the change to the year before, the
// data table behind the chart, the KPI tiles on wide screens, and the way back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderWithQuery } from '../../../test/test-render'
import { server } from '../../../test/test-msw-server'
import { EMPTY_HISTORY_RESPONSE, HISTORY_ALL_GROUPS_RESPONSE, HISTORY_RESPONSE } from '../../../test/test-history-fixture'
import { HistoryDevelopmentScreen } from './HistoryDevelopmentScreen'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function renderDevelopment(language: 'de' | 'en' = 'de') {
  const handlers = { onBack: vi.fn(), onOpenYearDetail: vi.fn(), onOpenDrafts: vi.fn() }
  renderWithQuery(<HistoryDevelopmentScreen isGuest={false} openYear={2025} {...handlers} />, { language })
  return handlers
}

beforeEach(() => {
  setViewportWidth(0)
  server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
})

describe('HistoryDevelopmentScreen — phone', () => {
  it('opens with the refund, switches the key figure, and keeps the refund for the household', async () => {
    const { onBack } = renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(text('verlauf-entwicklung-titel')).toBe('Entwicklung über die Jahre')
    expect(text('verlauf-karte-titel')).toBe('Erstattung und Nachzahlung')
    expect(screen.getByLabelText('Erstattung und Nachzahlung, Jahre 2021–2026. Die Zahlen stehen in der Tabelle unter dem Diagramm.')).toBeTruthy()
    expect(text('verlauf-eule')).toContain('2024 hat das Finanzamt 92 € gekürzt.')

    fireEvent.click(screen.getByTestId('verlauf-person-B'))
    expect(text('verlauf-hinweis-haushalt')).toBe('Erstattung und Steuerquote gibt es nur gemeinsam. Angezeigt: Wir beide.')
    expect(text('verlauf-karte-titel')).toBe('Erstattung und Nachzahlung')

    fireEvent.click(screen.getByTestId('verlauf-kennzahl-werbungskosten'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr · Person B')
    expect(screen.queryByTestId('verlauf-hinweis-haushalt')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-netto'))
    expect(text('verlauf-karte-titel')).toBe('Vom Brutto zum Netto · Person B')
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-steuerquote'))
    expect(text('verlauf-karte-titel')).toBe('Wie viel Steuer aufs Brutto')

    fireEvent.click(screen.getByTestId('verlauf-entwicklung-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('moves the detail to a year picked in the chart, shows its tier and the change to the year before, and opens the year’s page', async () => {
    const { onOpenYearDetail } = renderDevelopment()
    await screen.findByTestId('verlauf-detail')
    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2025'))
    expect(text('verlauf-detail')).toContain('2025Schätzung')
    expect(text('verlauf-detail-erstattung')).toBe('Erstattung geschätzt+1.066–1.196 €')
    expect(text('verlauf-detail')).toContain('+257 € bis +387 € zum Vorjahr')

    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2023'))
    expect(text('verlauf-detail')).toContain('kein Vergleich: Veranlagungsart gewechselt')
    expect(text('verlauf-detail')).toContain('Schätzung vor dem Bescheid')
    expect(text('verlauf-detail')).toContain('innerhalb der Spanne')
    fireEvent.click(screen.getByTestId('verlauf-detail-abgleich'))
    expect(onOpenYearDetail).toHaveBeenCalledWith(2023)
  })

  it('says for a year with only its Bescheid that gross pay is not on it and offers its Lohnsteuerbescheinigung', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-netto'))
    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2021'))
    expect(text('verlauf-detail')).toContain('Brutto und Abzüge stehen nicht im Bescheid 2021')
    expect(screen.getByTestId('verlauf-detail-lstb')).toBeTruthy()
    expect(text('verlauf-detail')).toContain('nur Bescheid')
    expect(text('verlauf-detail')).not.toContain('Eckjahr')
  })

  it('keeps the chart card quiet: short sub text, no „erklärt“ in the legend, no tier pills, the open year only a word, the filing-type change only a line', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    const card = text('verlauf-karte')
    expect(card).toContain('Für den Haushalt. Rot gestrichelt: vom Finanzamt gekürzt.')
    // The legend names what the chart draws; the declared stroke is gone, so is its entry.
    expect(card).toContain('Erstattung laut Bescheidvom Finanzamt gekürztSchätzung (Spanne)Wechsel der Veranlagungsart▸')
    expect(card).not.toContain('erklärt')
    // Under the table toggle only the hint is left, no Bescheid / Schätzung / offen pills.
    expect(card).toMatch(/Zahlen als Tabelle zeigenTippe ein Jahr für Details\.$/)
    const chart = screen.getByTestId('verlauf-diagramm-svg')
    // The open year is the word alone, with no shape beside it.
    const open = within(chart).getByText('offen')
    expect(open.parentElement!.children).toHaveLength(1)
    // The filing-type change is a line the legend names, not words in the plot; the sum of two single returns has no „Σ“.
    expect(chart.textContent).not.toMatch(/veranlagt|Σ/)
  })

  it('has a data table behind the chart with every year and tier', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(screen.queryByTestId('verlauf-datentabelle')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-datentabelle-umschalten'))
    const table = screen.getByTestId('verlauf-datentabelle')
    expect(table.getAttribute('role')).toBe('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(7)
    expect((rows[4]!.textContent ?? '').replace(/ /g, ' ')).toBe('2024Bescheid+901 €+809 €−92 €')
    expect((rows[6]!.textContent ?? '').replace(/ /g, ' ')).toBe('2026offen–noch offen–')
  })

  it('says so when there is no year to show', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(EMPTY_HISTORY_RESPONSE)))
    renderDevelopment()
    expect(await screen.findByTestId('verlauf-entwicklung-leer')).toBeTruthy()
  })
})

describe('HistoryDevelopmentScreen — group tabs (ADR-0099 §3, §7)', () => {
  /** The chip rows in order, each with its label and its chips: the key figures, then the household's own areas. */
  const chipRows = () =>
    screen.getAllByRole('tablist').map((list) => ({
      label: list.getAttribute('aria-label'),
      chips: within(list)
        .getAllByRole('tab')
        .map((t) => t.getAttribute('data-testid')),
    }))
  const METRIC_CHIPS = ['verlauf-kennzahl-erstattung', 'verlauf-kennzahl-werbungskosten', 'verlauf-kennzahl-netto', 'verlauf-kennzahl-steuerquote']

  it('offers the four key figures as one row and only the groups the household has as a second row under „Deine Bereiche“', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(chipRows()).toEqual([
      { label: 'Kennzahl wählen', chips: METRIC_CHIPS },
      { label: 'Deine Bereiche', chips: ['verlauf-bereich-schweiz', 'verlauf-bereich-kapital'] },
    ])
    expect(screen.getByText('Deine Bereiche')).toBeTruthy()
    // Both rows wrap: nothing hides behind a horizontal scroll.
    for (const list of screen.getAllByRole('tablist')) expect(getComputedStyle(list).flexWrap).toBe('wrap')
  })

  it('deselects a group by pressing its active chip again and returns to the key figure', async () => {
    renderDevelopment()
    const chip = await screen.findByTestId('verlauf-bereich-schweiz')
    expect(screen.getByTestId('verlauf-kennzahl-erstattung').getAttribute('aria-selected')).toBe('true')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('verlauf-kennzahl-erstattung').getAttribute('aria-selected')).toBe('false')
    expect(screen.queryByTestId('verlauf-karte')).toBeNull()
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-selected')).toBe('false')
    expect(screen.queryByTestId('verlauf-gruppe-schweiz-kurs')).toBeNull()
    expect(text('verlauf-karte-titel')).toBe('Erstattung und Nachzahlung')
    expect(screen.getByTestId('verlauf-kennzahl-erstattung').getAttribute('aria-selected')).toBe('true')
  })

  it('shows the Grenzgänger: rate and wage in euros, the credited Quellensteuer as a chart with its table, the Swiss share', async () => {
    renderDevelopment()
    fireEvent.click(await screen.findByTestId('verlauf-bereich-schweiz'))
    expect(screen.queryByTestId('verlauf-karte')).toBeNull()
    expect(text('verlauf-gruppe-schweiz-kurs')).toContain('1,065 €/CHF · 49.000 CHF → 52.185 €')
    expect(text('verlauf-gruppe-schweiz-kurs')).toContain('Kurs +1,4 % zum Vorjahr')
    expect(text('verlauf-gruppe-schweiz-quellensteuer')).toContain('2025: 2.348 € angerechnet, höchstens 4,5 % vom Bruttolohn (DBA Art. 15a).')
    expect(text('verlauf-gruppe-schweiz-quellensteuer')).toContain('2025: einbehalten 2.600 CHF; mehr als 4,5 % rechnet Deutschland nicht an.')
    expect(text('verlauf-gruppe-schweiz-anteil')).toBe('Anteil Schweizer Einkommen2024: 18,0 % · 2025: 100,0 %')
    expect(screen.getByTestId('verlauf-gruppe-diagramm-svg')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    const rows = within(screen.getByTestId('verlauf-gruppe-tabelle')).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[2]!.textContent).toBe('2025Person A1,06549.00052.1852.6002.348')
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-werbungskosten'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr')
  })

  it('shows the capital tab with the allowance used, the Günstigerprüfung and the pots „noch nicht erfasst“', async () => {
    renderDevelopment()
    fireEvent.click(await screen.findByTestId('verlauf-bereich-kapital'))
    expect(text('verlauf-gruppe-kapital-pauschbetrag')).toContain('2.000 / 2.000 €')
    expect(text('verlauf-gruppe-kapital-pauschbetrag')).toContain('voll genutzt · 682 € darüber')
    expect(text('verlauf-gruppe-kapital-pauschbetrag')).toContain('Verlustverrechnungstöpfe: noch nicht erfasst.')
    expect(text('verlauf-gruppe-kapital-guenstiger')).toContain('2024: hätte nichts gebracht. 2025: ohne Bescheid keine Günstigerprüfung.')
  })

  it('shows the back payments with the prepayment hint, the rental property with AfA and the 15 % window, and the pension', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_ALL_GROUPS_RESPONSE)))
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(chipRows().map((r) => r.chips)).toEqual([METRIC_CHIPS, ['verlauf-bereich-vorauszahlungen', 'verlauf-bereich-schweiz', 'verlauf-bereich-vermietung', 'verlauf-bereich-kapital', 'verlauf-bereich-rente']])
    fireEvent.click(screen.getByTestId('verlauf-bereich-vorauszahlungen'))
    expect(text('verlauf-gruppe-vorauszahlungen-hinweis')).toBe('3 Jahre Nachzahlung in Folge, im Schnitt 2.400 €. Vorauszahlungen anpassen lassen (Antrag beim Finanzamt).')
    expect(text('verlauf-gruppe-vorauszahlungen')).not.toMatch(/zurücklegen|sparen/)

    fireEvent.click(screen.getByTestId('verlauf-bereich-vermietung'))
    const flat = text('verlauf-gruppe-objekt-0')
    expect(flat).toContain('Lindenstraße 4 · Ergebnis je Jahr')
    expect(flat).toContain('2026: noch offen')
    expect(flat).toContain('Jährlich 4.200 € (2,0 %) · Restwert Gebäude 198.450 € · noch 47 Jahre')
    expect(text('verlauf-gruppe-objekt-0-grenze')).toContain('Die ersten 3 Jahre nach dem Kauf sind vorbei (01.04.2026). Bis dahin: 12.300 € von 37.500 €.')
    expect(text('verlauf-gruppe-objekt-0-grenze')).toContain('1 Posten ohne Datum vorsichtshalber mitgezählt.')
    expect(text('verlauf-gruppe-verlustvortrag')).toBe('Verlustvortrag: noch nicht erfasst.')

    fireEvent.click(screen.getByTestId('verlauf-bereich-rente'))
    expect(text('verlauf-gruppe-rente-jahre')).toContain('Besteuerungsanteil 81,0 % (Rentenbeginn 2021) und Rentenfreibetrag fest 2.944 € seit 2022')
    expect(text('verlauf-gruppe-rente-jahre')).toContain('19.200 € · steuerpflichtig 16.256 €')
    expect(text('verlauf-gruppe-rente-jahre')).toContain('der Rentenfreibetrag bleibt seit Rentenbeginn gleich')
    fireEvent.click(screen.getByTestId('verlauf-gruppe-tabelle-umschalten'))
    expect(within(screen.getByTestId('verlauf-gruppe-tabelle')).getAllByRole('row')).toHaveLength(3)
  })

  it('shows no group tab for a household without such data', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json({ ...HISTORY_RESPONSE, groups: { crossBorder: null, rental: null, capital: null, pension: null, lossCarryForward: { status: 'notRecorded' } } })))
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(screen.queryAllByTestId(/^verlauf-bereich-/)).toHaveLength(0)
    // No second row and no eyebrow for it either.
    expect(screen.getAllByRole('tablist')).toHaveLength(1)
    expect(screen.queryByText('Deine Bereiche')).toBeNull()
  })
})

describe('HistoryDevelopmentScreen — tablet and desktop', () => {
  beforeEach(() => setViewportWidth(1280))

  it('names no person on the KPI tiles when the household is one person', async () => {
    server.use(
      http.get('*/v1/verlauf', () =>
        HttpResponse.json({ ...HISTORY_RESPONSE, years: HISTORY_RESPONSE.years.map((y) => ({ ...y, persons: ['A'] })) }),
      ),
    )
    renderDevelopment()
    await screen.findByTestId('verlauf-kpi-erstattung')
    expect(text('verlauf-kpi-erstattung')).toContain('Erstattung 2025')
    expect(text('verlauf-kpi-erstattung')).not.toContain('Wir beide')
    expect(text('verlauf-kpi-netto')).not.toContain('Wir beide')
  })

  it('shows the KPI tiles for the latest year with a value, and the person toggle in the header', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-kpi-erstattung')
    expect(text('verlauf-kpi-erstattung')).toContain('Erstattung 2025 · Wir beide')
    expect(text('verlauf-kpi-erstattung')).toContain('+1.066–1.196 €')
    expect(text('verlauf-kpi-netto')).toContain('Brutto → Netto 2025 · Wir beide')
    expect(screen.queryByTestId('verlauf-kennzahl-erstattung')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-kpi-werbungskosten'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr')
    fireEvent.click(screen.getByTestId('verlauf-person-A'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr · Person A')
  })

  it('offers the group tabs under the KPI tiles and switches back by a tile', async () => {
    renderDevelopment()
    fireEvent.click(await screen.findByTestId('verlauf-bereich-kapital'))
    expect(screen.getByTestId('verlauf-gruppe-kapital')).toBeTruthy()
    expect(screen.queryByTestId('verlauf-karte')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-kpi-netto'))
    expect(screen.queryByTestId('verlauf-gruppe-kapital')).toBeNull()
    expect(text('verlauf-karte-titel')).toBe('Vom Brutto zum Netto')
    // Pressing the active group chip again deselects it here too.
    fireEvent.click(screen.getByTestId('verlauf-bereich-kapital'))
    fireEvent.click(screen.getByTestId('verlauf-bereich-kapital'))
    expect(screen.queryByTestId('verlauf-gruppe-kapital')).toBeNull()
    expect(text('verlauf-karte-titel')).toBe('Vom Brutto zum Netto')
  })
})

describe('HistoryDevelopmentScreen — English', () => {
  it('speaks English', async () => {
    renderDevelopment('en')
    await screen.findByTestId('verlauf-karte')
    expect(text('verlauf-karte-titel')).toBe('Refund and back payment')
  })
})
