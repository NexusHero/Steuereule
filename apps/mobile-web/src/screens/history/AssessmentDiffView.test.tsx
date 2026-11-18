// ADR-0098 §8 — the Bescheid-Abgleich as the Verlauf and „Bescheid prüfen“ show it: only what the
// Finanzamt changed, largest effect first and coloured by what it means for the user; the follow-on
// chain as one line; the form view collapsed; the Einspruchsfrist with the way into the Einspruch,
// only the date once it passed; and the lessons for next time without an amount for a pending Bescheid.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderInApp } from '../../test-render'
import { DIFF_2024, HISTORY_DIFFS, LESSONS_2024 } from '../../test-history-fixture'
import { AssessmentDiffView } from './AssessmentDiffView'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')

describe('AssessmentDiffView', () => {
  it('lists only the own deviations, largest effect on the refund first, declared struck → assessed', () => {
    renderInApp(<AssessmentDiffView diff={{ ...DIFF_2024, ownDeviations: [DIFF_2024.ownDeviations[1]!, DIFF_2024.ownDeviations[0]!] }} deadline={HISTORY_DIFFS[0]!.deadline} testID="abgleich" />)
    expect(text('abgleich-anzahl')).toBe('2 Änderungen')
    // The refund chip names declared and assessed; the cut itself stays in the rows and the chain.
    expect(text('abgleich')).toContain('Erstattung 901 € → 809 €')
    expect(text('abgleich')).not.toContain('(−92 €)')
    const rows = screen.getAllByTestId(/^abgleich-zeile-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['abgleich-zeile-homeofficeA', 'abgleich-zeile-arbeitsmittelA'])
    expect(text('abgleich-zeile-homeofficeA')).toContain('1.260 → 1.080 €')
    expect(text('abgleich-zeile-homeofficeA')).toContain('−56 €')
    expect(within(screen.getByTestId('abgleich-zeile-homeofficeA')).getByLabelText('Wirkung auf die Erstattung: −56 €')).toBeTruthy()
    // The Finanzamt's explanation as a quote under its row.
    expect(text('abgleich-zeile-homeofficeA')).toContain('„Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.“')
  })

  it('folds the follow-on changes into one chain and says behind a small toggle when the single effects do not add up', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="abgleich" />)
    expect(text('abgleich-kette')).toBe('daraus folgt  Summe Werbungskosten A −300 € → Zu versteuerndes Einkommen +300 € → Einkommensteuer +92 € → Erstattung −92 €')
    expect(screen.queryByTestId('abgleich-nichtlinear')).toBeNull()
    expect(text('abgleich-nichtlinear-umschalten')).toBe('ⓘ Warum die Summe abweicht')
    fireEvent.click(screen.getByTestId('abgleich-nichtlinear-umschalten'))
    expect(text('abgleich-nichtlinear')).toContain('Die Summe (−93 €) weicht um 1 € von der Gesamtwirkung (−92 €) ab, weil der Tarif nicht linear ist.')
  })

  it('keeps the form view collapsed until asked, then shows every group in form order with „nicht gelesen“', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="abgleich" />)
    expect(screen.queryByTestId('abgleich-formularansicht')).toBeNull()
    expect(text('abgleich-formular')).toBe('▸ Alle 11 Positionen in Formularreihenfolge (5 wie erklärt)')
    fireEvent.click(screen.getByTestId('abgleich-formular'))
    const form = screen.getByTestId('abgleich-formularansicht')
    expect(within(form).getByText('Werbungskosten · Person A')).toBeTruthy()
    expect(within(form).getByText('Vorsorge und Sonderausgaben')).toBeTruthy()
    expect((form.textContent ?? '').replace(/ /g, ' ')).toContain('72 € · nicht gelesen')
    expect(text('abgleich-formular')).toBe('▾ Formularansicht ausblenden')
  })

  it('shows the running Einspruchsfrist with its days and „Einspruch vorbereiten“', () => {
    const onPrepareAppeal = vi.fn()
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={{ endsOn: '2026-12-07', remainingDays: 19, running: true }} onPrepareAppeal={onPrepareAppeal} testID="abgleich" />)
    expect(text('abgleich-frist')).toContain('Einspruch möglich bis 07.12.2026 · noch 19 Tage (§ 355 AO)')
    fireEvent.click(screen.getByTestId('abgleich-einspruch'))
    expect(onPrepareAppeal).toHaveBeenCalledOnce()
  })

  it('names only the date once the Einspruchsfrist has passed', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={{ endsOn: '2024-06-24', remainingDays: -877, running: false }} onPrepareAppeal={() => {}} testID="abgleich" />)
    expect(text('abgleich-frist-vorbei')).toBe('Einspruchsfrist endete am 24.06.2024.')
    expect(screen.queryByTestId('abgleich-einspruch')).toBeNull()
  })

  it('gives each deviation its lesson: recognised, declared again next year, the hint, and where it shows', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} lessons={LESSONS_2024} maskYear={2026} testID="abgleich" />)
    const lessons = text('abgleich-lehren')
    expect(lessons).toContain('Fürs nächste Mal')
    expect(lessons).toContain('Homeoffice-Pauschale: 1.080 € statt 1.260 € anerkannt')
    expect(lessons).toContain('2025 wurden wieder 1.260 € erklärt. Das ist mehr, als 2024 anerkannt wurde. Der Bescheid 2025 steht noch aus.')
    expect(lessons).toContain('Homeoffice-Tage laufend festhalten')
    expect(lessons).toContain('Erscheint 2026 in der Maske „Homeoffice“')
  })

  it('says plainly when the Finanzamt changed nothing, per single return', () => {
    renderInApp(<AssessmentDiffView diff={HISTORY_DIFFS[2]!.diff} deadline={HISTORY_DIFFS[2]!.deadline} person="A" submittedOn="2023-04-02" assessmentDate="2023-06-07" onClose={() => {}} testID="abgleich" />)
    expect(screen.getByText('Erklärung ↔ Bescheid 2022 · Person A')).toBeTruthy()
    expect(screen.getByText('Erklärung eingereicht am 02.04.2023 · Bescheid vom 07.06.2023')).toBeTruthy()
    expect(text('abgleich-gleich')).toBe('Alle 9 Positionen stimmen mit dieser Einzelerklärung überein. Das Finanzamt hat nichts geändert.')
    expect(screen.queryByTestId('abgleich-anzahl')).toBeNull()
    expect(screen.getByTestId('abgleich-schliessen')).toBeTruthy()
  })

  it('is translated into English', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="abgleich" />, { language: 'en' })
    expect(text('abgleich-anzahl')).toBe('2 changes')
    expect(screen.getByText('Home office allowance')).toBeTruthy()
  })
})
