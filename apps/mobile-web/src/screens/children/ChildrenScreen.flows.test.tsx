// Kinder — flows the main test file leaves out: the connected screen (load error, save, update,
// delete, household questions, married household), failing saves that keep the user's input,
// the married form and the Swiss allowance payer.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ChildrenScreen, type ChildItem } from './ChildrenScreen'

const LINA: ChildItem = { id: 'kind-1', sequenceNumber: 1, firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2016-05-12', taxId: '12345678901', childBenefitClaimEur: '3000' }

function listBody(kinder: ChildItem[]) {
  return { kinder, count: kinder.length, childBenefitSum: 0, totalAllowance: 0, swissFamilyAllowanceSum: 0, differentialChildBenefitSum: 0 }
}

function renderView(props: Partial<Parameters<typeof ChildrenScreen>[0]> = {}) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <ChildrenScreen taxYear={2025} initialKinder={[LINA]} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

function renderConnected(props: Partial<Parameters<typeof ChildrenScreen>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <ChildrenScreen taxYear={2025} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('KinderScreen (connected)', () => {
  it('says that loading failed and loads again on retry', async () => {
    let calls = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/kinder', () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(listBody([LINA]))
      }),
    )
    renderConnected()
    expect(await screen.findByText('Das hat nicht geklappt.')).toBeTruthy()
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByText('1. Lina Muster')).toBeTruthy()
  })

  it('updates an existing child through PUT and deletes it through DELETE', async () => {
    const calls: string[] = []
    server.use(
      http.get('*/v1/steuerjahre/2025/kinder', () => HttpResponse.json(listBody([LINA]))),
      http.put('*/v1/steuerjahre/2025/kinder/:id', async ({ params, request }) => {
        calls.push(`PUT ${String(params.id)} ${((await request.json()) as { firstName: string }).firstName}`)
        return HttpResponse.json(listBody([LINA]))
      }),
      http.delete('*/v1/steuerjahre/2025/kinder/:id', ({ params }) => {
        calls.push(`DELETE ${String(params.id)}`)
        return HttpResponse.json(listBody([]))
      }),
    )
    renderConnected()
    fireEvent.click(await screen.findByLabelText('Kind Lina bearbeiten'))
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Lena' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(calls).toContain('PUT kind-1 Lena'))

    fireEvent.click(await screen.findByLabelText(/Kind .* löschen/))
    await waitFor(() => expect(calls).toContain('DELETE kind-1'))
  })

  it('goes back and on through the pending-save guard', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/kinder', () => HttpResponse.json(listBody([LINA]))))
    const onBack = vi.fn()
    const onDone = vi.fn()
    renderConnected({ onBack, onDone })
    fireEvent.click(await screen.findByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByTestId('kinder-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('opens the household questions and leaves them again', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/kinder', () => HttpResponse.json(listBody([LINA]))))
    renderConnected()
    fireEvent.click(await screen.findByText('Fragen zum Entlastungsbetrag beantworten'))
    await waitFor(() => expect(screen.queryByTestId('kinder-weiter')).toBeNull())
    fireEvent.click(await screen.findByLabelText('Zurück'))
    expect(await screen.findByTestId('kinder-weiter')).toBeTruthy()
  })

  it('names the spouse in the form of a married household and takes the own last name and Bundesland from the profile', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/kinder', () => HttpResponse.json(listBody([]))),
      http.get('*/v1/profile', () => HttpResponse.json({ lastName: 'Beispiel' })),
      http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [], familienstand: 'verheiratet', plz: '01067', wohnort: 'Dresden' })),
      http.get('*/v1/steuerjahre/2025/kopplung', () =>
        HttpResponse.json({ filingType: 'zusammen', personBUserId: 'b', invitationCode: null, personB: { firstName: ' Jana ' } }),
      ),
    )
    renderConnected()
    expect(await screen.findByText('Kindschaftsverhältnis zu Jana')).toBeTruthy()
    expect((screen.getByLabelText('Nachname') as HTMLInputElement).value).toBe('Beispiel')
    expect(screen.getByTestId('kind-familienkasse-vorschlaege').textContent).toContain('Vorschlag aus deiner Adresse')
  })
})

describe('KinderScreen — a save that fails', () => {
  it('keeps the form and the input when adding fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('offline'))
    renderView({ initialKinder: [], onAddChild: onAdd })
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Muster' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    expect((screen.getByLabelText('Vorname') as HTMLInputElement).value).toBe('Noah')
    expect(screen.queryByText('1. Noah Muster')).toBeNull()
  })

  it('keeps the child in the list when deleting fails', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('offline'))
    renderView({ onDeleteChild: onDelete })
    fireEvent.click(screen.getByLabelText('Kind Lina löschen'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('kind-1'))
    expect(screen.getByText('1. Lina Muster')).toBeTruthy()
  })

  it('does not save without first name, last name and birth date', () => {
    const onAdd = vi.fn()
    renderView({ initialKinder: [], onAddChild: onAdd })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows a locally added child when no save handler is wired, and removes it again', async () => {
    renderView({ initialKinder: [] })
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Muster' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    expect(await screen.findByText('1. Noah Muster')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Kind Noah löschen'))
    await waitFor(() => expect(screen.queryByText('1. Noah Muster')).toBeNull())
  })
})

