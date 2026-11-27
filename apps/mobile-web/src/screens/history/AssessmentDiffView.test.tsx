// ADR-0098 §8 — the Bescheid-Abgleich as a receipt, in the Verlauf and in „Bescheid prüfen“: one figure
// for what the Bescheid did to the refund, coloured by what it means for the user, the deadline chip
// beside it, one line per own deviation (largest effect first) like a diff: sign, position, effect. Each
// line opens to its values, the short reason, the Finanzamt's quote and the lesson for next time, and the
// form view is one tap away. Short: on the mock's 2024 one phone screen, every message said once.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderInApp } from '../../../test/test-render'
import { DIFF_2024, HISTORY_DIFFS, LESSONS_2024 } from '../../../test/test-history-fixture'
import { AssessmentDiffView } from './AssessmentDiffView'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')
const label = (el: Element) => (el.getAttribute('aria-label') ?? '').replace(/\u00A0/g, ' ')

/** The text as a reader sees it: every text node on its own, so adjacent elements do not run together. */
function readable(el: Element): string {
  const parts: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) parts.push(n.textContent ?? '')
  return parts.join(' ').replace(/ /g, ' ').replace(/\s+/g, ' ')
}
const wordsOf = (s: string) => s.replace(/[·→+–−›ⓘ⚠]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w))

const RUNNING = { endsOn: '2026-12-07', remainingDays: 19, running: true }

function renderYearPage2024(extra: { onPrepareAppeal?: () => void } = {}) {
  const d = HISTORY_DIFFS[0]!
  renderInApp(
    <AssessmentDiffView diff={d.diff} deadline={d.deadline} submittedOn={d.submittedOn} assessmentDate={d.assessmentDate} lessons={d.lessons} maskYear={2026} yearInTitle={false} testID="abgleich" {...extra} />,
  )
}

// Graphit: the sign says which way money moved; red and green stay for faults and confirmations.
const INK = 'rgb(15, 15, 20)'

