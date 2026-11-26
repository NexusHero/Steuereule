// „Für wen?“: the person created from a document is typed in (names, birth date, Steuer-ID), and the
// buttons and the question speak of people without a name in plain words.
import { describe, expect, it, vi, type Mock } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AssignmentQuestionDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { DocumentAssignmentCard } from './DocumentAssignmentCard'

const empty = { firstName: '', lastName: '', birthDate: '', taxId: '' }

function renderCard(question: AssignmentQuestionDto, handlers: { onCreate?: Mock; onConfirmSelf?: Mock } = {}) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider>
        <DocumentAssignmentCard question={question} printed={empty} onChoose={vi.fn()} onCreate={handlers.onCreate ?? vi.fn()} onConfirmSelf={handlers.onConfirmSelf ?? vi.fn()} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('creating a person from a document', () => {
  it('enables „Anlegen“ only once every detail is typed, and hands them on', () => {
    const onCreate = vi.fn()
    renderCard({ reason: 'unknown', options: [], preselected: null, printedName: null, area: null, offerCreate: ['kind'] }, { onCreate })
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-kind'))
    const save = screen.getByTestId('beleg-zuordnung-anlegen-speichern') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getByText('Vorname, Nachname und Geburtsdatum braucht es.')).toBeTruthy()

    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-vorname'), { target: { value: 'Lio' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-nachname'), { target: { value: 'Sommer' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-geburtsdatum'), { target: { value: '03.04.2019' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-steuerid'), { target: { value: '12345678901' } })

    expect(screen.queryByText('Vorname, Nachname und Geburtsdatum braucht es.')).toBeNull()
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-speichern'))
    expect(onCreate).toHaveBeenCalledWith('kind', { firstName: 'Lio', lastName: 'Sommer', birthDate: '2019-04-03', taxId: '12345678901' })
  })

  it('does not accept a half-typed birth date', () => {
    renderCard({ reason: 'unknown', options: [], preselected: null, printedName: null, area: null, offerCreate: ['B'] })
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-b'))
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-vorname'), { target: { value: 'A' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-nachname'), { target: { value: 'B' } })
    fireEvent.change(screen.getByTestId('beleg-zuordnung-anlegen-geburtsdatum'), { target: { value: '03.04' } })
    expect((screen.getByTestId('beleg-zuordnung-anlegen-speichern') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('how the question speaks of people', () => {
  it('names people without a first name as Person B or the child, and the contradiction without a printed name', () => {
    renderCard({
      reason: 'contradiction',
      options: [
        { holder: 'A', name: null },
        { holder: 'B', name: null },
        { holder: 'kind:x', name: null },
      ],
      preselected: null,
      printedName: null,
      area: { holder: 'B', name: null },
      offerCreate: [],
    })
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toBe('Der Beleg lautet auf jemand anderen, du bist bei Person B – für wen?')
    expect(screen.getByText('Für mich')).toBeTruthy()
    expect(screen.getByText('Für Person B')).toBeTruthy()
    expect(screen.getByText('Für das Kind')).toBeTruthy()
  })

  it('names the area of a contradiction by the first name when there is one, and the child as "das Kind"', () => {
    renderCard({ reason: 'contradiction', options: [], preselected: null, printedName: 'Nora', area: { holder: 'kind:x', name: null }, offerCreate: [] })
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toContain('bei das Kind')
    expect(screen.queryByTestId('beleg-zuordnung-bin-ich')).toBeNull()
  })

  it('keeps „Namen übernehmen“ switched on by default and passes the choice on', () => {
    const onConfirmSelf = vi.fn()
    renderCard({ reason: 'confirmSelf', options: [{ holder: 'A', name: null }], preselected: 'A', printedName: 'Nora', area: null, offerCreate: [] }, { onConfirmSelf })
    fireEvent.click(screen.getByTestId('beleg-zuordnung-name-uebernehmen'))
    fireEvent.click(screen.getByTestId('beleg-zuordnung-bin-ich'))
    expect(onConfirmSelf).toHaveBeenCalledWith(false)
  })

  it('asks about a printed name that is not in the household', () => {
    renderCard({ reason: 'unknown', options: [{ holder: 'A', name: 'Elias' }], preselected: null, printedName: 'Jonas Weber', area: null, offerCreate: [] })
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toContain('Die Person gibt es in deiner Erklärung noch nicht')
  })
})
