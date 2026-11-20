import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorThoughtStep } from '@steuereule/core'
import { renderInApp } from '../../../test-render'
import { ThoughtBlock } from './ThoughtBlock'

const tool = (name: string | undefined, extra: Partial<AdvisorThoughtStep> = {}): AdvisorThoughtStep => ({ kind: 'tool', tool: name, label: `Schritt ${name ?? 'ohne Namen'} …`, ...extra })

describe('the steps inside the line of thought', () => {
  it('draws a step for every kind of tool the owl uses, and for one it does not know', () => {
    const known = ['simulate_tax_delta', 'compute_income_tax', 'stage_field_draft', 'propose_two_paths', 'ask_clarification', 'ask_questions', 'suggest_situation', 'lookup_tax_knowledge', 'lookup_legal_source', 'plan_steps', 'remember_note', 'replace_note', 'forget_note']
    const steps = [...known.map((name) => tool(name)), tool('etwas_neues'), tool(undefined), { kind: 'status', label: 'Eule prüft …' } as AdvisorThoughtStep]
    renderInApp(<ThoughtBlock steps={steps} durationMs={2000} />)
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getAllByTestId('advisor-thought-step')).toHaveLength(steps.length)
  })

  it('writes a finished step as what was done, without the dots of a running one', () => {
    renderInApp(
      <ThoughtBlock
        steps={[tool('lookup_legal_source', { label: 'Prüfe Paragraph …', result: '§ 9 EStG', ok: true }), tool('plan_steps', { label: 'Plane ohne Punkte', result: 'fertig' })]}
        durationMs={1000}
      />,
    )
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    const steps = screen.getAllByTestId('advisor-thought-step')
    expect(steps[0]!.textContent).toBe('Prüfe Paragraph: § 9 EStG')
    expect(steps[1]!.textContent).toBe('Plane ohne Punkte: fertig')
  })

  it('shows a running step with its dots and no result', () => {
    renderInApp(<ThoughtBlock steps={[tool('lookup_legal_source', { label: 'Prüfe Paragraph …' }), tool('plan_steps', { label: 'Plane …' })]} durationMs={1000} />)
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getAllByTestId('advisor-thought-step')[0]!.textContent).toBe('Prüfe Paragraph …')
    expect(screen.queryByTestId('advisor-thought-result')).toBeNull()
  })

  it('opens a reasoning-only line of thought to the reasoning and the note, without steps', () => {
    renderInApp(<ThoughtBlock reasoning={'## Plan\nErst prüfen.'} durationMs={3000} />)
    expect(screen.getByTestId('advisor-thought-toggle').textContent).not.toContain('Schritt')
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.queryByTestId('advisor-thought-step')).toBeNull()
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toContain('Erst prüfen.')
    expect(screen.getByTestId('advisor-thought-note')).toBeDefined()
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()
  })

  it('keeps the first line of a live answer without any step as "denkt nach"', () => {
    renderInApp(<ThoughtBlock live reasoning="  " />)
    expect(screen.getByTestId('advisor-thinking')).toBeDefined()
    expect(screen.getByTestId('advisor-thinking-status').textContent).not.toBe('')
  })
})
