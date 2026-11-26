import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Screen } from '@steuereule/core'
import { server } from '../../../test/test-msw-server'
import { writeExpertMode } from '../../lib/expertModePreference'
import { GlassFormPreview } from './GlassFormPreview'
import type { AcroFormPdfLoader } from './AcroFormLiveViewer'
import { renderWithQuery } from '../../../test/test-render'

function renderPreview(
  props: {
    defaultOpen?: boolean
    defaultMode?: 'zeilen' | 'acroform'
    initialAcroForm?: string
    acroFormLoader?: AcroFormPdfLoader
    onInspectField?: (screen: Screen, field?: string, person?: 'A' | 'B') => void
  } = {},
) {
  renderWithQuery(
    <GlassFormPreview
      year={2025}
      defaultOpen={props.defaultOpen ?? false}
      defaultMode={props.defaultMode}
      initialAcroForm={props.initialAcroForm}
      acroFormLoader={props.acroFormLoader}
      onInspectField={props.onInspectField}
    />,
  )
}

afterEach(() => {
  server.resetHandlers()
  writeExpertMode(false)
})

describe('GlassFormPreview („Glas-Erklärung“)', () => {
  it('starts collapsed by default and opens on click to show official forms, lines, provenance and jump links', async () => {
    server.use(
      http.get('*/v1/stammdaten', () =>
        HttpResponse.json({
          geburtsdatum: '1990-05-12',
          strasse: 'Rheinweg',
          hausnummer: '4',
          hausnummerZusatz: null,
          plz: '79539',
          wohnort: 'Lörrach',
          beruf: 'Ingenieurin',
          religion: 'VD',
          familienstand: 'verheiratet',
          familienstandSeit: '2020-06-01',
          iban: 'DE89370400440532013000',
          kontoinhaber: 'Lena Brenner',
          finanzamt: 'Lörrach',
          telefon: null,
          missing: [],
        }),
      ),
      http.get('*/v1/steuerjahre/2025/kopplung', () =>
        HttpResponse.json({
          filingType: 'zusammen',
          personBUserId: null,
          invitationCode: 'CODE123',
          personB: {
            firstName: 'Markus',
            lastName: 'Brenner',
            steuerId: '12345678911',
            geburtsdatum: '1988-03-01',
            beruf: 'Grenzgänger',
            religion: 'VD',
          },
        }),
      ),
      http.get('*/v1/steuerjahre/2025/lstb', () =>
        HttpResponse.json({
          bruttoarbeitslohn: { kind: 'erfasst', value: 58000 },
          lohnsteuer: { kind: 'erfasst', value: 9400 },
          sozialversicherung: { kind: 'erfasst', value: 11200 },
          state: { kind: 'vollstaendig', bruttoarbeitslohn: 58000, lohnsteuer: 9400, sozialversicherung: 11200 },
        }),
      ),
      http.get('*/v1/steuerjahre/2025/arbeitsweg', () =>
        HttpResponse.json({
          inputs: {
            workdays: [1, 2, 3, 4, 5],
            vacationDays: 25,
            sickDays: 5,
            homeOfficeDays: 80,
            oneWayKm: 20,
            transport: 'pkw',
            workplace: 'Basel',
            publicHolidays: 10,
            publicHolidayRegion: 'BW',
            workEquipmentEur: 420,
          },
          workdays: { weekdays: 250, workdays: 210, commuteDays: 130 },
          commuterAllowance: 780,
        }),
      ),
      http.get('*/v1/steuerjahre/2025/interview', () =>
        HttpResponse.json({
          answers: {
            spenden: 'Ja',
            'spenden-betrag': '350',
            'haushalt-gate': 'Ja',
            'haushalt-handwerker-betrag': '1200',
          },
          nextStep: { kind: 'done' },
          openItems: 0,
        }),
      ),
      http.get('*/v1/steuerjahre/2025/bestaetigung', () =>
        HttpResponse.json({
          annexes: [
            {
              annex: 'anlageN',
              unconfirmed: 0,
              values: [
                {
                  key: 'commute.homeOfficeDays',
                  screen: 'commute',
                  instance: null,
                  field: 'homeOfficeDays',
                  value: '80',
                  provenance: { kind: 'assistent', name: 'SteuerEule' },
                  confirmed: true,
                  proposal: null,
                },
              ],
            },
          ],
        }),
      ),
    )

    const onInspectField = vi.fn()
    renderPreview({ onInspectField })

    expect(screen.getByTestId('glass-form-preview-collapsed')).toBeTruthy()
    fireEvent.click(screen.getByTestId('glass-form-preview-toggle'))

    expect(await screen.findByTestId('glass-form-preview')).toBeTruthy()
    expect(await screen.findByTestId('glass-section-est1a')).toBeTruthy()
    expect(await screen.findByTestId('glass-section-anlageN')).toBeTruthy()
    expect(await screen.findByTestId('glass-section-vorsorgeSonderausgaben')).toBeTruthy()
    expect(await screen.findByTestId('glass-section-haushaltAgb')).toBeTruthy()

    // Homeoffice row shows exact line, amount (80 * 6 = 480 €), and Owl provenance
    const hoRow = screen.getByTestId('glass-row-anlageN-ho-a')
    expect(hoRow.textContent).toContain('Zeile 45 (Kz 335)')
    expect(hoRow.textContent).toMatch(/480\s*€/)
    expect(hoRow.textContent).toContain('🦉')

    // Clicking the row jumps directly to the commute mask & homeOfficeDays field
    fireEvent.click(hoRow)
    expect(onInspectField).toHaveBeenCalledWith('commute', 'homeOfficeDays', 'A')

    // Filter chips filter sections
    fireEvent.click(screen.getByTestId('glass-filter-anlageN'))
    expect(screen.getByTestId('glass-section-anlageN')).toBeTruthy()
    expect(screen.queryByTestId('glass-section-est1a')).toBeNull()
  })

  describe('HD Vordruck mode and expert direct input', () => {
    type Annotation = { fieldName: string; rect: [number, number, number, number]; textAlignment: number }
    type Copy = { person: 'A' | 'B' | null; entityId: string | null; values: Record<string, string | true> }
    const box = (fieldName: string, y: number): Annotation => ({ fieldName, rect: [233.9, y, 350.4, y + 15.8], textAlignment: 2 })
    const N_FIELDS = [box('anlN.kz110', 575), box('anlN.kz380', 400)]

    const fakeLoader = (annotations: Annotation[]): AcroFormPdfLoader => ({
      loadTemplate: vi.fn().mockResolvedValue({
        numPages: 4,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 595, height: 842, convertToViewportRectangle: (r: readonly [number, number, number, number]) => r }),
          render: () => ({ promise: Promise.resolve() }),
          getAnnotations: async () => annotations,
        }),
      }),
    })

    /** Serves `ausdruck/werte` from a mutable state, so a save shows up after the refetch like on the API. */
    function serveLiveValues(forms: Record<string, Copy[]>) {
      server.use(
        http.get('*/v1/steuerjahre/2025/ausdruck/werte', () =>
          HttpResponse.json({ forms: Object.entries(forms).map(([formular, instances]) => ({ formular, instances })) }),
        ),
      )
      return forms
    }

    /** The LStB of one person: a PUT is recorded and, unless refused, printed into Kz 110 of that copy. */
    function serveLstbPut(forms: Record<string, Copy[]>, options: { putStatus?: number } = {}) {
      const puts: { person: string | null; body: unknown }[] = []
      server.use(
        http.put('*/v1/steuerjahre/2025/lstb/bruttoarbeitslohn', async ({ request }) => {
          const person = new URL(request.url).searchParams.get('person')
          const body = (await request.json()) as { kind: string; value?: number }
          puts.push({ person, body })
          if (options.putStatus) return HttpResponse.json({ message: 'refused' }, { status: options.putStatus })
          const target = forms['anlage-n']?.find((c) => c.person === (person ?? 'A'))
          if (target) {
            if (body.kind === 'erfasst') target.values['anlN.kz110'] = String(body.value)
            else delete target.values['anlN.kz110']
          }
          return HttpResponse.json({ bruttoarbeitslohn: body, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' }, state: { kind: 'unvollstaendig' } })
        }),
      )
      return puts
    }

    const singleN = () => ({ 'anlage-n': [{ person: 'A' as const, entityId: null, values: { 'anlN.personA': true as const, 'anlN.kz110': '64000', 'anlN.kz380': '310' } }] })

    function open(form: string, annotations: Annotation[], onInspectField = vi.fn()) {
      renderPreview({ defaultOpen: true, defaultMode: 'acroform', initialAcroForm: form, acroFormLoader: fakeLoader(annotations), onInspectField })
      return onInspectField
    }

    async function edit(label: RegExp, inputLabel: RegExp, value: string) {
      fireEvent.click(await screen.findByLabelText(label))
      fireEvent.change(await screen.findByLabelText(inputLabel), { target: { value } })
      fireEvent.click(screen.getByText('✓ Direkt speichern'))
    }
    const editKz110 = (value: string) => edit(/Anlage N · Zeile 6 \(Kz 110 Bruttoarbeitslohn\): 64000/, /Direkteingabe Anlage N · Zeile 6/, value)

    it('without expert mode a click jumps to the input mask and offers no direct input', async () => {
      serveLiveValues(singleN())
      const onInspectField = open('anlage-n', N_FIELDS)

      fireEvent.click(await screen.findByLabelText(/Anlage N · Zeile 6 \(Kz 110 Bruttoarbeitslohn\): 64000/))

      expect(onInspectField).toHaveBeenCalledWith('lstb', 'bruttoarbeitslohn', 'A')
      expect(await screen.findByText(/Aktives AcroForm-Feld: anlN\.kz110/)).toBeTruthy()
      expect(screen.queryByLabelText(/Direkteingabe/)).toBeNull()
    })

    it('in expert mode saves a 1:1 field in place, without leaving the form', async () => {
      writeExpertMode(true)
      const forms = serveLiveValues(singleN())
      const puts = serveLstbPut(forms)
      const onInspectField = open('anlage-n', N_FIELDS)

      await editKz110('68.500')

      expect(await screen.findByText('Gespeichert.')).toBeTruthy()
      expect(puts).toEqual([{ person: null, body: { kind: 'erfasst', value: 68500 } }])
      expect(onInspectField).not.toHaveBeenCalled()
      expect(await screen.findByText(/Eingetragener Wert: 68500/)).toBeTruthy()
    })

    it("writes Person B's Anlage N to B's certificate", async () => {
      writeExpertMode(true)
      const forms = serveLiveValues({
        'anlage-n': [
          { person: 'A', entityId: null, values: { 'anlN.personA': true, 'anlN.kz110': '64000' } },
          { person: 'B', entityId: null, values: { 'anlN.personB': true, 'anlN.kz110': '51000' } },
        ],
      })
      const puts = serveLstbPut(forms)
      open('anlage-n', N_FIELDS)

      fireEvent.click(await screen.findByText('Person B'))
      await edit(/Kz 110 Bruttoarbeitslohn\): 51000/, /Direkteingabe Anlage N · Zeile 6/, '52000')

      expect(await screen.findByText('Gespeichert.')).toBeTruthy()
      expect(puts).toEqual([{ person: 'B', body: { kind: 'erfasst', value: 52000 } }])
    })

    it('shows a refusal of the server and keeps the stored value', async () => {
      writeExpertMode(true)
      const forms = serveLiveValues(singleN())
      serveLstbPut(forms, { putStatus: 400 })
      open('anlage-n', N_FIELDS)

      await editKz110('68500')

      expect(await screen.findByText(/Konnte nicht gespeichert werden/)).toBeTruthy()
      expect(screen.getByText(/Eingetragener Wert: 64000/)).toBeTruthy()
    })

    it('rejects an ambiguous amount without calling the server', async () => {
      writeExpertMode(true)
      const forms = serveLiveValues(singleN())
      const puts = serveLstbPut(forms)
      open('anlage-n', N_FIELDS)

      await editKz110('68,5')

      expect(await screen.findByText(/Bitte einen ganzen Betrag eingeben/)).toBeTruthy()
      expect(puts).toEqual([])
    })

    it('clearing the field sets it back to open', async () => {
      writeExpertMode(true)
      const forms = serveLiveValues(singleN())
      const puts = serveLstbPut(forms)
      open('anlage-n', N_FIELDS)

      await editKz110('')

      expect(await screen.findByText(/Wert entfernt/)).toBeTruthy()
      expect(puts).toEqual([{ person: null, body: { kind: 'offen' } }])
    })

    it('shows in expert mode which fields can be changed here and which are computed', async () => {
      writeExpertMode(true)
      serveLiveValues(singleN())
      open('anlage-n', N_FIELDS)

      expect(await screen.findByTestId('acro-field-editable-anlN.kz110')).toBeTruthy()
      expect(screen.getByTestId('acro-field-computed-anlN.kz380')).toBeTruthy()
      expect(screen.getByTestId('acro-legend').textContent).toMatch(/direkt änderbar.*berechnet/)
    })

    it('shows no markings or legend without expert mode', async () => {
      serveLiveValues(singleN())
      open('anlage-n', N_FIELDS)

      await screen.findByLabelText(/Kz 110 Bruttoarbeitslohn\): 64000/)
      expect(screen.queryByTestId('acro-legend')).toBeNull()
      expect(screen.queryByTestId('acro-field-editable-anlN.kz110')).toBeNull()
    })

    it('keeps computed fields read-only, names their sources and stays in the form', async () => {
      writeExpertMode(true)
      serveLiveValues(singleN())
      const onInspectField = open('anlage-n', N_FIELDS)

      fireEvent.click(await screen.findByLabelText(/Anlage N · kz380/))

      expect((await screen.findByTestId('acro-derived-hint')).textContent).toMatch(/Wird berechnet aus: Weitere Werbungskosten/)
      expect(screen.queryByLabelText(/Direkteingabe/)).toBeNull()
      // In expert mode a click only selects; the jump to the mask is the inspector's own button.
      expect(onInspectField).not.toHaveBeenCalled()
      fireEvent.click(screen.getByText('Ins Eingabefeld springen →'))
      expect(onInspectField).toHaveBeenCalledTimes(1)
    })

    it('saves a master-data field as part of the whole record, keeping every other field', async () => {
      writeExpertMode(true)
      serveLiveValues({ 'est-1-a': [{ person: null, entityId: null, values: { 'est1a.plz': '79539' } }] })
      const record = {
        geburtsdatum: '1990-05-12', strasse: 'Rheinweg', hausnummer: '4', hausnummerZusatz: null, plz: '79539',
        wohnort: 'Lörrach', beruf: 'Ingenieurin', religion: 'VD', familienstand: 'verheiratet', familienstandSeit: '2020-06-01',
        iban: 'DE89370400440532013000', kontoinhaber: 'Lena Brenner', finanzamt: 'Lörrach', telefon: null, missing: [],
      }
      const puts: Record<string, unknown>[] = []
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(record)),
        http.put('*/v1/stammdaten', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          puts.push(body)
          return HttpResponse.json({ ...record, ...body })
        }),
      )
      open('est-1-a', [box('est1a.plz', 600)])

      await edit(/Hauptvordruck ESt 1 A · plz: 79539/, /Direkteingabe Hauptvordruck ESt 1 A · plz/, '123')
      expect(await screen.findByText(/fünfstellige Postleitzahl/)).toBeTruthy()
      expect(puts).toEqual([])

      fireEvent.change(screen.getByLabelText(/Direkteingabe Hauptvordruck ESt 1 A · plz/), { target: { value: '79540' } })
      fireEvent.click(screen.getByText('✓ Direkt speichern'))

      expect(await screen.findByText('Gespeichert.')).toBeTruthy()
      expect(puts[0]).toMatchObject({ plz: '79540', strasse: 'Rheinweg', wohnort: 'Lörrach', religion: 'VD', religionConsent: true, iban: 'DE89370400440532013000' })
    })

    it('writes a child\'s name to the child of the selected copy, and refuses to empty it', async () => {
      writeExpertMode(true)
      serveLiveValues({
        'anlage-kind': [
          { person: null, entityId: 'kind-1', values: { 'anlKind.vorname': 'Mia' } },
          { person: null, entityId: 'kind-2', values: { 'anlKind.vorname': 'Ben' } },
        ],
      })
      const puts: { url: string; body: unknown }[] = []
      server.use(
        http.put('*/v1/steuerjahre/2025/kinder/:id', async ({ request }) => {
          puts.push({ url: new URL(request.url).pathname, body: await request.json() })
          return HttpResponse.json({ kinder: [], count: 0, childBenefitSum: 0, totalAllowance: 0 })
        }),
      )
      open('anlage-kind', [box('anlKind.vorname', 600)])

      fireEvent.click(await screen.findByText('Kind: Ben'))
      await edit(/Anlage Kind · vorname: Ben/, /Direkteingabe Anlage Kind · vorname/, ' ')
      expect(await screen.findByText(/darf nicht leer sein/)).toBeTruthy()

      fireEvent.change(screen.getByLabelText(/Direkteingabe Anlage Kind · vorname/), { target: { value: 'Benno' } })
      fireEvent.click(screen.getByText('✓ Direkt speichern'))

      expect(await screen.findByText('Gespeichert.')).toBeTruthy()
      expect(puts).toEqual([{ url: '/v1/steuerjahre/2025/kinder/kind-2', body: { firstName: 'Benno' } }])
    })
  })
})
