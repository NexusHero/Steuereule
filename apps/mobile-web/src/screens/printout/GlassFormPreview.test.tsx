import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { Screen } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { writeExpertMode } from '../../lib/expertModePreference'
import { GlassFormPreview } from './GlassFormPreview'
import type { AcroFormPdfLoader } from './AcroFormLiveViewer'

function renderPreview(
  props: {
    defaultOpen?: boolean
    defaultMode?: 'zeilen' | 'acroform'
    initialAcroForm?: string
    acroFormLoader?: AcroFormPdfLoader
    onInspectField?: (screen: Screen, field?: string, person?: 'A' | 'B') => void
  } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <GlassFormPreview
            year={2025}
            defaultOpen={props.defaultOpen ?? false}
            defaultMode={props.defaultMode}
            initialAcroForm={props.initialAcroForm}
            acroFormLoader={props.acroFormLoader}
            onInspectField={props.onInspectField}
          />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
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
    const lstbBody = (brutto: number | null) => ({
      bruttoarbeitslohn: brutto === null ? { kind: 'offen' } : { kind: 'erfasst', value: brutto },
      lohnsteuer: { kind: 'erfasst', value: 11200 },
      sozialversicherung: { kind: 'erfasst', value: 12100 },
      state: { kind: 'unvollstaendig' },
    })

    const fakeLoader = (): AcroFormPdfLoader => ({
      loadTemplate: vi.fn().mockResolvedValue({
        numPages: 4,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({
            width: 595,
            height: 842,
            convertToViewportRectangle: (r: readonly [number, number, number, number]) => r,
          }),
          render: () => ({ promise: Promise.resolve() }),
          getAnnotations: async () => [
            { fieldName: 'anlN.kz110', rect: [233.9, 575.2, 350.4, 591.0], textAlignment: 2 },
            { fieldName: 'anlN.kz140', rect: [233.9, 550.0, 350.4, 565.8], textAlignment: 2 },
            { fieldName: 'anlN.kz380', rect: [233.9, 400.0, 350.4, 415.8], textAlignment: 2 },
          ],
        }),
      }),
    })

    /** Serves the LStB like the API: GET returns what the last PUT stored; `putStatus` can force a refusal. */
    function serveLstb(options: { putStatus?: number } = {}) {
      const puts: unknown[] = []
      let brutto: number | null = 64000
      server.use(
        http.get('*/v1/steuerjahre/2025/lstb', () => HttpResponse.json(lstbBody(brutto))),
        http.put('*/v1/steuerjahre/2025/lstb/bruttoarbeitslohn', async ({ request }) => {
          const body = (await request.json()) as { kind: string; value?: number }
          puts.push(body)
          if (options.putStatus && options.putStatus !== 200) {
            return HttpResponse.json({ message: 'refused' }, { status: options.putStatus })
          }
          brutto = body.kind === 'erfasst' ? (body.value ?? null) : null
          return HttpResponse.json(lstbBody(brutto))
        }),
      )
      return puts
    }

    function open(onInspectField = vi.fn()) {
      renderPreview({ defaultOpen: true, defaultMode: 'acroform', initialAcroForm: 'anlage-n', acroFormLoader: fakeLoader(), onInspectField })
      return onInspectField
    }

    async function editKz110(value: string) {
      fireEvent.click(await screen.findByLabelText(/Anlage N · Zeile 6 \(Kz 110 Bruttoarbeitslohn\): 64000/))
      fireEvent.change(await screen.findByLabelText(/Direkteingabe Anlage N · Zeile 6/), { target: { value } })
      fireEvent.click(screen.getByText('✓ Direkt speichern'))
    }

    it('without expert mode a click jumps to the input mask and offers no direct input', async () => {
      serveLstb()
      const onInspectField = open()

      fireEvent.click(await screen.findByLabelText(/Anlage N · Zeile 6 \(Kz 110 Bruttoarbeitslohn\): 64000/))

      expect(onInspectField).toHaveBeenCalledWith('lstb', 'bruttoarbeitslohn', 'A')
      expect(await screen.findByText(/Aktives AcroForm-Feld: anlN\.kz110/)).toBeTruthy()
      expect(screen.queryByLabelText(/Direkteingabe/)).toBeNull()
    })

    it('in expert mode saves a 1:1 field in place, without leaving the form', async () => {
      writeExpertMode(true)
      const puts = serveLstb()
      const onInspectField = open()

      await editKz110('68.500')

      expect(await screen.findByText('Gespeichert.')).toBeTruthy()
      expect(puts).toEqual([{ kind: 'erfasst', value: 68500 }])
      expect(onInspectField).not.toHaveBeenCalled()
      expect(await screen.findByText(/Eingetragener Wert: 68500/)).toBeTruthy()
    })

    it('shows a refusal of the server and keeps the stored value', async () => {
      writeExpertMode(true)
      serveLstb({ putStatus: 400 })
      open()

      await editKz110('68500')

      expect(await screen.findByText(/Konnte nicht gespeichert werden/)).toBeTruthy()
      expect(screen.getByText(/Eingetragener Wert: 64000/)).toBeTruthy()
    })

    it('rejects an ambiguous amount without calling the server', async () => {
      writeExpertMode(true)
      const puts = serveLstb()
      open()

      await editKz110('68,5')

      expect(await screen.findByText(/Bitte einen ganzen Betrag eingeben/)).toBeTruthy()
      expect(puts).toEqual([])
    })

    it('clearing the field sets it back to open', async () => {
      writeExpertMode(true)
      const puts = serveLstb()
      open()

      await editKz110('')

      expect(await screen.findByText(/Wert entfernt/)).toBeTruthy()
      expect(puts).toEqual([{ kind: 'offen' }])
    })

    it('keeps computed fields read-only and names their sources', async () => {
      writeExpertMode(true)
      serveLstb()
      open()

      fireEvent.click(await screen.findByLabelText(/Anlage N · kz380/))

      expect((await screen.findByTestId('acro-derived-hint')).textContent).toMatch(/Wird berechnet aus: Weitere Werbungskosten/)
      expect(screen.queryByLabelText(/Direkteingabe/)).toBeNull()
    })
  })
})