describe('AssessmentDiffView — the receipt', () => {
  it('heads with the total effect on the refund in ink, never red, and the refund declared → assessed under it', () => {
    renderYearPage2024()
    expect(text('abgleich-wirkung')).toBe('−92 €')
    expect(label(screen.getByTestId('abgleich-wirkung'))).toBe('Wirkung auf die Erstattung insgesamt: −92 €')
    expect(getComputedStyle(screen.getByTestId('abgleich-wirkung')).color).toBe(INK)
    expect(text('abgleich')).toContain('Erstattung 901 → 809 €')
    // No eyebrow, no pills, no chain, no owl sentence, no lessons block, no repeated year title.
    for (const gone of ['Bescheid-Abgleich', 'Änderungen', 'daraus folgt', 'Fürs nächste Mal', 'Erläuterung im Bescheid', 'Erklärung ↔ Bescheid', 'Eule']) expect(text('abgleich')).not.toContain(gone)
    for (const id of ['abgleich-anzahl', 'abgleich-kette', 'abgleich-lehren', 'abgleich-spalten']) expect(screen.queryByTestId(id)).toBeNull()
  })

  it('draws a gain in ink too, never green', () => {
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, totalRefundEffect: 40, effectsDifferFromTotal: false }} deadline={null} testID="gut" />)
    expect(text('gut-wirkung')).toBe('+40 €')
    expect(getComputedStyle(screen.getByTestId('gut-wirkung')).color).toBe(INK)
  })

  it('lists one line per own deviation, largest effect first, like a diff: sign, label and the unsigned effect in ink', () => {
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, ownDeviations: [DIFF_2024.ownDeviations[1]!, DIFF_2024.ownDeviations[0]!] }} deadline={null} testID="abgleich" />)
    const rows = screen.getAllByTestId(/^abgleich-zeile-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['abgleich-zeile-homeofficeA', 'abgleich-zeile-arbeitsmittelA'])
    const home = screen.getByTestId('abgleich-zeile-homeofficeA')
    expect(readable(home).trim()).toBe('− Homeoffice-Pauschale 56 €')
    // The colour carries the sign, on the glyph and on the amount.
    expect(getComputedStyle(within(home).getByText('−')).color).toBe(INK)
    expect(getComputedStyle(within(home).getByText(/^56\s€$/)).color).toBe(INK)
    // The declared and assessed values wait behind the tap.
    expect(text('abgleich')).not.toMatch(/1\.260|1\.080/)
  })

  it('signs a gain with + and a change without effect on the refund with ±', () => {
    const [home, work] = DIFF_2024.ownDeviations
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, ownDeviations: [{ ...home!, refundEffect: 40 }, { ...work!, refundEffect: 0 }] }} deadline={null} testID="abgleich" />)
    const gain = screen.getByTestId('abgleich-zeile-homeofficeA')
    expect(readable(gain).trim()).toBe('+ Homeoffice-Pauschale 40 €')
    expect(getComputedStyle(within(gain).getByText('+')).color).toBe(INK)
    expect(readable(screen.getByTestId('abgleich-zeile-arbeitsmittelA')).trim()).toBe('± Arbeitsmittel 0 €')
  })

  it('marks a line the next year declared the same again, and opens it to the values, the short reason and the warning', () => {
    renderYearPage2024()
    const home = screen.getByTestId('abgleich-zeile-homeofficeA')
    expect(readable(home).trim()).toBe('− Homeoffice-Pauschale ⚠ 56 €')
    expect(text('abgleich')).not.toMatch(/180 statt 210 Tage|wieder/)
    fireEvent.click(within(home).getByRole('button'))
    const detail = readable(screen.getByTestId('abgleich-detail-homeofficeA'))
    expect(detail).toContain('1.260 → 1.080 · 180 statt 210 Tage')
    expect(detail).toContain('⚠ 2025 wieder 210 erklärt')
    // Open, the warning is said in words below, so the mark leaves the line.
    expect(readable(within(home).getByRole('button')).trim()).toBe('− Homeoffice-Pauschale 56 €')
    fireEvent.click(within(screen.getByTestId('abgleich-zeile-arbeitsmittelA')).getByRole('button'))
    const work = readable(screen.getByTestId('abgleich-detail-arbeitsmittelA'))
    expect(work).toContain('380 → 260 · Handy nur zu 50 %')
    expect(work).toContain('⚠ 2025 wieder 520 € erklärt')
  })

  it('opens to only the values when no short reason was found, and keeps the quote behind the tap', () => {
    const [home] = DIFF_2024.ownDeviations
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, ownDeviations: [{ ...home!, shortReason: null }] }} deadline={null} testID="abgleich" />)
    const row = screen.getByTestId('abgleich-zeile-homeofficeA')
    expect(readable(row).trim()).toBe('− Homeoffice-Pauschale 56 €')
    expect(text('abgleich')).not.toContain('180 statt 210 Tagen')
    fireEvent.click(within(row).getByRole('button'))
    expect(readable(screen.getByTestId('abgleich-detail-homeofficeA')).trim()).toBe('1.260 → 1.080 „Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.“')
  })

  it('makes every line a button, also one without quote, hint or mask: it still opens to its values', () => {
    const [home] = DIFF_2024.ownDeviations
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, ownDeviations: [{ ...home!, shortReason: null, explanation: null }] }} deadline={null} testID="abgleich" />)
    fireEvent.click(within(screen.getByTestId('abgleich-zeile-homeofficeA')).getByRole('button'))
    expect(readable(screen.getByTestId('abgleich-detail-homeofficeA')).trim()).toBe('1.260 → 1.080')
  })

  it('opens a row to its values, the Finanzamt’s quote, the hint and where it shows next year; a button with its expanded state', () => {
    renderYearPage2024()
    const button = within(screen.getByTestId('abgleich-zeile-homeofficeA')).getByRole('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(label(button)).toContain('Homeoffice-Pauschale: erklärt 1.260 €, Bescheid 1.080 €, Wirkung auf die Erstattung −56 €.')
    expect(screen.queryByTestId('abgleich-detail-homeofficeA')).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const detail = text('abgleich-detail-homeofficeA')
    expect(detail).toContain('1.260 → 1.080')
    expect(detail).toContain('„Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.“')
    expect(detail).toContain('Homeoffice-Tage laufend festhalten')
    expect(detail).toContain('Erscheint 2026 in der Maske „Homeoffice“')
    expect(detail).not.toContain('Erläuterung im Bescheid')
    expect(detail).not.toContain('1.080 € statt 1.260 €')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('abgleich-detail-homeofficeA')).toBeNull()
  })

  it('opens the form view from one footer row, with every group in form order and „nicht gelesen“', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="abgleich" />)
    expect(screen.queryByTestId('abgleich-formularansicht')).toBeNull()
    expect(text('abgleich-formular')).toBe('5 weitere wie erklärt ›')
    fireEvent.click(screen.getByTestId('abgleich-formular'))
    const form = screen.getByTestId('abgleich-formularansicht')
    expect(within(form).getByText('Werbungskosten · Person A')).toBeTruthy()
    expect(within(form).getByText('Vorsorge und Sonderausgaben')).toBeTruthy()
    expect((form.textContent ?? '').replace(/ /g, ' ')).toContain('72 € · nicht gelesen')
    expect(text('abgleich-formular')).toBe('Formularansicht ausblenden')
  })

  it('explains behind a small info icon why the single effects do not add up, only when they do not', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="abgleich" />)
    expect(screen.queryByTestId('abgleich-nichtlinear')).toBeNull()
    const info = screen.getByTestId('abgleich-nichtlinear-umschalten')
    expect(label(info)).toBe('Warum die Summe abweicht')
    fireEvent.click(info)
    expect(text('abgleich-nichtlinear')).toContain('Die Summe (−93 €) weicht um 1 € von der Gesamtwirkung (−92 €) ab, weil der Tarif nicht linear ist.')
  })

  it('has no info icon when the single effects add up', () => {
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, singleEffectsSum: -92, effectsDifferFromTotal: false }} deadline={null} testID="abgleich" />)
    expect(screen.queryByTestId('abgleich-nichtlinear-umschalten')).toBeNull()
  })

  it('hides the refund line when declared equals assessed', () => {
    const groups = DIFF_2024.groups.map((g) => ({ ...g, rows: g.rows.map((r) => (r.position === 'erstattung' ? { ...r, assessed: r.declared } : r)) }))
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, groups }} deadline={null} testID="abgleich" />)
    expect(text('abgleich')).not.toContain('Erstattung 901')
  })

  it('keeps the submission and assessment dates as one small footnote inside the form view', () => {
    renderYearPage2024()
    expect(text('abgleich')).not.toContain('Eingereicht am')
    fireEvent.click(screen.getByTestId('abgleich-formular'))
    expect(text('abgleich-formularansicht')).toContain('Eingereicht am 21.09.2026 · Bescheid vom 02.11.2026')
  })
})

