// ADR-0098 §1, §8 — one year of the Verlauf on its own page, against the `GET /v1/verlauf` wire with the
// mock's example household: one sentence on where the year stands, then by its kind the Bescheid-Abgleich
// as a receipt (the deadline chip, the lessons inside the rows), both Abgleiche of two single returns, the waiting year's
// positions without an amount, what an open year lacks (concretely), and the honest „nur Bescheid“.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { HISTORY_ALL_GROUPS_RESPONSE, HISTORY_GAP_RESPONSE, HISTORY_RESPONSE } from '../../test-history-fixture'
import { HistoryYearScreen } from './HistoryYearScreen'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')
const found = async (id: string) => {
  await screen.findByTestId(id)
  return text(id)
}

function renderYear(year: number, language: 'de' | 'en' = 'de') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const handlers = { onBack: vi.fn(), onOpenYear: vi.fn(), onPrepareAppeal: vi.fn(), onOpenReceipts: vi.fn() }
  renderInApp(
    <QueryClientProvider client={client}>
      <HistoryYearScreen year={year} isGuest={false} {...handlers} />
    </QueryClientProvider>,
    { language },
  )
  return handlers
}

beforeEach(() => {
  server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
})

describe('HistoryYearScreen', () => {
  it('shows a Bescheid year with its sentence and the receipt (own changes first, form view collapsed, lessons inside the rows)', async () => {
    const { onBack, onOpenYear, onPrepareAppeal } = renderYear(2024)
    expect(await found('verlauf-jahr-titel')).toBe('2024')
    expect(text('verlauf-jahr-satz')).toBe('Bescheid da: Das Finanzamt hat 2 Positionen geändert.')
    expect(text('verlauf-abgleich-2024-wirkung')).toBe('−92 €')
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
    expect(text('verlauf-jahr-satz')).toBe('Bescheid wie erklärt: Das Finanzamt hat nichts geändert.')
  })

  it('marks the change of the filing type only here', async () => {
    renderYear(2023)
    expect(await found('verlauf-jahr-wechsel')).toBe('ab 2023 zusammen veranlagt')
    expect(screen.getByTestId('verlauf-abgleich-2023-frist-vorbei')).toBeTruthy()
  })

  it('says honestly why a year with only its Bescheid has no Abgleich, and offers no cockpit outside the selectable years', async () => {
    renderYear(2021)
    expect(await found('verlauf-jahr-satz')).toBe(
      'Nur der Bescheid: Die Erklärung 2021 wurde nicht in SteuerEule gemacht, deshalb gibt es keinen Abgleich. Der Bescheid zählt im Verlauf trotzdem.',
    )
    expect(screen.queryByTestId('verlauf-zum-cockpit-2021')).toBeNull()
  })

  it('shows a waiting year with exactly the positions cut last year, no amount, no forecast', async () => {
    renderYear(2025)
    await screen.findByTestId('verlauf-wartet-2025')
    expect(text('verlauf-jahr-satz')).toBe('Abgegeben, der Bescheid steht aus.')
    const panel = text('verlauf-wartet-2025')
    expect(panel).toContain('Worauf du achten kannst')
    expect(panel).toContain('Homeoffice-Pauschale')
    expect(panel).toContain('Eine Vorhersage macht die Eule nicht.')
    expect(panel).not.toMatch(/€/)
  })

  it('says concretely what an open year lacks, with the month the certificates come in, and leads into its cockpit', async () => {
    const { onOpenYear } = renderYear(2026)
    await screen.findByTestId('verlauf-fehlt-2026')
    expect(text('verlauf-jahr-satz')).toBe('In Arbeit, noch nicht abgegeben.')
    expect(text('verlauf-fehlt-2026')).toContain('die Lohnsteuerbescheinigungen 2026 (kommen ab Februar 2027)')
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2026'))
    expect(onOpenYear).toHaveBeenCalledWith(2026)
  })

  it('lists what comes back every year on the open year, last year as a hint only, and leads to the receipts (ADR-0099 §2, §5)', async () => {
    const { onOpenReceipts } = renderYear(2026)
    await screen.findByTestId('verlauf-wiederkehrend-2026')
    expect(text('verlauf-wiederkehrend-2026')).toContain('Kommt jedes Jahr wieder')
    expect(text('verlauf-wiederkehrend-2026')).toContain('5 Posten aus den Vorjahren, 2 schon erledigt.')
    expect(screen.getByTestId('verlauf-wiederkehrend-2026-kontofuehrung').getAttribute('aria-label')?.replace(/\u00a0/g, ' ')).toBe('Kontoführung, erledigt: 2025: 32 € · 2026 eingetragen 32 €')
    expect(text('verlauf-wiederkehrend-2026-homeoffice')).toContain('⚠ 2023 und 2024 gekürzt')
    expect(text('verlauf-wiederkehrend-2026-spenden')).toContain('offen')
    expect(text('verlauf-wiederkehrend-2026')).toContain('Der Betrag des Vorjahres ist nur ein Hinweis, er wird nicht übernommen.')
    fireEvent.click(screen.getByTestId('verlauf-wiederkehrend-2026-belege'))
    expect(onOpenReceipts).toHaveBeenCalledOnce()
    // The checklist sits next to what the year lacks, not in its place.
    expect(screen.getByTestId('verlauf-fehlt-2026')).toBeTruthy()
  })

  it('puts the repeated cut and the couple comparison under the receipt, with the app’s approximation said (ADR-0099 §5, §6)', async () => {
    renderYear(2024)
    await screen.findByTestId('verlauf-muster-2024')
    expect(text('verlauf-muster-2024-homeofficeA')).toContain('Zum zweiten Mal gekürzt: Homeoffice-Pauschale 2023 und 2024, je 180 € weniger anerkannt.')
    expect(text('verlauf-muster-2024-homeofficeA')).toContain('Bescheinigung des Arbeitgebers')
    expect(text('verlauf-paare-2024')).toContain('Zusammen veranlagt: 2024 hat das etwa 1.010 € bis 1.230 € gebracht gegenüber zwei Einzelerklärungen.')
    expect(text('verlauf-paare-2024-etwa')).toBe('Rechnung der App, je nach Aufteilung der Abzüge')
    expect(text('verlauf-jahr-aenderbar')).toBe('Änderbar bis 02.01.2029 (Festsetzungsfrist), etwa für einen vergessenen Beleg.')
    // No Nachzahlung in this household, so no prepayment hint.
    expect(screen.queryByTestId('verlauf-vorauszahlung-2024')).toBeNull()
  })

  it('says the other direction for two single returns, exactly', async () => {
    renderYear(2022)
    expect(await found('verlauf-paare-2022')).toBe('Zusammen veranlagt wären es 2022 640 € mehr gewesen.')
    expect(screen.queryByTestId('verlauf-paare-2022-etwa')).toBeNull()
    expect(screen.queryByTestId('verlauf-muster-2022')).toBeNull()
  })

  it('names the prepayment hint on a year with a Nachzahlung, without saving tips (ADR-0099 §3)', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_ALL_GROUPS_RESPONSE)))
    renderYear(2024)
    expect(await found('verlauf-vorauszahlung-2024')).toBe('Nachzahlung laut Bescheid: Vorauszahlungen anpassen lassen (Antrag beim Finanzamt).')
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

  it('speaks English', async () => {
    renderYear(2021, 'en')
    expect(await found('verlauf-jahr-satz')).toContain('Assessment only')
  })
})
