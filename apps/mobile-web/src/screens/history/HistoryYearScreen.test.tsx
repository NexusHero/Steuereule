// ADR-0098 §1, §8 — one year of the Verlauf on its own page, against the `GET /v1/verlauf` wire with the
// mock's example household: one sentence on where the year stands, then by its kind the Bescheid-Abgleich
// as a receipt (the deadline chip, the lessons inside the rows), both Abgleiche of two single returns, the waiting year's
// positions without an amount, what an open year lacks (concretely), and the honest „nur Bescheid“. Under
// the Abgleich the repeated cut, the couple comparison and the prepayment hint are plain lines.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderWithQuery } from '../../test-render'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { HISTORY_ALL_GROUPS_RESPONSE, HISTORY_GAP_RESPONSE, HISTORY_RESPONSE } from '../../test-history-fixture'
import { HistoryYearScreen } from './HistoryYearScreen'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')
const found = async (id: string) => {
  await screen.findByTestId(id)
  return text(id)
}

function renderYear(year: number, language: 'de' | 'en' = 'de') {
  const handlers = { onBack: vi.fn(), onOpenYear: vi.fn(), onPrepareAppeal: vi.fn(), onOpenReceipts: vi.fn() }
  renderWithQuery(<HistoryYearScreen year={year} isGuest={false} {...handlers} />, { language })
  return handlers
}

beforeEach(() => {
  server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
})