describe('AssessmentDiffView — the Einspruchsfrist', () => {
  it('shows a compact chip with the days left that leads into the Einspruch', () => {
    const onPrepareAppeal = vi.fn()
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={RUNNING} onPrepareAppeal={onPrepareAppeal} testID="abgleich" />)
    expect(text('abgleich-einspruch')).toBe('Einspruch · 19 Tage ›')
    expect(label(screen.getByTestId('abgleich-einspruch'))).toBe('Einspruch vorbereiten. Möglich bis 07.12.2026, noch 19 Tage.')
    fireEvent.click(screen.getByTestId('abgleich-einspruch'))
    expect(onPrepareAppeal).toHaveBeenCalledOnce()
  })

  it('only informs where there is no way into the Einspruch', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={{ ...RUNNING, remainingDays: 1 }} testID="abgleich" />)
    expect(text('abgleich-frist')).toBe('Einspruch · 1 Tag')
    expect(screen.queryByTestId('abgleich-einspruch')).toBeNull()
  })

  it('is muted and without action once the deadline has passed', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={{ endsOn: '2024-06-24', remainingDays: -877, running: false }} onPrepareAppeal={() => {}} testID="abgleich" />)
    expect(text('abgleich-frist-vorbei')).toBe('Einspruchsfrist vorbei')
    expect(label(screen.getByTestId('abgleich-frist-vorbei'))).toBe('Einspruchsfrist endete am 24.06.2024.')
    expect(screen.queryByTestId('abgleich-einspruch')).toBeNull()
  })
})