describe('KinderScreen — married household and form details', () => {
  it('lets a married user pick the relationship to the partner and who receives the Swiss allowance', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderView({ initialKinder: [], married: true, partnerName: 'Jana', onAddChild: onAdd })
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Muster' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-b-2'))
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    fireEvent.click(screen.getByTestId('kind-zulage-von-b'))
    fireEvent.click(screen.getByTestId('kind-zulage-von-a'))
    fireEvent.click(screen.getByTestId('kind-zulage-von-a'))
    fireEvent.click(screen.getByTestId('kind-zulage-von-b'))
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-b-keins'))
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-b-3'))
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kinshipB: '3', swissFamilyAllowancePayer: 'B' })))
  })

  it('answers the residence and the single-parent facts with "Nein" and sends them', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderView({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    fireEvent.click(screen.getByTestId('kind-inland-nein'))
    fireEvent.click(screen.getByTestId('kind-gemeldet-nein'))
    fireEvent.click(screen.getByTestId('kind-kindergeld-an-mich-nein'))
    fireEvent.click(screen.getByTestId('kind-verhaeltnis-2'))
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({ domesticResidenceAllYear: false, registeredWithMeAllYear: false, childBenefitToMeAllYear: false, kinship: '2' }),
      ),
    )
  })

  it('captures a deceased other parent with the day of death and the relationship', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderView({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    fireEvent.click(screen.getByTestId('kind-ae-Verstorben'))
    fireEvent.change(screen.getByLabelText('Name des anderen Elternteils'), { target: { value: 'Muster, Max' } })
    fireEvent.change(screen.getByTestId('kind-ae-geburtsdatum'), { target: { value: '11.02.1984' } })
    fireEvent.change(screen.getByTestId('kind-ae-todestag'), { target: { value: '01.03.2020' } })
    fireEvent.change(screen.getByLabelText('Adresse des anderen Elternteils'), { target: { value: 'Hauptstr. 1' } })
    fireEvent.click(screen.getByTestId('kind-ae-art-2'))
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({ otherParent: 'Verstorben', otherParentName: 'Muster, Max', otherParentBirthDate: '1984-02-11', otherParentDiedOn: '2020-03-01', otherParentKind: '2', otherParentAddress: 'Hauptstr. 1' }),
      ),
    )
  })

  it('drops the other parent\'s data when the status is one that needs none', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderView({ onSaveChild: onSave, initialKinder: [{ ...LINA, otherParent: 'Inland', otherParentName: 'Muster, Max', otherParentKind: '1' }] })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    fireEvent.click(screen.getByTestId('kind-ae-Unbekannt'))
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('kind-1', expect.objectContaining({ otherParent: 'Unbekannt', otherParentName: null, otherParentKind: null })))
  })

  it('shows the statutory Kindergeld for a child without a stored amount, and the Swiss share without server figures', () => {
    renderView({
      initialKinder: [
        { ...LINA, id: 'a', childBenefitClaimEur: null, taxId: null },
        { id: 'b', sequenceNumber: 2, firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2016-03-14', swissFamilyAllowanceEur: '1000', childBenefitClaimEur: '3000' },
        { id: 'c', sequenceNumber: 3, firstName: 'Tim', lastName: 'Muster', geburtsdatum: '2016-03-14', swissFamilyAllowanceEur: '1000' },
      ],
    })
    expect(screen.getByText(/\(gesetzlich\)/)).toBeTruthy()
    expect(screen.getAllByText(/Differenz-Kindergeld: /).length).toBe(2)
    expect(screen.getAllByText(/Gesamtanspruch \(Anlage Kind Z\. 6\): /).length).toBe(2)
  })

  it('shows a derived Swiss allowance only as a hint and keeps the field empty', () => {
    renderView({ initialKinder: [{ ...LINA, swissFamilyAllowanceEur: '2748', swissFamilyAllowanceDerived: true, childcareEur: '700', kinshipB: '1' }] })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    const field = screen.getByLabelText('Schweizer Kinderzulage') as HTMLInputElement
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('2748 (aus dem Lohnausweis)')
  })

  it('rounds an insurance amount with cents and ignores a non-numeric one instead of sending it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderView({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    // Lina already has a Kindergeld amount, so the further details are open.
    fireEvent.change(screen.getByLabelText('Krankenversicherung des Kindes'), { target: { value: '12,5' } })
    fireEvent.change(screen.getByLabelText('Pflegeversicherung des Kindes'), { target: { value: 'viel' } })
    fireEvent.click(screen.getByTestId('kind-kv-ausland'))
    fireEvent.click(screen.getByTestId('kind-kv-ausland'))
    fireEvent.change(screen.getByTestId('kind-betreuung-von'), { target: { value: '01.01.2025' } })
    fireEvent.change(screen.getByTestId('kind-betreuung-bis'), { target: { value: 'bald' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        'kind-1',
        expect.objectContaining({ healthBasicEur: '13', careEur: null, healthInsuranceAbroad: false, childcareFrom: '01.01.2025', childcareTo: null }),
      ),
    )
  })

  it('offers to go back when a back handler is given', () => {
    const onBack = vi.fn()
    renderView({ onBack })
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalled()
  })
})