describe('HistoryYearScreen', () => {
  it('shows a Bescheid year with its sentence and the receipt (own changes first, form view collapsed, lessons inside the rows)', async () => {
    const { onBack, onOpenYear, onPrepareAppeal } = renderYear(2024)
    expect(await found('verlauf-jahr-titel')).toBe('2024')
    expect(text('verlauf-jahr-satz')).toBe('Bescheid da · 2 Positionen geändert')
    expect(text('verlauf-abgleich-2024-wirkung')).toBe('−92 €')
    // The Abgleich below carries the year's figure, so the head has none of its own.
    expect(screen.queryByTestId('verlauf-jahr-betrag')).toBeNull()
    expect(screen.getAllByTestId(/^verlauf-abgleich-2024-zeile-/)[0]!.getAttribute('data-testid')).toBe('verlauf-abgleich-2024-zeile-homeofficeA')
    expect(screen.queryByTestId('verlauf-abgleich-2024-formularansicht')).toBeNull()
    // The count is said once, in the page's sentence; „Fürs nächste Mal“ is no block of its own.
    expect(text('screen-container').match(/2 Positionen|2 Änderungen/g)).toHaveLength(1)
    expect(text('screen-container')).not.toContain('Fürs nächste Mal')
    fireEvent.click(screen.getByRole('button', { name: /^Homeoffice-Pauschale:/ }))
    expect(text('verlauf-abgleich-2024-detail-homeofficeA')).toContain('Erscheint 2026 in der Maske „Homeoffice“')
    // The cut stays inside the Abgleich, not in the page's head.
    expect(text('verlauf-jahr-satz')).not.toContain('€')
    fireEvent.click(screen.getByTestId('verlauf-abgleich-2024-einspruch'))
    expect(onPrepareAppeal).toHaveBeenCalledWith(2024)
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2024'))
    expect(onOpenYear).toHaveBeenCalledWith(2024)
    fireEvent.click(screen.getByTestId('verlauf-jahr-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows both Abgleiche of two single returns', async () => {
    renderYear(2022)
    await screen.findByTestId('verlauf-abgleich-2022-A')
    expect(screen.getByTestId('verlauf-abgleich-2022-B')).toBeTruthy()
    expect(text('verlauf-jahr-satz')).toBe('Bescheid wie erklärt')
  })

  it('marks the change of the filing type only here', async () => {
    renderYear(2023)
    expect(await found('verlauf-jahr-wechsel')).toBe('ab 2023 zusammen veranlagt')
    expect(screen.getByTestId('verlauf-abgleich-2023-frist-vorbei')).toBeTruthy()
  })

  it('says honestly why a year with only its Bescheid has no Abgleich, and offers no cockpit outside the selectable years', async () => {
    renderYear(2021)
    expect(await found('verlauf-jahr-satz')).toBe('Nur der Bescheid. Die Erklärung lief nicht über SteuerEule, deshalb gibt es keinen Abgleich.')
    // Without an Abgleich the head carries the Bescheid's figure.
    expect(text('verlauf-jahr-betrag')).toBe('Erstattung 220 € laut Bescheid')
    expect(screen.queryByTestId('verlauf-zum-cockpit-2021')).toBeNull()
  })

  it('shows a waiting year with its estimate as a range and exactly the positions cut last year, no amount there, no forecast', async () => {
    renderYear(2025)
    await screen.findByTestId('verlauf-wartet-2025')
    expect(text('verlauf-jahr-satz')).toBe('Abgegeben · wartet auf Bescheid')
    expect(text('verlauf-jahr-betrag')).toBe('Schätzung +1.066–1.196 €')
    const panel = text('verlauf-wartet-2025')
    expect(panel).toMatch(/^Worauf du achten kannst2 Positionen hat das Finanzamt 2024 gekürzt; 2025 stehen sie wieder so in der Erklärung\./)
    expect(panel).toContain('Homeoffice-Pauschale')
    expect(panel).toMatch(/Kommt der Bescheid, steht hier der Abgleich\.$/)
    expect(panel).not.toMatch(/€|Eingereicht|Vorhersage/)
  })

  it('says concretely what an open year lacks, with the month the certificates come in, and leads into its cockpit', async () => {
    const { onOpenYear } = renderYear(2026)
    await screen.findByTestId('verlauf-fehlt-2026')
    expect(text('verlauf-jahr-satz')).toBe('In Arbeit, noch nicht abgegeben')
    // An open year never shows a figure of its own (no forecast).
    expect(screen.queryByTestId('verlauf-jahr-betrag')).toBeNull()
    expect(text('verlauf-fehlt-2026')).toContain('die Lohnsteuerbescheinigungen 2026 (kommen ab Februar 2027)')
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2026'))
    expect(onOpenYear).toHaveBeenCalledWith(2026)
  })

  it('lists what is still open of what comes back every year, folds the done items behind a count, and leads to the receipts (ADR-0099 §2, §5)', async () => {
    const { onOpenReceipts } = renderYear(2026)
    await screen.findByTestId('verlauf-wiederkehrend-2026')
    expect(text('verlauf-wiederkehrend-2026')).toContain('Kommt jedes Jahr wieder')
    // No intro sentence, no footer hint, no „offen“ pill: the open items are the list.
    expect(text('verlauf-wiederkehrend-2026')).not.toMatch(/Posten aus den Vorjahren|nur ein Hinweis/)
    expect(text('verlauf-wiederkehrend-2026-homeoffice')).toContain('⚠ 2023 und 2024 gekürzt')
    expect(text('verlauf-wiederkehrend-2026-spenden')).not.toContain('offen')
    expect(screen.getByTestId('verlauf-wiederkehrend-2026-spenden').getAttribute('aria-label')).toMatch(/^Spenden, offen: /)
    expect(screen.getByTestId('verlauf-wiederkehrend-2026-kita')).toBeTruthy()
    // The done items wait behind their count.
    expect(screen.queryByTestId('verlauf-wiederkehrend-2026-kontofuehrung')).toBeNull()
    expect(screen.queryByTestId('verlauf-wiederkehrend-2026-arbeitsweg')).toBeNull()
    const toggle = screen.getByTestId('verlauf-wiederkehrend-2026-erledigt')
    expect(text('verlauf-wiederkehrend-2026-erledigt')).toBe('▸ 2 erledigt')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(text('verlauf-wiederkehrend-2026-erledigt')).toBe('▾ 2 erledigt')
    expect(screen.getByTestId('verlauf-wiederkehrend-2026-kontofuehrung').getAttribute('aria-label')?.replace(/\u00a0/g, ' ')).toBe('Kontoführung, erledigt: 2025: 32 € · 2026 eingetragen 32 €')
    expect(screen.getByTestId('verlauf-wiederkehrend-2026-arbeitsweg')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-wiederkehrend-2026-belege'))
    expect(onOpenReceipts).toHaveBeenCalledOnce()
    // The checklist sits next to what the year lacks, not in its place.
    expect(screen.getByTestId('verlauf-fehlt-2026')).toBeTruthy()
  })

  it('keeps a done item that was cut before in the visible list and counts only the folded ones (ADR-0099 §5)', async () => {
    const recurring = HISTORY_RESPONSE.recurring!
    const cutDone = { ...HISTORY_RESPONSE, recurring: { ...recurring, done: 3, open: 2, items: recurring.items.map((i) => (i.id === 'homeoffice' ? { ...i, status: 'erledigt' as const } : i)) } }
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(cutDone)))
    renderYear(2026)
    await screen.findByTestId('verlauf-wiederkehrend-2026')
    expect(screen.getByTestId('verlauf-wiederkehrend-2026-homeoffice').getAttribute('aria-label')).toMatch(/^Homeoffice, erledigt: /)
    expect(text('verlauf-wiederkehrend-2026-homeoffice')).toContain('⚠ 2023 und 2024 gekürzt')
    expect(text('verlauf-wiederkehrend-2026-erledigt')).toBe('▸ 2 erledigt')
    expect(screen.queryByTestId('verlauf-wiederkehrend-2026-kontofuehrung')).toBeNull()
  })

  it('has no toggle when nothing is done', async () => {
    const recurring = HISTORY_RESPONSE.recurring!
    const noneDone = { ...HISTORY_RESPONSE, recurring: { ...recurring, done: 0, open: 5, items: recurring.items.map((i) => ({ ...i, status: 'offen' as const })) } }
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(noneDone)))
    renderYear(2026)
    await screen.findByTestId('verlauf-wiederkehrend-2026-kontofuehrung')
    expect(screen.queryByTestId('verlauf-wiederkehrend-2026-erledigt')).toBeNull()
  })

  it('puts the repeated cut and the couple comparison as plain lines under the receipt, the detail and the app’s approximation behind a tap (ADR-0099 §5, §6)', async () => {
    renderYear(2024)
    await screen.findByTestId('verlauf-muster-2024')
    const cut = screen.getByTestId('verlauf-muster-2024-homeofficeA')
    expect(text('verlauf-muster-2024-homeofficeA')).toBe('Zum zweiten Mal gekürzt: Homeoffice-Pauschale▸')
    expect(screen.queryByTestId('verlauf-muster-2024-homeofficeA-detail')).toBeNull()
    fireEvent.click(within(cut).getByRole('button'))
    expect(within(cut).getByRole('button').getAttribute('aria-expanded')).toBe('true')
    expect(text('verlauf-muster-2024-homeofficeA-detail')).toContain('Zum zweiten Mal gekürzt: Homeoffice-Pauschale 2023 und 2024, je 180 € weniger anerkannt.')
    expect(text('verlauf-muster-2024-homeofficeA-detail')).toContain('Bescheinigung des Arbeitgebers')
    const couple = screen.getByTestId('verlauf-paare-2024')
    expect(text('verlauf-paare-2024')).toBe('Zusammen veranlagt hat etwa 1.010 € bis 1.230 € gebracht.▸')
    expect(screen.queryByTestId('verlauf-paare-2024-etwa')).toBeNull()
    fireEvent.click(within(couple).getByRole('button'))
    expect(text('verlauf-paare-2024-etwa')).toBe('Rechnung der App, je nach Aufteilung der Abzüge')
    // Plain lines: no coloured box behind either note.
    for (const el of [cut, couple]) expect(getComputedStyle(el).backgroundColor).toMatch(/^$|transparent|rgba\(0, 0, 0, 0\)/)
    expect(text('verlauf-jahr-aenderbar')).toBe('Änderbar bis 02.01.2029')
    // No Nachzahlung in this household, so no prepayment hint.
    expect(screen.queryByTestId('verlauf-vorauszahlung-2024')).toBeNull()
  })

  it('says the other direction for two single returns, exactly', async () => {
    renderYear(2022)
    expect(await found('verlauf-paare-2022')).toBe('Zusammen veranlagt wären es 640 € mehr gewesen.')
    // Exact, so there is nothing to open.
    expect(within(screen.getByTestId('verlauf-paare-2022')).queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('verlauf-paare-2022-etwa')).toBeNull()
    expect(screen.queryByTestId('verlauf-muster-2022')).toBeNull()
  })

  it('names the prepayment hint on a year with a Nachzahlung, without saving tips (ADR-0099 §3)', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_ALL_GROUPS_RESPONSE)))
    renderYear(2024)
    expect(await found('verlauf-vorauszahlung-2024')).toBe('Vorauszahlungen anpassen lassen (Antrag beim Finanzamt).')
    expect(within(screen.getByTestId('verlauf-vorauszahlung-2024')).queryByRole('button')).toBeNull()
  })

  it('says nothing about the couple comparison for a year the app has no tariff for', async () => {
    const noTariff = { ...HISTORY_RESPONSE, couples: HISTORY_RESPONSE.couples.map((c) => (c.year === 2022 ? { year: 2022, status: 'tarif-fehlt' as const } : c)) }
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(noTariff)))
    renderYear(2022)
    await screen.findByTestId('verlauf-abgleich-2022-A')
    expect(screen.queryByTestId('verlauf-paare-2022')).toBeNull()
  })

  it('says a Bescheid that changed positions without moving the refund has no effect on it', async () => {
    const flat = { ...HISTORY_RESPONSE, list: HISTORY_RESPONSE.list.map((l) => (l.year === 2024 ? { ...l, difference: 0 } : l)) }
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(flat)))
    renderYear(2024)
    expect(await found('verlauf-jahr-satz')).toBe('Bescheid da · 2 Positionen geändert, ohne Wirkung auf die Erstattung')
  })

  it('shows a year without data with its deadline, the question once and a start, never an amount (ADR-0099 §1)', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_GAP_RESPONSE)))
    const { onOpenYear } = renderYear(2022)
    expect(await found('verlauf-jahr-satz')).toBe('2022 ist nicht in der App. Abgeben geht bis 31.12.2026.')
    expect(screen.getByTestId('verlauf-jahr-frage-2022')).toBeTruthy()
    expect(text('screen-container')).not.toMatch(/€/)
    expect(screen.queryByTestId('verlauf-fehlt-2022')).toBeNull()
    expect(text('verlauf-zum-cockpit-2022')).toBe('2022 anfangen')
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2022'))
    expect(onOpenYear).toHaveBeenCalledWith(2022)
  })

  it('says a year filed elsewhere waits for its Bescheid and offers no start', async () => {
    const filed = {
      ...HISTORY_GAP_RESPONSE,
      list: HISTORY_GAP_RESPONSE.list.map((l) => (l.year === 2022 ? { ...l, status: 'extern-erledigt' as const, kind: 'eckjahr' as const, withoutAssessment: true, filedElsewhere: { answer: 'ja' as const, answeredOn: '2026-11-18', askAgainFrom: null, ask: false } } : l)),
    }
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(filed)))
    renderYear(2022)
    expect(await found('verlauf-jahr-satz')).toBe('Anderswo abgegeben. Lädst du den Bescheid hoch, steht 2022 mit seinen Zahlen im Verlauf.')
    expect(screen.queryByTestId('verlauf-jahr-frage-2022')).toBeNull()
    expect(screen.queryByTestId('verlauf-zum-cockpit-2022')).toBeNull()
  })

  it('says so for a year that is not in the Verlauf', async () => {
    renderYear(1999)
    expect(await found('verlauf-jahr-unbekannt')).toContain('1999 steht nicht im Verlauf')
  })

  it('NR-21: an address that names no year (/app/verlauf/abc → NaN) never shows "NaN"', async () => {
    renderYear(Number('abc'))
    const shown = await found('verlauf-jahr-unbekannt')
    expect(shown).toContain('Diese Adresse nennt kein Steuerjahr')
    expect(shown).not.toContain('NaN')
  })

  it('speaks English', async () => {
    renderYear(2021, 'en')
    expect(await found('verlauf-jahr-satz')).toBe('Only the notice. The return was not made in SteuerEule, so there is nothing to compare.')
  })
})

describe('HistoryYearScreen — fails closed (WEB-28)', () => {
  it('every request answering 500 shows a failure and sends no write (FiledElsewhereQuestion, uploads)', async () => {
    const failing = failEveryRequest()
    renderYear(2022)
    await expectFailsClosed(failing)
  })
})