describe('AssessmentDiffView — nothing changed, titles, language', () => {
  it('says plainly when the Finanzamt changed nothing, per single return', () => {
    renderInApp(<AssessmentDiffView diff={HISTORY_DIFFS[2]!.diff} deadline={HISTORY_DIFFS[2]!.deadline} person="A" submittedOn="2023-04-02" assessmentDate="2023-06-07" testID="abgleich" />)
    expect(screen.getByRole('heading', { name: 'Erklärung ↔ Bescheid 2022 · Person A' })).toBeTruthy()
    expect(text('abgleich')).toContain('Eingereicht am 02.04.2023 · Bescheid vom 07.06.2023')
    expect(text('abgleich-gleich')).toBe('Alle 9 Positionen stimmen mit dieser Einzelerklärung überein. Das Finanzamt hat nichts geändert.')
    expect(text('abgleich-frist-vorbei')).toBe('Einspruchsfrist vorbei')
    expect(screen.queryByTestId('abgleich-wirkung')).toBeNull()
  })

  it('names only the person on the year page, which already names the year, and nothing for the joint return', () => {
    renderInApp(<AssessmentDiffView diff={HISTORY_DIFFS[2]!.diff} deadline={null} person="B" yearInTitle={false} testID="b" />)
    expect(screen.getByRole('heading', { name: 'Person B' })).toBeTruthy()
  })

  it('carries the year in the title in „Bescheid prüfen“', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="abgleich" />)
    expect(screen.getByRole('heading', { name: 'Erklärung ↔ Bescheid 2024' })).toBeTruthy()
  })

  it('is translated into English', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={RUNNING} lessons={LESSONS_2024} testID="abgleich" />, { language: 'en' })
    expect(screen.getByText('Home office allowance')).toBeTruthy()
    expect(text('abgleich-frist')).toBe('Objection · 19 days')
    expect(text('abgleich')).toContain('Refund 901 → 809 €')
    expect(text('abgleich-formular')).toBe('5 more as declared ›')
    fireEvent.click(within(screen.getByTestId('abgleich-zeile-homeofficeA')).getByRole('button'))
    expect(text('abgleich-detail-homeofficeA')).toContain('2025 again declared 210')
  })
})

describe('AssessmentDiffView — budget on a phone (the mock’s 2024)', () => {
  const setViewportWidth = (width: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
    window.dispatchEvent(new Event('resize'))
  }
  afterEach(() => setViewportWidth(0))

  it('stays at a receipt: at most ~20 words collapsed, and every message said once', () => {
    setViewportWidth(375)
    renderYearPage2024({ onPrepareAppeal: () => {} })
    const all = readable(screen.getByTestId('abgleich'))
    // The review counted 238 words for the old diff, the receipt kept it near 45; as diff lines it is 15.
    expect(wordsOf(all).length).toBeLessThanOrEqual(17)
    expect(all.match(/92 €/g)).toHaveLength(1)
    expect(all.match(/901/g)).toHaveLength(1)
    // Values, reasons and dates wait behind a tap.
    expect(all).not.toMatch(/1\.080|1\.260|180 statt|wieder|Eingereicht am/)
    expect(all).not.toMatch(/steht noch aus|Erscheint|Positionen geändert|Änderung/)
    // Two rows, the deadline, the info icon and the footer row: nothing else to tap.
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('keeps the same one line on a wide screen: the reason stays behind the tap there too', () => {
    setViewportWidth(1280)
    renderYearPage2024()
    expect(readable(screen.getByTestId('abgleich-zeile-homeofficeA')).trim()).toBe('− Homeoffice-Pauschale ⚠ 56 €')
  })
})
