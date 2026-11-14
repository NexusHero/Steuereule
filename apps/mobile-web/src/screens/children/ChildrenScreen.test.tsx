import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getTaxEstimateControllerGetQueryKey,
} from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ChildrenScreen } from './ChildrenScreen'

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

  describe('less typing for a further child', () => {
    const SIBLING = [
      {
        ...KINDER_FIXTURE[0]!,
        kinship: '1' as const,
        familyBenefitsOffice: 'Familienkasse Sachsen',
        domesticResidenceAllYear: true,
        otherParent: 'Inland' as const,
        otherParentName: 'Muster, Max',
        otherParentBirthDate: '1984-02-11',
        otherParentAddress: 'Hauptstraße 3, 01067 Dresden',
        otherParentKind: '1' as const,
      },
    ]

    it('copies what siblings share on one click and still asks for the child\'s own data', async () => {
      const onAdd = vi.fn().mockResolvedValue(undefined)
      renderKinder({ initialKinder: SIBLING, onAddChild: onAdd })
      fireEvent.click(screen.getByTestId('kind-neu'))
      fireEvent.click(screen.getByTestId('kind-geschwister-0'))

      expect((screen.getByLabelText('Nachname') as HTMLInputElement).value).toBe('Muster')
      expect((screen.getByLabelText('Familienkasse') as HTMLInputElement).value).toBe('Familienkasse Sachsen')
      expect((screen.getByLabelText('Adresse des anderen Elternteils') as HTMLInputElement).value).toBe('Hauptstraße 3, 01067 Dresden')
      expect((screen.getByLabelText('Vorname') as HTMLInputElement).value).toBe('')
      expect((screen.getByLabelText('Steuer-Identifikationsnummer') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('kind-geschwister').textContent).toContain('Von Lina übernommen')

      fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
      fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
      fireEvent.click(screen.getByTestId('kind-speichern'))
      await waitFor(() =>
        expect(onAdd).toHaveBeenCalledWith(
          expect.objectContaining({
            firstName: 'Noah',
            lastName: 'Muster',
            kinship: '1',
            familyBenefitsOffice: 'Familienkasse Sachsen',
            domesticResidenceAllYear: true,
            otherParent: 'Inland',
            otherParentName: 'Muster, Max',
            otherParentBirthDate: '1984-02-11',
          }),
        ),
      )
    })

    it('offers no sibling to copy from for the first child or while editing one', () => {
      const { unmount } = renderKinder({ initialKinder: [] })
      expect(screen.queryByTestId('kind-geschwister')).toBeNull()
      unmount()
      renderKinder()
      fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
      expect(screen.queryByTestId('kind-geschwister')).toBeNull()
    })

    it('suggests the user\'s own last name for a new child, marked as a suggestion, never for an existing one', () => {
      renderKinder({ suggestedLastName: 'Beispiel' })
      fireEvent.click(screen.getByTestId('kind-neu'))
      expect((screen.getByLabelText('Nachname') as HTMLInputElement).value).toBe('Beispiel')
      expect(screen.getByTestId('kind-nachname-vorschlag')).toBeTruthy()

      fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Anders' } })
      expect(screen.queryByTestId('kind-nachname-vorschlag')).toBeNull()

      fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
      expect((screen.getByLabelText('Nachname') as HTMLInputElement).value).toBe('Muster')
      expect(screen.queryByTestId('kind-nachname-vorschlag')).toBeNull()
    })
  })

  describe('Familienkasse: pick instead of type', () => {
    const office = () => (screen.getByLabelText('Familienkasse') as HTMLInputElement).value

    it('offers the Familienkassen of the user\'s Bundesland and takes one on a click', () => {
      renderKinder({ addressState: 'NW' })
      fireEvent.click(screen.getByTestId('kind-neu'))
      const box = screen.getByTestId('kind-familienkasse-vorschlaege')
      expect(box.textContent).toContain('Vorschlag aus deiner Adresse')
      expect(box.textContent).toContain('Nordrhein-Westfalen Nord')
      expect(box.textContent).not.toContain('Sachsen')
      fireEvent.click(screen.getByTestId('kind-familienkasse-vorschlag-2'))
      expect(office()).toBe('Familienkasse Nordrhein-Westfalen West')
      expect(screen.queryByTestId('kind-familienkasse-vorschlaege')).toBeNull()
    })

    it('offers every Familienkasse when the Bundesland is unknown, and narrows while typing', () => {
      renderKinder()
      fireEvent.click(screen.getByTestId('kind-neu'))
      expect(screen.getByTestId('kind-familienkasse-vorschlag-13')).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Familienkasse'), { target: { value: 'hess' } })
      expect(screen.getByTestId('kind-familienkasse-vorschlag-0').textContent).toBe('Hessen')
      expect(screen.queryByTestId('kind-familienkasse-vorschlag-1')).toBeNull()
    })

    it('still accepts a Familienkasse that is not on the list', async () => {
      const onAdd = vi.fn().mockResolvedValue(undefined)
      renderKinder({ onAddChild: onAdd, addressState: 'SN' })
      fireEvent.click(screen.getByTestId('kind-neu'))
      fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
      fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Brenner' } })
      fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
      fireEvent.change(screen.getByLabelText('Familienkasse'), { target: { value: 'Landesfamilienkasse Musterstadt' } })
      expect(screen.queryByTestId('kind-familienkasse-vorschlaege')).toBeNull()
      fireEvent.click(screen.getByTestId('kind-speichern'))
      await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ familyBenefitsOffice: 'Landesfamilienkasse Musterstadt' })))
    })
  })

  describe('short form first', () => {
    const optional = ['Kindergeld', 'Schweizer Kinderzulage', 'Krankenversicherung des Kindes', 'Pflegeversicherung des Kindes']

    it('asks a new child only for what the printout needs; the rest opens on request', () => {
      renderKinder()
      fireEvent.click(screen.getByTestId('kind-neu'))
      for (const label of ['Vorname', 'Nachname', 'Geburtsdatum', 'Steuer-Identifikationsnummer', 'Familienkasse']) {
        expect(screen.getByLabelText(label)).toBeTruthy()
      }
      expect(screen.getByTestId('kind-verhaeltnis-1')).toBeTruthy()
      expect(screen.getByTestId('kind-inland-ja')).toBeTruthy()
      for (const label of optional) expect(screen.queryByLabelText(label)).toBeNull()

      fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
      for (const label of optional) expect(screen.getByLabelText(label)).toBeTruthy()
    })

    it('shows the spouse relationship to married people right away, to others only among the further details', () => {
      const { unmount } = renderKinder({ married: true })
      fireEvent.click(screen.getByTestId('kind-neu'))
      expect(screen.getByTestId('kind-verhaeltnis-b-1')).toBeTruthy()
      unmount()

      renderKinder()
      fireEvent.click(screen.getByTestId('kind-neu'))
      expect(screen.queryByTestId('kind-verhaeltnis-b-1')).toBeNull()
      fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
      expect(screen.getByTestId('kind-verhaeltnis-b-1')).toBeTruthy()
    })

    it('pre-selects the joint child when the household turns out married after the form is open (browser retest)', () => {
      const { rerender } = renderKinder({ initialKinder: [] })
      const i18n = createAppI18n('de')
      rerender(
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <ChildrenScreen taxYear={2025} initialKinder={[]} married />
          </ThemeProvider>
        </I18nextProvider>,
      )
      const joint = (screen.getByTestId('kind-verhaeltnis-b-1') as HTMLElement).style.backgroundColor
      const none = (screen.getByTestId('kind-verhaeltnis-b-keins') as HTMLElement).style.backgroundColor
      expect(joint).not.toBe(none)
    })

    it('pre-selects a joint child for a married couple instead of „Keines“ (UX review H3)', () => {
      renderKinder({ married: true, partnerName: 'Julia' })
      fireEvent.click(screen.getByTestId('kind-neu'))
      // The Chip marks the active one by colour only on web; the joint chip must look different from „Keines“.
      const joint = (screen.getByTestId('kind-verhaeltnis-b-1') as HTMLElement).style.backgroundColor
      const none = (screen.getByTestId('kind-verhaeltnis-b-keins') as HTMLElement).style.backgroundColor
      const other = (screen.getByTestId('kind-verhaeltnis-b-2') as HTMLElement).style.backgroundColor
      expect(joint).not.toBe(none)
      expect(none).toBe(other)
      expect(screen.getByText('Kindschaftsverhältnis zu Julia')).toBeTruthy()
    })

    it('opens the further details by itself when the child already has one of them', () => {
      renderKinder()
      fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
      expect((screen.getByLabelText('Kindergeld') as HTMLInputElement).value).toBe('3000')
    })

    it('keeps a value typed into the further details when they are folded again', async () => {
      const onAdd = vi.fn().mockResolvedValue(undefined)
      renderKinder({ onAddChild: onAdd })
      fireEvent.click(screen.getByTestId('kind-neu'))
      fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
      fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Brenner' } })
      fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
      fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
      fireEvent.change(screen.getByLabelText('Kindergeld'), { target: { value: '3060' } })
      fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
      expect(screen.queryByLabelText('Kindergeld')).toBeNull()
      fireEvent.click(screen.getByTestId('kind-speichern'))
      await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ childBenefitClaimEur: '3060' })))
    })
  })

  it("saves the child's health and care insurance the parents pay (Anlage Kind Z. 27/28)", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })
    fireEvent.click(screen.getByTestId('kind-neu'))
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Brenner' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2019' } })
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    fireEvent.change(screen.getByLabelText('Krankenversicherung des Kindes'), { target: { value: '1080' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ healthBasicEur: '1080', careEur: null })))
  })

  it('saves the childcare the parents paid with provider and period (Anlage Kind Z. 67, ADR-0076)', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })
    fireEvent.click(screen.getByTestId('kind-neu'))
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Noah' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Brenner' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '02.09.2021' } })
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    fireEvent.change(screen.getByTestId('kind-betreuung'), { target: { value: '739' } })
    fireEvent.change(screen.getByTestId('kind-betreuung-anbieter'), { target: { value: 'Kindergarten, Gemeinde Musterdorf' } })
    fireEvent.change(screen.getByTestId('kind-betreuung-von'), { target: { value: '01.01.2025' } })
    fireEvent.change(screen.getByTestId('kind-betreuung-bis'), { target: { value: '31.12' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ childcareEur: '739', childcareProvider: 'Kindergarten, Gemeinde Musterdorf', childcareFrom: '01.01.2025', childcareTo: null }),
      ),
    )
  })

  it('allows adding a new child', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd, married: true })

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

  it('fills the other parent\'s address from one picked suggestion (ADR-0065)', async () => {
    server.use(
      http.post('*/v1/adressen/suche', () =>
        HttpResponse.json({ available: true, houseNumber: '3', hits: [{ street: 'Hauptstraße', postalCode: '01067', city: 'Dresden', state: 'SN' }] }),
      ),
    )
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    expect(screen.queryByTestId('kind-ae-adresssuche')).toBeNull()
    fireEvent.click(screen.getByTestId('kind-ae-Inland'))
    fireEvent.change(screen.getByTestId('kind-ae-adresssuche'), { target: { value: 'Hauptstr 3 Dresden' } })
    fireEvent.click(await screen.findByTestId('kind-ae-adresssuche-treffer-0'))
    expect((screen.getByLabelText('Adresse des anderen Elternteils') as HTMLInputElement).value).toBe('Hauptstraße 3, 01067 Dresden')
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('kind-1', expect.objectContaining({ otherParentAddress: 'Hauptstraße 3, 01067 Dresden' })))
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

  it('invalidates children, cockpitSummary, and taxEstimate on save and awaits in-flight save before onDone', async () => {
    let childrenGetCount = 0
    let releasePost: () => void = () => {}
    const postPending = new Promise<void>((resolve) => {
      releasePost = resolve
    })
    server.use(
      http.get('*/v1/steuerjahre/2025/kinder', () => {
        childrenGetCount += 1
        return HttpResponse.json({
          kinder: childrenGetCount > 1 ? KINDER_FIXTURE : [],
          count: childrenGetCount > 1 ? 1 : 0,
          childBenefitSum: childrenGetCount > 1 ? 3000 : 0,
          totalAllowance: childrenGetCount > 1 ? 9600 : 0,
          swissFamilyAllowanceSum: 0,
          differentialChildBenefitSum: 0,
        })
      }),
      http.post('*/v1/steuerjahre/2025/kinder', async () => {
        await postPending
        return HttpResponse.json(
          {
            kinder: KINDER_FIXTURE,
            count: 1,
            childBenefitSum: 3000,
            totalAllowance: 9600,
            swissFamilyAllowanceSum: 0,
            differentialChildBenefitSum: 0,
          },
          { status: 201 },
        )
      }),
    )
    const i18n = createAppI18n('de')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const summaryKey = getCockpitControllerGetCockpitSummaryQueryKey(2025)
    const estimateKey = getTaxEstimateControllerGetQueryKey(2025)
    queryClient.setQueryData(summaryKey, { status: 200, data: null, headers: new Headers() })
    queryClient.setQueryData(estimateKey, { status: 200, data: { kind: 'offen' }, headers: new Headers() })

    const onDone = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <ChildrenScreen taxYear={2025} onDone={onDone} />
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Vorname'), { target: { value: 'Lina' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Muster' } })
    fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: '12.05.2016' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    fireEvent.click(screen.getByTestId('kinder-weiter'))

    await new Promise((r) => setTimeout(r, 20))
    expect(onDone).not.toHaveBeenCalled()

    releasePost()
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(childrenGetCount).toBeGreaterThanOrEqual(2)
    expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(estimateKey)?.isInvalidated).toBe(true)
  })
})
