// „Für wen?“ (ADR-0092): the card asks whose a document is, preselects the person named, offers to create
// an unknown person from the document, asks a nameless user „Bist du …?“, and offers „auch für …“.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { Button, ThemeProvider } from '@steuereule/ui'
import type { AssignmentQuestionDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { AlsoForOffers, DocumentAssignmentCard } from './DocumentAssignmentCard'

function renderUi(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider>{ui}</ThemeProvider>
    </I18nextProvider>,
  )
}

const empty = { firstName: '', lastName: '', birthDate: '', taxId: '' }
const which: AssignmentQuestionDto = {
  reason: 'which',
  options: [
    { holder: 'A', name: 'Elias' },
    { holder: 'B', name: 'Nora' },
    { holder: 'kind:lio', name: 'Lio' },
  ],
  preselected: 'B',
  printedName: 'Nora Sommer',
  area: null,
  offerCreate: [],
}

const background = (id: string) => getComputedStyle(screen.getByTestId(id)).backgroundColor

describe('DocumentAssignmentCard', () => {
  it('leads with „anlegen“, not „Für mich“, when the document names someone outside the household (ADR-0097)', () => {
    const unknown: AssignmentQuestionDto = { reason: 'unknown', options: [{ holder: 'A', name: 'Elias' }], preselected: 'A', printedName: 'Jonas Sommer', area: null, offerCreate: ['B', 'kind'] }
    renderUi(
      <>
        <Button testID="ref-primary">x</Button>
        <DocumentAssignmentCard question={unknown} printed={empty} onChoose={vi.fn()} onCreate={vi.fn()} onConfirmSelf={vi.fn()} />
      </>,
    )
    const primary = background('ref-primary')
    expect(background('beleg-zuordnung-anlegen-b')).toBe(primary)
    expect(background('beleg-zuordnung-fuer-A')).not.toBe(primary)
    expect(background('beleg-zuordnung-anlegen-kind')).not.toBe(primary)
    // The primary choice comes first, also for a screen reader and the keyboard.
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'))
    expect(buttons.indexOf('beleg-zuordnung-anlegen-b')).toBeGreaterThan(-1)
    expect(buttons.indexOf('beleg-zuordnung-anlegen-b')).toBeLessThan(buttons.indexOf('beleg-zuordnung-fuer-A'))
  })

  it('keeps the person the document names as the primary choice when everyone is in the household', () => {
    renderUi(<DocumentAssignmentCard question={which} printed={empty} onChoose={vi.fn()} onCreate={vi.fn()} onConfirmSelf={vi.fn()} />)
    expect(background('beleg-zuordnung-fuer-B')).not.toBe(background('beleg-zuordnung-fuer-A'))
    expect(background('beleg-zuordnung-fuer-A')).toBe(background('beleg-zuordnung-fuer-kind-lio'))
  })

  it('asks „Für wen?“ with one button per person and hands the choice on', () => {
    const onChoose = vi.fn()
    renderUi(<DocumentAssignmentCard question={which} printed={empty} onChoose={onChoose} onCreate={vi.fn()} onConfirmSelf={vi.fn()} />)
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toBe('Für wen ist dieser Beleg?')
    expect(screen.getByTestId('beleg-zuordnung-fuer-A').textContent).toBe('Für mich')
    expect(screen.getByTestId('beleg-zuordnung-fuer-B').textContent).toBe('Für Nora')
    fireEvent.click(screen.getByTestId('beleg-zuordnung-fuer-kind-lio'))
    expect(onChoose).toHaveBeenCalledWith('kind:lio')
  })

  it('names the contradiction with the upload area', () => {
    renderUi(
      <DocumentAssignmentCard
        question={{ ...which, reason: 'contradiction', printedName: 'Jonas Sommer', area: { holder: 'B', name: 'Nora' } }}
        printed={empty}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onConfirmSelf={vi.fn()}
      />,
    )
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toBe('Der Beleg lautet auf Jonas Sommer, du bist bei Nora – für wen?')
  })

  it('creates Person B from the document with the details it prints, after the user checked them', () => {
    const onCreate = vi.fn()
    renderUi(
      <DocumentAssignmentCard
        question={{ reason: 'unknown', options: [{ holder: 'A', name: 'Elias' }], preselected: null, printedName: 'Jonas Weber', area: null, offerCreate: ['B'] }}
        printed={{ firstName: 'Jonas', lastName: 'Weber', birthDate: '1990-02-01', taxId: '31000007919' }}
        onChoose={vi.fn()}
        onCreate={onCreate}
        onConfirmSelf={vi.fn()}
      />,
    )
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toContain('Jonas Weber')
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-b'))
    expect((screen.getByTestId('beleg-zuordnung-anlegen-vorname') as HTMLInputElement).value).toBe('Jonas')
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-speichern'))
    expect(onCreate).toHaveBeenCalledWith('B', { firstName: 'Jonas', lastName: 'Weber', birthDate: '1990-02-01', taxId: '31000007919' })
  })

  it('does not create a child without a birth date, and lets the user cancel', () => {
    const onCreate = vi.fn()
    renderUi(
      <DocumentAssignmentCard
        question={{ reason: 'unknown', options: [], preselected: null, printedName: null, area: null, offerCreate: ['kind'] }}
        printed={{ ...empty, firstName: 'Mia' }}
        onChoose={vi.fn()}
        onCreate={onCreate}
        onConfirmSelf={vi.fn()}
        error="Das Anlegen hat nicht geklappt."
      />,
    )
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toContain('noch niemanden')
    expect(screen.getByTestId('beleg-zuordnung-fehler').textContent).toContain('nicht geklappt')
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-kind'))
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-speichern'))
    expect(onCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('beleg-zuordnung-anlegen-abbrechen'))
    expect(screen.queryByTestId('beleg-zuordnung-anlegen-form')).toBeNull()
  })

  it('asks a user without a name „Bist du …?“ (N1); „Nein“ shows who else it can be', () => {
    const onConfirmSelf = vi.fn()
    const question: AssignmentQuestionDto = { reason: 'confirmSelf', options: [{ holder: 'A', name: null }], preselected: 'A', printedName: 'Nora Sommer', area: null, offerCreate: ['B'] }
    const { unmount } = renderUi(<DocumentAssignmentCard question={question} printed={empty} onChoose={vi.fn()} onCreate={vi.fn()} onConfirmSelf={onConfirmSelf} />)
    expect(screen.getByTestId('beleg-zuordnung-frage').textContent).toBe('Der Beleg lautet auf Nora Sommer. Bist du Nora Sommer?')
    fireEvent.click(screen.getByTestId('beleg-zuordnung-name-uebernehmen'))
    fireEvent.click(screen.getByTestId('beleg-zuordnung-bin-ich'))
    expect(onConfirmSelf).toHaveBeenCalledWith(false)
    unmount()
    renderUi(<DocumentAssignmentCard question={question} printed={empty} onChoose={vi.fn()} onCreate={vi.fn()} onConfirmSelf={onConfirmSelf} />)
    fireEvent.click(screen.getByTestId('beleg-zuordnung-nicht-ich'))
    expect(screen.getByTestId('beleg-zuordnung-anlegen-b')).toBeTruthy()
  })
})

describe('AlsoForOffers', () => {
  it('offers a multi-person document for the others it names', () => {
    const onTake = vi.fn()
    renderUi(<AlsoForOffers people={[{ holder: 'B', name: 'Nora' }, { holder: 'kind:lio', name: null }]} onTake={onTake} />)
    expect(screen.getByTestId('beleg-auch-fuer-B').textContent).toBe('Auch für Nora übernehmen?')
    expect(screen.getByTestId('beleg-auch-fuer-kind-lio').textContent).toBe('Auch für das Kind übernehmen?')
    fireEvent.click(screen.getByTestId('beleg-auch-fuer-B'))
    expect(onTake).toHaveBeenCalledWith('B')
  })

  it('shows nothing without others', () => {
    renderUi(<AlsoForOffers people={[]} onTake={vi.fn()} />)
    expect(screen.queryByTestId('beleg-auch-fuer')).toBeNull()
  })
})
