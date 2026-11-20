// The Abgleich receipt for the cases the 2024 example does not show: a single return of one person,
// a Bescheid without any change, an effect that cannot be given, rows that open to their reasons and
// lessons, the form view for gains and unread rows, and every state of the deadline chip.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AppealDeadlineDto, AssessmentDiffDto, AssessmentLessonDto, AssessmentOwnDeviationDto } from '@steuereule/api-client'
import { renderInApp } from '../../test-render'
import { DIFF_2024, LESSONS_2024 } from '../../test-history-fixture'
import { AssessmentDiffView } from './AssessmentDiffView'

const NBSP = /[  ]/g
const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(NBSP, ' ')
const RUNNING: AppealDeadlineDto = { endsOn: '2026-12-07', remainingDays: 19, running: true }
const PAST: AppealDeadlineDto = { endsOn: '2026-01-07', remainingDays: 0, running: false }

const own = (position: string, over: Partial<AssessmentOwnDeviationDto> = {}): AssessmentOwnDeviationDto => ({
  position,
  label: position,
  role: 'own',
  person: 'A',
  declared: 1000,
  assessed: 800,
  difference: -200,
  status: 'deviation',
  explanation: null,
  shortReason: null,
  refundEffect: -60,
  ...over,
})

const diffOf = (over: Partial<AssessmentDiffDto>): AssessmentDiffDto => ({ ...DIFF_2024, ...over })

const lesson = (position: string, over: Partial<AssessmentLessonDto> = {}): AssessmentLessonDto => ({
  position,
  label: position,
  person: 'A',
  recognised: { declared: 1000, assessed: 800, difference: -200 },
  nextYear: null,
  hint: null,
  mask: null,
  ...over,
})

describe('AssessmentDiffView — a Bescheid without changes', () => {
  const same = diffOf({ ownDeviations: [], totalRefundEffect: 0, counts: { positions: 6, same: 6, deviations: 0, notRead: 0 } })

  it('says that everything is as declared, with the dates and the deadline', () => {
    renderInApp(<AssessmentDiffView diff={same} deadline={RUNNING} submittedOn="2026-09-21" assessmentDate="2026-11-02" testID="a" />)
    expect(text('a-gleich').length).toBeGreaterThan(0)
    expect(screen.getByTestId('a-frist')).toBeTruthy()
    expect(text('a')).toContain('21.09.2026')
    expect(text('a')).toContain('02.11.2026')
    expect(screen.queryByTestId('a-wirkung')).toBeNull()
  })

  it('names the single return of the person and the positions that could not be read', () => {
    renderInApp(<AssessmentDiffView diff={diffOf({ ...same, filingType: 'einzel', counts: { positions: 6, same: 5, deviations: 0, notRead: 1 } })} deadline={null} person="B" testID="a" />)
    expect(text('a')).toContain('Person B')
    expect(screen.queryByTestId('a-frist')).toBeNull()
    expect(screen.queryByTestId('a-frist-vorbei')).toBeNull()
  })

  it('shows no foot line without dates', () => {
    renderInApp(<AssessmentDiffView diff={same} deadline={null} testID="a" />)
    expect(text('a')).not.toContain('Eingereicht')
  })
})

