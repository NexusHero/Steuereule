import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { KinderScreen } from './KinderScreen'

const KINDER_FIXTURE = [
  {
    id: 'kind-1',
    lfdNr: 1,
    vorname: 'Lina',
    nachname: 'Muster',
    geburtsdatum: '2016-05-12',
    idnr: '12345678901',
    kindergeldAnspruchEur: '3000',
  },
]

function renderKinder(props: Partial<Parameters<typeof KinderScreen>[0]> = {}) {
  const i18n = createAppI18n('de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <KinderScreen taxYear={2025} initialKinder={KINDER_FIXTURE} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('KinderScreen', () => {
  it('renders existing children and calculates freibetrag and kindergeld', () => {
    renderKinder()
    expect(screen.getByText('1. Lina Muster')).toBeDefined()
    expect(screen.getByText('Geburtsdatum: 2016-05-12')).toBeDefined()
    expect(screen.getByText('Steuer-ID: 12345678901')).toBeDefined()
    expect(screen.getByText(/9\.600/)).toBeDefined() // 2025: 6.672 + 2.928
    expect(screen.getByText(/Für den Ausdruck fehlen noch Angaben/)).toBeDefined()
  })

  it('allows adding a new child', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddKind: onAdd })

    const neuBtn = screen.getByTestId('kind-neu')
    fireEvent.click(neuBtn)

    const vornameInput = screen.getByLabelText('Vorname')
    const nachnameInput = screen.getByLabelText('Nachname')
    const geburtsdatumInput = screen.getByLabelText('Geburtsdatum')

    fireEvent.change(vornameInput, { target: { value: 'Noah' } })
    fireEvent.change(nachnameInput, { target: { value: 'Muster' } })
    fireEvent.change(geburtsdatumInput, { target: { value: '2019-08-20' } })

    fireEvent.click(screen.getByTestId('kind-verhaeltnis-1'))
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-b-1'))
    fireEvent.change(screen.getByLabelText('Familienkasse'), { target: { value: 'Familienkasse Sachsen' } })
    fireEvent.click(screen.getByTestId('kind-inland-ja'))

    const saveBtn = screen.getByTestId('kind-speichern')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          vorname: 'Noah',
          nachname: 'Muster',
          geburtsdatum: '2019-08-20',
          kindschaftsverhaeltnis: '1',
          kindschaftsverhaeltnisB: '1',
          familienkasse: 'Familienkasse Sachsen',
          wohnsitzInlandGanzjaehrig: true,
        }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('2. Noah Muster')).toBeDefined()
    })
  })

  it('allows deleting a child', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onDeleteKind: onDelete })

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
    renderKinder({ onSaveKind: onSave })

    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    expect((screen.getByLabelText('Vorname') as HTMLInputElement).value).toBe('Lina')
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-1'))
    fireEvent.change(screen.getByLabelText('Familienkasse'), { target: { value: 'Familienkasse Bayern Süd' } })
    fireEvent.click(screen.getByTestId('kind-inland-ja'))
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({ kindschaftsverhaeltnis: '1', familienkasse: 'Familienkasse Bayern Süd', wohnsitzInlandGanzjaehrig: true }),
      )
    })
    await waitFor(() => expect(screen.queryByText(/Für den Ausdruck fehlen noch Angaben/)).toBeNull())
  })
})
