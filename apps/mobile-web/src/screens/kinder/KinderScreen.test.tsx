import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { ChildrenScreen } from './KinderScreen'

const KINDER_FIXTURE = [
  {
    id: 'kind-1',
    sequenceNumber: 1,
    firstName: 'Lina',
    lastName: 'Muster',
    geburtsdatum: '2016-05-12',
    taxId: '12345678901',
    childBenefitClaimEur: '3000',
  },
]

function renderKinder(props: Partial<Parameters<typeof ChildrenScreen>[0]> = {}) {
  const i18n = createAppI18n('de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <ChildrenScreen taxYear={2025} initialKinder={KINDER_FIXTURE} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('KinderScreen', () => {
  it('renders existing children and calculates freibetrag and kindergeld', () => {
    renderKinder()
    expect(screen.getByText('1. Lina Muster')).toBeDefined()
    expect(screen.getByText('Geburtsdatum: 12.05.2016')).toBeDefined()
    expect(screen.getByText('Steuer-ID: 12345678901')).toBeDefined()
    expect(screen.getByText(/9\.600/)).toBeDefined() // 2025: 6.672 + 2.928
    expect(screen.getByText(/Für den Ausdruck fehlen noch Angaben/)).toBeDefined()
  })

  it('hides the single-parent relief from married people, who cannot claim it', () => {
    renderKinder({ married: true, onSingleParentQuestions: () => {} })
    fireEvent.click(screen.getByTestId('kind-neu'))
    expect(screen.queryByText('Entlastungsbetrag für Alleinerziehende')).toBeNull()
    expect(screen.queryByText('Fragen zum Entlastungsbetrag beantworten')).toBeNull()
  })

  it('offers the single-parent relief to people who are not married', () => {
    renderKinder({ onSingleParentQuestions: () => {} })
    fireEvent.click(screen.getByTestId('kind-neu'))
    expect(screen.getByText('Entlastungsbetrag für Alleinerziehende')).toBeTruthy()
  })

  it("saves the child's health and care insurance the parents pay (Anlage Kind Z. 27/28)", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })
    fireEvent.click(screen.getByTestId('kind-neu'))
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Brenner' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
    fireEvent.change(screen.getByLabelText('Krankenversicherung des Kindes'), { target: { value: '1080' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ healthBasicEur: '1080', careEur: null })))
  })

  it('allows adding a new child', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })

    const newBtn = screen.getByTestId('kind-neu')
    fireEvent.click(newBtn)

    const firstNameInput = screen.getByLabelText('Vorname')
    const lastNameInput = screen.getByLabelText('Nachname')
    const birthDateInput = screen.getByLabelText('Geburtsdatum')

    fireEvent.change(firstNameInput, { target: { value: 'Noah' } })
    fireEvent.change(lastNameInput, { target: { value: 'Muster' } })
    fireEvent.change(birthDateInput, { target: { value: '20.8.2019' } })

    fireEvent.click(screen.getByTestId('kind-verhaeltnis-1'))
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-b-1'))
    fireEvent.change(screen.getByLabelText('Familienkasse'), { target: { value: 'Familienkasse Sachsen' } })
    fireEvent.click(screen.getByTestId('kind-inland-ja'))

    const saveBtn = screen.getByTestId('kind-speichern')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Noah',
          lastName: 'Muster',
          geburtsdatum: '2019-08-20',
          kinship: '1',
          kinshipB: '1',
          familyBenefitsOffice: 'Familienkasse Sachsen',
          domesticResidenceAllYear: true,
        }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('2. Noah Muster')).toBeDefined()
    })
  })

  it('allows deleting a child', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onDeleteChild: onDelete })

    const deleteBtn = screen.getByLabelText('Kind Lina löschen')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('kind-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('1. Lina Muster')).toBeNull()
    })
  })

  it('completes an existing child for the printout via Bearbeiten', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onSaveChild: onSave })

    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    expect((screen.getByLabelText('Vorname') as HTMLInputElement).value).toBe('Lina')
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-1'))
    fireEvent.change(screen.getByLabelText('Familienkasse'), { target: { value: 'Familienkasse Bayern Süd' } })
    fireEvent.click(screen.getByTestId('kind-inland-ja'))
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({ kinship: '1', familyBenefitsOffice: 'Familienkasse Bayern Süd', domesticResidenceAllYear: true }),
      )
    })
    await waitFor(() => expect(screen.queryByText(/Für den Ausdruck fehlen noch Angaben/)).toBeNull())
  })

  it('captures the other parent for single parents (Anlage Kind Zeilen 11–15)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onSaveChild: onSave })

    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    expect(screen.queryByLabelText('Name des anderen Elternteils')).toBeNull()
    fireEvent.click(screen.getByTestId('kind-ae-Inland'))
    fireEvent.change(screen.getByLabelText('Name des anderen Elternteils'), { target: { value: 'Muster, Max' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum des anderen Elternteils'), { target: { value: '11.02.1984' } })
    fireEvent.change(screen.getByLabelText('Adresse des anderen Elternteils'), { target: { value: 'Hauptstraße 3, 01067 Dresden' } })
    fireEvent.click(screen.getByTestId('kind-ae-art-1'))
    expect(screen.queryByLabelText('Todestag des anderen Elternteils')).toBeNull()
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({
          otherParent: 'Inland',
          otherParentName: 'Muster, Max',
          otherParentBirthDate: '1984-02-11',
          otherParentAddress: 'Hauptstraße 3, 01067 Dresden',
          otherParentKind: '1',
          otherParentDiedOn: null,
        }),
      )
    })
  })

  it('asks the per-child Entlastungsbetrag facts and leads to the household questions', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onSingleParentQuestions = vi.fn()
    renderKinder({ onSaveChild: onSave, onSingleParentQuestions })

    fireEvent.click(screen.getByText('Fragen zum Entlastungsbetrag beantworten'))
    expect(onSingleParentQuestions).toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    fireEvent.click(screen.getByTestId('kind-gemeldet-ja'))
    fireEvent.click(screen.getByTestId('kind-kindergeld-an-mich-ja'))
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({ registeredWithMeAllYear: true, childBenefitToMeAllYear: true }),
      )
    })
  })

  it('displays Swiss family allowance and Differenzkindergeld and allows editing it (ADR-0054, #414)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const KINDER_CH: any[] = [
      {
        id: 'kind-ch-1',
        sequenceNumber: 1,
        firstName: 'Mia',
        lastName: 'Brenner',
        geburtsdatum: '2016-03-14',
        taxId: '41234567890',
        swissFamilyAllowanceEur: '2748',
        differentialChildBenefitEur: '312',
        totalClaimEur: '3060',
      },
    ]
    renderKinder({ initialKinder: KINDER_CH, onSaveChild: onSave })

    expect(screen.getByText('1. Mia Brenner')).toBeDefined()
    expect(screen.getByText(/Schweizer Kinderzulage: 2\.748/)).toBeDefined()
    expect(screen.getByText(/Differenz-Kindergeld: 312/)).toBeDefined()
    expect(screen.getByText(/Gesamtanspruch \(Anlage Kind Z\. 6\): 3\.060/)).toBeDefined()
    expect(screen.getByText(/davon Schweizer Kinderzulage:/)).toBeDefined()
    expect(screen.getByText(/davon Differenz-Kindergeld \(DE\):/)).toBeDefined()

    fireEvent.click(screen.getByLabelText('Kind Mia bearbeiten'))
    expect((screen.getByLabelText('Schweizer Kinderzulage') as HTMLInputElement).value).toBe('2748')
    fireEvent.change(screen.getByLabelText('Schweizer Kinderzulage'), { target: { value: '2800' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('kind-ch-1', expect.objectContaining({ swissFamilyAllowanceEur: '2800' }))
    })
  })
})
