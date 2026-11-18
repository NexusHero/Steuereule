// ADR-0098 §8 „Fürs nächste Mal“ — the lesson of last year's Bescheid shows again at the mask of the
// next open year (`maskLessons`), only there and only at its field, with no amount for a pending Bescheid.
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { HISTORY_RESPONSE, LESSONS_2024 } from '../../test-history-fixture'
import { MaskLessonHint } from './MaskLessonHint'

function renderHint(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderInApp(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('MaskLessonHint', () => {
  it('tells at the home office field of 2026 what the Finanzamt recognised in 2024, with the catalogue’s tip', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
    renderHint(<MaskLessonHint taxYear={2026} screen="commute" field="homeOfficeDays" person="A" />)
    const hint = await screen.findByTestId('maske-lehre-homeOfficeDays')
    expect(hint.textContent).toBe(
      'Aus dem Bescheid 20242024 hat das Finanzamt 180 statt 210 Homeoffice-Tage anerkannt. Tipp: Homeoffice-Tage laufend festhalten, zum Beispiel im Kalender oder mit einer Bescheinigung des Arbeitgebers.',
    )
  })

  it('stays away in another year, at another field and in the partner’s mask', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
    renderHint(
      <>
        <MaskLessonHint taxYear={2025} screen="commute" field="homeOfficeDays" />
        <MaskLessonHint taxYear={2026} screen="commute" field="oneWayKm" />
        <MaskLessonHint taxYear={2026} screen="commute" field="homeOfficeDays" person="B" />
        <MaskLessonHint taxYear={2026} screen="interview" field="homeOfficeDays" />
      </>,
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('maske-lehre-homeOfficeDays')).toBeNull()
    expect(screen.queryByTestId('maske-lehre-oneWayKm')).toBeNull()
  })

  it('words a euro lesson by its amounts', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json({ ...HISTORY_RESPONSE, maskLessons: { year: 2026, fromYear: 2024, lessons: [LESSONS_2024[1]!] } })))
    renderHint(<MaskLessonHint taxYear={2026} screen="commute" field="workEquipmentEur" />)
    const hint = await screen.findByTestId('maske-lehre-workEquipmentEur')
    expect((hint.textContent ?? '').replace(/ /g, ' ')).toContain('2024 hat das Finanzamt bei Arbeitsmittel 260 € statt 380 € anerkannt.')
  })
})