describe('AssessmentDiffView — the head', () => {
  it('titles a person’s return with the year, or with the person alone on the year page', () => {
    const { unmount } = renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} person="A" testID="a" />)
    expect(text('a')).toContain('2024')
    expect(text('a')).toContain('Person A')
    unmount()
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} person="A" yearInTitle={false} testID="b" />)
    expect(text('b')).not.toContain('2024 ·')
    expect(text('b')).toContain('Person A')
  })

  it('shows a dash and says the effect is unknown when the Bescheid does not allow giving one', () => {
    renderInApp(<AssessmentDiffView diff={diffOf({ totalRefundEffect: null, effectsDifferFromTotal: false })} deadline={null} testID="a" />)
    expect(text('a-wirkung')).toBe('–')
    expect(screen.getByTestId('a-wirkung').getAttribute('aria-label')).toBe('nicht berechenbar')
    expect(screen.queryByTestId('a-nichtlinear-umschalten')).toBeNull()
  })

  it('explains why the single effects do not add up to the total, on request', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="a" />)
    expect(screen.queryByTestId('a-nichtlinear')).toBeNull()
    fireEvent.click(screen.getByTestId('a-nichtlinear-umschalten'))
    expect(text('a-nichtlinear')).toContain('−93 €')
    fireEvent.click(screen.getByTestId('a-nichtlinear-umschalten'))
    expect(screen.queryByTestId('a-nichtlinear')).toBeNull()
  })

  it('leaves out the refund line when it did not change or is not part of the Bescheid', () => {
    const groups = DIFF_2024.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.position !== 'erstattung') }))
    renderInApp(<AssessmentDiffView diff={diffOf({ groups })} deadline={null} testID="a" />)
    expect(text('a')).not.toContain('Erstattung 901')
    const unchanged = DIFF_2024.groups.map((g) => ({ ...g, rows: g.rows.map((r) => (r.position === 'erstattung' ? { ...r, assessed: r.declared } : r)) }))
    renderInApp(<AssessmentDiffView diff={diffOf({ groups: unchanged })} deadline={null} testID="b" />)
    expect(text('b')).not.toContain('Erstattung 901')
  })

  it('says "alle ansehen" when nothing stayed the same, and counts the unchanged rows otherwise', () => {
    renderInApp(<AssessmentDiffView diff={diffOf({ counts: { positions: 2, same: 0, deviations: 2, notRead: 0 } })} deadline={null} testID="a" />)
    expect(text('a-formular')).not.toMatch(/\d weitere/)
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="b" />)
    expect(text('b-formular')).toMatch(/5/)
  })
})

describe('AssessmentDiffView — one row', () => {
  it('shows the values and the reason of a row, the lesson with its mask, and warns that next year repeats the declaration', () => {
    const lessons: AssessmentLessonDto[] = [
      lesson('homeofficeA', { nextYear: { year: 2025, source: 'filed', declared: 1260, declaredAboveRecognised: true }, hint: 'Tage festhalten.', mask: { screen: 'commute', field: 'homeOfficeDays', label: 'Homeoffice' } }),
      lesson('arbeitsmittelA', { nextYear: { year: 2025, source: 'filed', declared: 520, declaredAboveRecognised: true } }),
    ]
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} lessons={lessons} maskYear={2026} testID="a" />)
    fireEvent.click(screen.getByLabelText(/Homeoffice-Pauschale.*zum Vorjahr|Homeoffice-Pauschale/, { selector: '[role="button"]' }))
    const detail = text('a-detail-homeofficeA')
    expect(detail).toContain('180 statt 210 Tage')
    expect(detail).toContain('2025')
    expect(detail).toContain('Homeoffice-Tage laufend festhalten')
    expect(detail).toContain('2026')
    fireEvent.click(screen.getByLabelText(/Arbeitsmittel/, { selector: '[role="button"]' }))
    expect(text('a-detail-arbeitsmittelA')).toContain('520')
  })

  it('names the mask for the next year when no open year is known, and has no lesson text without a hint', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} lessons={LESSONS_2024} maskYear={null} testID="a" />)
    fireEvent.click(screen.getByLabelText(/Homeoffice-Pauschale/, { selector: '[role="button"]' }))
    expect(text('a-detail-homeofficeA')).toContain('Homeoffice')
  })

  it('shows a row without effect, with a gain and with unknown values', () => {
    const rows = [
      own('a1', { refundEffect: null, declared: null, assessed: null, difference: null }),
      own('b1', { refundEffect: 0 }),
      own('c1', { refundEffect: 25, explanation: 'Das Finanzamt hat mehr anerkannt.', shortReason: 'mehr' }),
    ]
    renderInApp(<AssessmentDiffView diff={diffOf({ ownDeviations: rows })} deadline={null} testID="a" />)
    expect(text('a-zeile-a1')).toContain('–')
    expect(text('a-zeile-b1')).toContain('±')
    expect(text('a-zeile-c1')).toContain('+')
    fireEvent.click(screen.getByLabelText(/a1/, { selector: '[role="button"]' }))
    expect(text('a-detail-a1')).toContain('–')
    fireEvent.click(screen.getByLabelText(/c1/, { selector: '[role="button"]' }))
    expect(text('a-detail-c1')).toContain('„Das Finanzamt hat mehr anerkannt.“')
    fireEvent.click(screen.getByLabelText(/c1/, { selector: '[role="button"]' }))
    expect(screen.queryByTestId('a-detail-c1')).toBeNull()
  })

  it('sorts the rows by the size of their effect', () => {
    const rows = [own('klein', { refundEffect: 5 }), own('gross', { refundEffect: -500 })]
    renderInApp(<AssessmentDiffView diff={diffOf({ ownDeviations: rows })} deadline={null} testID="a" />)
    const order = Array.from(document.querySelectorAll('[data-testid^="a-zeile-"]')).map((el) => el.getAttribute('data-testid'))
    expect(order).toEqual(['a-zeile-gross', 'a-zeile-klein'])
  })
})

