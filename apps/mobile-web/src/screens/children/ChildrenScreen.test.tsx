import { confirmAction } from '../../test-confirm'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse } from 'msw'
import { getCockpitControllerGetCockpitSummaryQueryKey, getTaxEstimateControllerGetQueryKey } from '@steuereule/api-client'
import { CHILDCARE_PROVIDER_WIDTH_PT, fitsPrintBox } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ChildrenScreen } from './ChildrenScreen'
import { makeTestQueryClient, renderWithQuery } from '../../test-render'

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

/** Opens the new-child form and fills its mandatory fields (surname Brenner). */
function startNewChild(firstName: string, birthDate: string) {
  fireEvent.click(screen.getByTestId('kind-neu'))
  fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: firstName } })
  fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Brenner' } })
  fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: birthDate } })
}

describe('KinderScreen', () => {
  it('renders existing children and calculates freibetrag and kindergeld', () => {
    renderKinder()
    expect(screen.getByText('1. Lina Muster')).toBeDefined()
    expect(screen.getByText('Geburtsdatum: 12.05.2016')).toBeDefined()
    expect(screen.getByText('Steuer-ID: 12345678901')).toBeDefined()
    expect(screen.getByText(/9\.600/)).toBeDefined() // 2025: 6.672 + 2.928
    // The tax id is there: the hint names only what is really missing.
    expect(screen.getByTestId('kind-luecke-kind-1').textContent).toBe('Für den Ausdruck fehlen noch Angaben (Kindschaftsverhältnis, Familienkasse, Wohnsitz).')
  })

  it('names only the tax id when everything else is stored (Echtdatentest 18.11.2026)', () => {
    renderKinder({ initialKinder: [{ ...KINDER_FIXTURE[0]!, taxId: null, kinship: '1', familyBenefitsOffice: 'Familienkasse Baden-Württemberg West', domesticResidenceAllYear: true }] as never })
    expect(screen.getByTestId('kind-luecke-kind-1').textContent).toBe('Für den Ausdruck fehlen noch Angaben (Steuer-ID).')
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
      startNewChild('Noah', '02.09.2019')
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
      startNewChild('Noah', '02.09.2019')
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
    startNewChild('Noah', '02.09.2019')
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    fireEvent.change(screen.getByLabelText('Krankenversicherung des Kindes'), { target: { value: '1080' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ healthBasicEur: '1080', careEur: null })))
  })

  it("marks a child's foreign health insurance, so its premium goes into Anlage Kind Kz 89 (real case 2025, ADR-0090)", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })
    startNewChild('Mia', '02.09.2021')
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    fireEvent.change(screen.getByLabelText('Krankenversicherung des Kindes'), { target: { value: '963' } })
    fireEvent.click(screen.getByTestId('kind-kv-ausland'))
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ healthBasicEur: '963', healthInsuranceAbroad: true })))
  })

  it('saves the childcare the parents paid with provider and period (Anlage Kind Z. 67, ADR-0076)', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })
    startNewChild('Noah', '02.09.2021')
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

  it('takes only as much of the provider as fits the form line, and says so (real case 2024/2025, ADR-0090)', () => {
    renderKinder({ onAddChild: vi.fn().mockResolvedValue(undefined) })
    fireEvent.click(screen.getByTestId('kind-neu'))
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    const provider = screen.getByTestId('kind-betreuung-anbieter') as HTMLInputElement
    fireEvent.change(provider, { target: { value: 'Kita Sonnenschein, Hauptstr. 1, 79100 Freiburg' } })
    expect(provider.value).toBe('Kita Sonnenschein, Hauptstr. 1, 79100 Freiburg')
    expect(screen.queryByTestId('kind-betreuung-anbieter-voll')).toBeNull()
    // One more character than fits: the field keeps what fits, and a line says why.
    fireEvent.change(provider, { target: { value: 'Kita Sonnenschein, Hauptstr. 1, 79100 Freiburg im Breisgau' } })
    expect(provider.value.startsWith('Kita Sonnenschein, Hauptstr. 1, 79100 Freiburg')).toBe(true)
    expect(fitsPrintBox(provider.value, CHILDCARE_PROVIDER_WIDTH_PT)).toBe(true)
    expect(screen.getByTestId('kind-betreuung-anbieter-voll')).toBeTruthy()
  })

  it('cuts a pasted provider that is too long to what fits instead of leaving the field empty (Echtdatenlauf 4)', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onAddChild: onAdd })
    startNewChild('Noah', '02.09.2021')
    fireEvent.click(screen.getByTestId('kind-weitere-angaben'))
    const provider = screen.getByTestId('kind-betreuung-anbieter') as HTMLInputElement
    const pasted = 'Kindertagesstätte Sonnenschein e. V., Hauptstraße 12, 79100 Freiburg im Breisgau'
    fireEvent.change(provider, { target: { value: pasted } })

    expect(provider.value).not.toBe('')
    expect(pasted.startsWith(provider.value)).toBe(true)
    expect(fitsPrintBox(provider.value, CHILDCARE_PROVIDER_WIDTH_PT)).toBe(true)
    // Not one character more would fit.
    expect(fitsPrintBox(pasted.slice(0, provider.value.length + 1).trim(), CHILDCARE_PROVIDER_WIDTH_PT)).toBe(false)
    expect(screen.getByTestId('kind-betreuung-anbieter-voll').textContent).toContain('gekürzt')

    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ childcareProvider: provider.value.trim() })))
  })

  it('says next to the button when saving an edited child failed, and keeps the form (Echtdatenlauf 4)', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('400'))
    renderKinder({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    expect(screen.queryByTestId('kind-speichern-fehler')).toBeNull()
    // The failed save settles inside act, so React also runs the effects of that render before the next
    // click. Waiting with findBy* only sees the DOM: react-native-web hands the button its new onPress and
    // disabled state in a passive effect, and on a loaded runner the click landed before it (CI, 22.11.2026).
    await act(async () => {
      fireEvent.click(screen.getByTestId('kind-speichern'))
    })

    expect(screen.getByTestId('kind-speichern-fehler').textContent).toContain('nicht gespeichert')
    expect((screen.getByLabelText('Vorname') as HTMLInputElement).value).toBe('Lina')
    // A second try that succeeds takes the message away again.
    onSave.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByTestId('kind-speichern'))
    await waitFor(() => expect(screen.queryByTestId('kind-speichern-fehler')).toBeNull())
  })

  it('saves once when two taps land before the screen has re-rendered', async () => {
    let finishSave = () => {}
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finishSave = resolve)))
    renderKinder({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    const button = screen.getByTestId('kind-speichern')
    // Raw dispatches, not `fireEvent` (which wraps each in act and renders in between): both taps
    // reach the button inside one task, before `saving` can have re-rendered into its handler.
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => finishSave())
    expect((await screen.findByTestId('kind-gespeichert')).textContent).toBe('Lina ist gespeichert.')
  })

  it('confirms a saved edit where the form was, and says what is missing instead of doing nothing', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderKinder({ onSaveChild: onSave })
    fireEvent.click(screen.getByLabelText('Kind Lina bearbeiten'))
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    expect(screen.getByTestId('kind-speichern-fehler').textContent).toContain('Vorname')
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Lina' } })
    fireEvent.click(screen.getByTestId('kind-speichern'))
    expect((await screen.findByTestId('kind-gespeichert')).textContent).toBe('Lina ist gespeichert.')
    expect(screen.queryByLabelText('Vorname')).toBeNull()
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
    // WEB-18: nothing is deleted until the user confirms, and the dialog names the child and the year.
    expect(screen.getByTestId('rueckfrage-childDelete-body').textContent).toContain('Lina Muster')
    expect(onDelete).not.toHaveBeenCalled()
    confirmAction('childDelete')

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
    const queryClient = makeTestQueryClient()
    const summaryKey = getCockpitControllerGetCockpitSummaryQueryKey(2025)
    const estimateKey = getTaxEstimateControllerGetQueryKey(2025)
    queryClient.setQueryData(summaryKey, { status: 200, data: null, headers: new Headers() })
    queryClient.setQueryData(estimateKey, { status: 200, data: { kind: 'offen' }, headers: new Headers() })

    const onDone = vi.fn()
    renderWithQuery(<ChildrenScreen taxYear={2025} onDone={onDone} />, { client: queryClient })

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
