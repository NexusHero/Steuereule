import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
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

describe('ThoughtBlock (#476 decision 5)', () => {
  it('shows nothing for an answer without reasoning and with only the generic status line', () => {
    mount({ steps: ['Eule prüft deine Akte & Paragraphen …'] })
    expect(screen.queryByTestId('advisor-thought')).toBeNull()
    expect(hasThought(undefined, ['x'])).toBe(false)
    expect(hasThought('   ', [])).toBe(false)
    expect(hasThought('Überlegung', [])).toBe(true)
    expect(hasThought(undefined, ['a', 'b'])).toBe(true)
  })

  it('is collapsed under a finished answer and names how many steps it holds', () => {
    mount({ reasoning: 'Erst die Pauschale prüfen.', steps: ['Prüfe Akte …', 'Simuliere …', 'Prüfe EStG-Paragraph …'] })
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Gedankengang · 3 Schritte')
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()
    expect(screen.getByTestId('advisor-thought-toggle').getAttribute('aria-expanded')).toBe('false')
  })

  it('opens to the steps, the reasoning and the note that none of it is advice', () => {
    mount({ reasoning: 'Erst die Pauschale prüfen.', steps: ['Prüfe Akte …', 'Simuliere …'] })
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getAllByTestId('advisor-thought-step').map((n) => n.textContent)).toEqual(['· Prüfe Akte …', '· Simuliere …'])
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Erst die Pauschale prüfen.')
    expect(screen.getByTestId('advisor-thought-note').textContent).toBe('Überlegungen der KI, keine Auskunft.')
    expect(screen.getByTestId('advisor-thought-toggle').getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()
  })

  it('stays open while the owl is still working and says so', () => {
    mount({ reasoning: 'Ich rechne gerade', steps: [], live: true })
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Die Eule denkt nach …')
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Ich rechne gerade')
    expect(screen.getByTestId('advisor-thought-note')).toBeTruthy()
  })

  it('shows the steps alone when the model supplies no reasoning', () => {
    mount({ steps: ['Prüfe Akte …', 'Simuliere …'] })
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getAllByTestId('advisor-thought-step')).toHaveLength(2)
    expect(screen.queryByTestId('advisor-thought-reasoning')).toBeNull()
  })

  it('counts a single step in the singular and speaks English when asked to', () => {
    mount({ reasoning: 'Thinking.', steps: ['One'] }, 'en')
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Line of thought · 1 step')
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getByTestId('advisor-thought-note').textContent).toBe('Considerations of the AI, not advice.')
  })
})