describe('AssessmentDiffView — the form view', () => {
  it('opens to every row, with the general explanations, the dates and the follow-on rows tinted by the total', () => {
    const groups = [
      {
        group: 'steuer' as const,
        rows: [
          { position: 'festgesetzteSteuer', label: 'Einkommensteuer', role: 'followOn' as const, person: null, declared: null, assessed: 12170, difference: 92, status: 'deviation' as const, explanation: null, shortReason: null },
          { position: 'sonderausgaben', label: 'Sonderausgaben', role: 'own' as const, person: null, declared: 72, assessed: null, difference: null, status: 'not_read' as const, explanation: null, shortReason: null },
          { position: 'vorsorgeaufwand', label: 'Vorsorge', role: 'own' as const, person: null, declared: 100, assessed: null, difference: null, status: 'same' as const, explanation: null, shortReason: null },
          { position: 'x', label: 'Eigene', role: 'own' as const, person: null, declared: 5, assessed: 6, difference: 1, status: 'deviation' as const, explanation: null, shortReason: null },
        ],
      },
    ]
    for (const total of [40, -40, 0]) {
      const { unmount } = renderInApp(<AssessmentDiffView diff={diffOf({ groups, totalRefundEffect: total, generalExplanations: ['Allgemeiner Hinweis.'], effectsDifferFromTotal: false })} deadline={null} submittedOn="2026-09-21" assessmentDate="2026-11-02" testID="a" />)
      fireEvent.click(screen.getByTestId('a-formular'))
      const form = text('a-formularansicht')
      expect(form).toContain('„Allgemeiner Hinweis.“')
      expect(form).toContain('21.09.2026')
      expect(form).toContain('Einkommensteuer')
      expect(form).toContain('nicht gelesen')
      unmount()
    }
  })

  it('closes again', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={null} testID="a" />)
    fireEvent.click(screen.getByTestId('a-formular'))
    expect(screen.getByTestId('a-formularansicht')).toBeTruthy()
    fireEvent.click(screen.getByTestId('a-formular'))
    expect(screen.queryByTestId('a-formularansicht')).toBeNull()
  })
})

describe('AssessmentDiffView — the deadline chip', () => {
  it('says the Einspruchsfrist is over, with its date', () => {
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={PAST} testID="a" />)
    expect(screen.getByTestId('a-frist-vorbei').getAttribute('aria-label')).toContain('07.01.2026')
  })

  it('counts the days of a running Einspruchsfrist, and says "heute" on the last day', () => {
    const { unmount } = renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={RUNNING} testID="a" />)
    expect(text('a-frist')).toContain('19')
    unmount()
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={{ ...RUNNING, remainingDays: 0 }} testID="b" />)
    expect(text('b-frist')).toContain('heute')
  })

  it('leads into the Einspruch when it can', () => {
    const onPrepareAppeal = vi.fn()
    renderInApp(<AssessmentDiffView diff={DIFF_2024} deadline={RUNNING} onPrepareAppeal={onPrepareAppeal} testID="a" />)
    fireEvent.click(screen.getByTestId('a-einspruch'))
    expect(onPrepareAppeal).toHaveBeenCalledOnce()
  })
})
