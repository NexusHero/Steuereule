import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Situation, SituationSuggestions } from './Situation'
import { renderInApp } from '../../../test-render'

describe('Unsere Situation (#501)', () => {
  it('shows what is stored and saves only what changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderInApp(<Situation text="Wir bauen 2027." onSave={onSave} />)
    const input = screen.getByTestId('eule-situation-input') as HTMLTextAreaElement
    expect(input.value).toBe('Wir bauen 2027.')
    expect((screen.getByTestId('eule-situation-save') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Wir bauen 2027. Elternzeit ab März.' } })
    fireEvent.click(screen.getByTestId('eule-situation-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Wir bauen 2027. Elternzeit ab März.'))
  })

  it('says so when saving failed, and keeps what was typed', async () => {
    renderInApp(<Situation text="" onSave={vi.fn().mockRejectedValue(new Error('down'))} />)
    fireEvent.change(screen.getByTestId('eule-situation-input'), { target: { value: 'Neu.' } })
    fireEvent.click(screen.getByTestId('eule-situation-save'))
    await screen.findByTestId('eule-situation-failed')
    expect((screen.getByTestId('eule-situation-input') as HTMLTextAreaElement).value).toBe('Neu.')
  })

  it('tells the user who reads it and that names are removed', () => {
    renderInApp(<Situation text="" onSave={vi.fn()} />)
    expect(screen.getByTestId('eule-situation').textContent).toContain('in jedem Gespräch mit')
    expect(screen.getByTestId('eule-situation').textContent).toContain('Namen, Adressen und Steuernummern werden beim Speichern entfernt')
  })
})

describe('suggestions for the situation (#501)', () => {
  it('stores nothing without a tap, and marks what was taken over', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined)
    renderInApp(<SituationSuggestions suggestions={['Hauskauf für 2027 geplant.', 'Elternzeit ab März.']} onAccept={onAccept} />)
    expect(onAccept).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByTestId('advisor-situation-suggestion-accept')[0]!)
    await screen.findByTestId('advisor-situation-suggestion-taken')
    expect(onAccept).toHaveBeenCalledWith('Hauskauf für 2027 geplant.')
    expect(screen.getAllByTestId('advisor-situation-suggestion-accept')).toHaveLength(1)
  })

  it('says so when it could not be stored', async () => {
    renderInApp(<SituationSuggestions suggestions={['Hauskauf für 2027 geplant.']} onAccept={vi.fn().mockRejectedValue(new Error('down'))} />)
    fireEvent.click(screen.getByTestId('advisor-situation-suggestion-accept'))
    await screen.findByTestId('advisor-situation-suggestion-failed')
  })
})
