import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorThoughtStep } from '@steuereule/core'
import { createAppI18n } from '../../../i18n/app-i18n'
import { ThoughtBlock, hasThought, type ThoughtBlockProps } from './ThoughtBlock'

function mount(props: ThoughtBlockProps, language: 'de' | 'en' = 'de') {
  return render(
    <I18nextProvider i18n={createAppI18n(language)}>
      <ThemeProvider mode="light">
        <ThoughtBlock {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

const status = (label: string): AdvisorThoughtStep => ({ kind: 'status', label })
const LOOKUP: AdvisorThoughtStep = { kind: 'tool', tool: 'lookup_legal_source', label: 'Prüfe EStG-Paragraph …', result: '§ 4 Abs. 5 Nr. 6c EStG', ok: true }
const DRAFT_REFUSED: AdvisorThoughtStep = { kind: 'tool', tool: 'stage_field_draft', label: 'Bereite sicheren Entwurf vor …', result: 'Nicht möglich', ok: false }

describe('ThoughtBlock (#476, shaped like Claude)', () => {
  it('shows nothing for an answer without reasoning and with only the generic status line', () => {
    mount({ steps: [status('Eule prüft deine Akte & Paragraphen …')] })
    expect(screen.queryByTestId('advisor-thought')).toBeNull()
    expect(hasThought(undefined, [status('x')])).toBe(false)
    expect(hasThought('   ', [])).toBe(false)
    expect(hasThought('Überlegung', [])).toBe(true)
    expect(hasThought(undefined, [status('a'), status('b')])).toBe(true)
  })

  it('is one collapsed line under a finished answer: how long and how many steps', () => {
    mount({ reasoning: 'Erst die Pauschale prüfen.', steps: [status('Prüfe Akte …'), LOOKUP, status('Fasse zusammen …')], durationMs: 8200 })
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Nachgedacht · 8 s · 3 Schritte')
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()
    expect(screen.getByTestId('advisor-thought-toggle').getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the duration out for answers stored before it was known', () => {
    mount({ steps: [status('a'), status('b')] })
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Nachgedacht · 2 Schritte')
  })

  it('opens to each step with what its tool found, the reasoning and the note that none of it is advice', () => {
    mount({ reasoning: 'Erst die Pauschale prüfen.', steps: [status('Prüfe Akte …'), LOOKUP] })
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getAllByTestId('advisor-thought-step').map((n) => n.textContent)).toEqual(['Prüfe Akte …', 'Prüfe EStG-Paragraph: § 4 Abs. 5 Nr. 6c EStG'])
    expect(screen.getByTestId('advisor-thought-result').textContent).toBe('§ 4 Abs. 5 Nr. 6c EStG')
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Erst die Pauschale prüfen.')
    expect(screen.getByTestId('advisor-thought-note').textContent).toBe('Überlegungen der KI, keine Auskunft.')
    expect(screen.getByTestId('advisor-thought-toggle').getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()
  })

  it('names a refused tool without its reason', () => {
    mount({ steps: [status('Prüfe Akte …'), DRAFT_REFUSED] })
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getAllByTestId('advisor-thought-step')[1]!.textContent).toBe('Bereite sicheren Entwurf vor: Nicht möglich')
  })

  it('counts up while the owl works, shows the current step and can be opened then too', () => {
    mount({ reasoning: 'Ich rechne gerade', steps: [status('Prüfe Akte …'), { kind: 'tool', tool: 'compute_income_tax', label: 'Rechne die Einkommensteuer nach Tarif …' }], live: true })
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Denkt nach · 1 s')
    expect(screen.getByTestId('eule-thinking-phrase').textContent).toBe('Rechne die Einkommensteuer nach Tarif …')
    expect(screen.getByTestId('advisor-thinking-status').getAttribute('aria-live')).toBe('polite')
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()

    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    // A step still running has no result yet and keeps its "…".
    expect(screen.getAllByTestId('advisor-thought-step')[1]!.textContent).toBe('Rechne die Einkommensteuer nach Tarif …')
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Ich rechne gerade')
  })

  it('shows the live line even before the first step arrives', () => {
    mount({ steps: [], live: true })
    expect(screen.getByTestId('advisor-thinking')).toBeTruthy()
  })

  it('counts a single step in the singular and speaks English when asked to', () => {
    mount({ reasoning: 'Thinking.', steps: [status('One')], durationMs: 1000 }, 'en')
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Thought · 1 s · 1 step')
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getByTestId('advisor-thought-note').textContent).toBe('Considerations of the AI, not advice.')
  })
})
