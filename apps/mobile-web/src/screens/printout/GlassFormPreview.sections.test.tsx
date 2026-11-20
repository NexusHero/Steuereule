// Glas-Erklärung — every Vordruck section of a full joint return, where each value comes from, the
// way a row leads to its mask, and the empty / collapsed / filtered states.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { GlassFormPreview, type GlassFormPreviewProps } from './GlassFormPreview'

const YEAR = 2025
const BASE = `*/v1/steuerjahre/${YEAR}`

const lstb = (brutto: number, steuer: number, sv: number) => ({
  bruttoarbeitslohn: { kind: 'erfasst', value: brutto },
  lohnsteuer: { kind: 'erfasst', value: steuer },
  sozialversicherung: { kind: 'erfasst', value: sv },
  state: { kind: 'vollstaendig' },
})
const commute = (km: number, allowance: number, homeOffice: number, equipment: number) => ({
  inputs: { workdays: [1, 2, 3, 4, 5], vacationDays: 25, sickDays: 5, homeOfficeDays: homeOffice, oneWayKm: km, transport: 'pkw', workplace: 'Basel', publicHolidays: 10, publicHolidayRegion: 'BW', workEquipmentEur: equipment },
  workdays: { weekdays: 250, workdays: 210, commuteDays: 130 },
  commuterAllowance: allowance,
})
const chFields = (gross: number, qst: number, ahv: number) => [
  { id: 'grossWageChf', digit: '8', kind: 'erfasst', value: gross },
  { id: 'withholdingTaxChf', digit: '12', kind: 'erfasst', value: qst },
  { id: 'ahvContributionsChf', digit: '9', kind: 'erfasst', value: ahv },
]
const EMPTY_FIELD = { kind: 'offen' }

/** Serves a married couple filing jointly, with a value in every section for both persons. */
function serveFullReturn() {
  const person = (request: Request) => new URL(request.url).searchParams.get('person')
  server.use(
    http.get('*/v1/stammdaten', () =>
      HttpResponse.json({ geburtsdatum: '1990-05-12', strasse: 'Rheinweg', hausnummer: '4', hausnummerZusatz: null, plz: '79539', wohnort: 'Lörrach', beruf: 'Ingenieurin', religion: 'VD', familienstand: 'verheiratet', familienstandSeit: '2020-06-01', iban: 'DE89370400440532013000', kontoinhaber: 'Lena Brenner', finanzamt: 'Lörrach', telefon: null, missing: [] }),
    ),
    http.get(`${BASE}/kopplung`, () => HttpResponse.json({ filingType: 'zusammen', personBUserId: null, invitationCode: null, personB: { firstName: 'Markus', lastName: 'Brenner', steuerId: '12345678911', geburtsdatum: '1988-03-01', beruf: 'Grenzgänger', religion: 'VD' } })),
    http.get(`${BASE}/interview`, ({ request }) =>
      HttpResponse.json({
        answers:
          person(request) === 'B'
            ? { 'lohnersatz-betrag': '1200' }
            : { 'lohnersatz-betrag': '2000', 'vorauszahlungen-betrag': '800', 'fortbildung-kosten': '300', 'umzug-kosten': '900', 'dhf-miete': '650', 'kv-pv-betrag': '1500', 'spenden-betrag': '350', 'riester-betrag': '2100', 'haushalt-handwerker-betrag': '1200', 'haushalt-dienstleistung-betrag': '400', 'haushalt-minijob-betrag': '300', 'gesundheit-betrag': '800' },
        nextStep: { kind: 'done' },
        openItems: 0,
      }),
    ),
    http.get(`${BASE}/lstb`, ({ request }) => HttpResponse.json(person(request) === 'B' ? lstb(41000, 5200, 8000) : lstb(58000, 9400, 11200))),
    http.get(`${BASE}/arbeitsweg`, ({ request }) => HttpResponse.json(person(request) === 'B' ? commute(12, 400, 0, 0) : commute(20, 780, 80, 420))),
    http.get(`${BASE}/ch-lohnausweis`, ({ request }) =>
      HttpResponse.json({ fields: person(request) === 'B' ? chFields(70000, 2800, 4000) : chFields(84000, 3780, 5000), bemerkungen: null, exchangeRate: { month: '2025', rate: 0.94, mode: 'jahresdurchschnitt' }, status: 'echter-grenzgaenger', items: [], foldStatus: null, nGre: {} }),
    ),
    http.get(`${BASE}/rente`, ({ request }) => HttpResponse.json({ kind: 'gesetzlich', jahresbetrag: { kind: 'erfasst', value: person(request) === 'B' ? 6000 : 12000 }, rentenbeginnJahr: EMPTY_FIELD, alterBeiRentenbeginn: EMPTY_FIELD, items: [], status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0, gated: [] } })),
    http.get(`${BASE}/kapital`, () =>
      HttpResponse.json({ kapitalertraege: { kind: 'erfasst', value: 900 }, sparerPauschbetrag: { kind: 'erfasst', value: 1000 }, kapitalertragsteuer: { kind: 'erfasst', value: 200 }, solidaritaetszuschlag: EMPTY_FIELD, kirchensteuer: EMPTY_FIELD, requiredFields: [], depot: { kind: 'unbekannt' }, items: [], status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0, gated: [] }, inhaber: 'B' }),
    ),
    http.get(`${BASE}/kinder`, () =>
      HttpResponse.json({
        kinder: [
          { id: 'k1', sequenceNumber: 1, firstName: 'Lina', lastName: 'Brenner', geburtsdatum: '2016-05-12', childBenefitClaimEur: '3000', childcareEur: '700' },
          { id: 'k2', sequenceNumber: 2, firstName: '', lastName: '', geburtsdatum: '', childBenefitClaimEur: 'x', childcareEur: null },
        ],
        count: 2,
        childBenefitSum: 0,
        totalAllowance: 0,
      }),
    ),
    http.get(`${BASE}/vermietung`, () =>
      HttpResponse.json({
        classification: { kind: 'einfach' },
        properties: [
          { id: 'o1', mieteinnahmen: { kind: 'erfasst', value: 12000 }, werbungskosten: { kind: 'erfasst', value: 1500 }, strasse: 'Hauptstraße', hausnummer: '12', city: 'Köln', anteilA: '60' },
          { id: 'o2', mieteinnahmen: EMPTY_FIELD, werbungskosten: EMPTY_FIELD, strasse: null, hausnummer: null, city: null, anteilA: null },
        ],
        status: { kind: 'bestimmt', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 0, conflicts: 0 },
      }),
    ),
    http.get(`${BASE}/bestaetigung`, () =>
      HttpResponse.json({
        annexes: [
          {
            annex: 'anlageN',
            unconfirmed: 0,
            values: [
              { key: 'a', screen: 'stammdaten', instance: null, field: 'wohnort', value: 'x', provenance: { kind: 'uebernahme', lastYear: 2024 }, confirmed: true, proposal: null },
              { key: 'b', screen: 'commute', instance: null, field: 'oneWayKm', value: '20', provenance: { kind: 'assistent', name: 'SteuerEule', receiptId: 'r1' }, confirmed: true, proposal: null },
              { key: 'c', screen: 'lstb', instance: null, field: 'lohnsteuer', value: '9400', provenance: { kind: 'beleg' }, confirmed: true, proposal: null },
              { key: 'd', screen: 'interview', instance: null, field: 'spenden-betrag', value: '350', provenance: { kind: 'assistent', name: 'SteuerEule' }, confirmed: true, proposal: null },
              { key: 'e', screen: 'lstb', instance: null, field: 'bruttoarbeitslohn', value: '58000', provenance: { kind: 'nutzer' }, confirmed: true, proposal: null },
            ],
          },
        ],
      }),
    ),
  )
}

function renderPreview(props: Partial<GlassFormPreviewProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <GlassFormPreview year={YEAR} defaultOpen {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const row = (id: string) => screen.findByTestId(`glass-row-${id}`)

afterEach(() => server.resetHandlers())

describe('Glas-Erklärung — a full joint return', () => {
  it('lists the Hauptvordruck with address, joint filing, IBAN, replacement income and prepayments', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('est1a-adresse')).textContent).toContain('Rheinweg 4 79539 Lörrach')
    expect((await row('est1a-familienstand')).textContent).toContain('Verheiratet')
    expect((await row('est1a-veranlagung')).textContent).toContain('Zusammenveranlagung mit Markus')
    expect((await row('est1a-veranlagung')).textContent).toContain('Markus · Brenner · Grenzgänger')
    expect((await row('est1a-iban')).textContent).toContain('DE89370400440532013000')
    expect((await row('est1a-lohnersatz-a')).textContent).toMatch(/2\.000\s*€/)
    expect((await row('est1a-lohnersatz-b')).textContent).toContain('Einkommensersatzleistungen (Markus)')
    expect((await row('est1a-vorauszahlungen')).textContent).toMatch(/800\s*€/)
    expect(within(await row('est1a-veranlagung')).getByText('Gemeinsam')).toBeTruthy()
  })

  it('lists Anlage N for both persons with commute, home office, equipment and the answered costs', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('anlageN-brutto-a')).textContent).toMatch(/58\.000\s*€/)
    expect((await row('anlageN-lst-a')).textContent).toMatch(/9\.400\s*€/)
    expect((await row('anlageN-brutto-b')).textContent).toMatch(/41\.000\s*€/)
    expect((await row('anlageN-lst-b')).textContent).toMatch(/5\.200\s*€/)
    expect((await row('anlageN-weg-a')).textContent).toContain('20 km · 130 Tage')
    expect((await row('anlageN-ho-a')).textContent).toMatch(/480\s*€/)
    expect((await row('anlageN-arbeitsmittel-a')).textContent).toMatch(/420\s*€/)
    expect((await row('anlageN-weg-b')).textContent).toContain('12 km')
    expect((await row('anlageN-fortbildung')).textContent).toMatch(/300\s*€/)
    expect((await row('anlageN-umzug')).textContent).toMatch(/900\s*€/)
    expect((await row('anlageN-dhf')).textContent).toMatch(/650\s*€ \/ Monat/)
  })

  it('lists the Swiss figures of both persons with the exchange rate', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('ngre-brutto-a')).textContent).toContain('Kurs 0.94')
    expect((await row('ngre-brutto-a')).textContent).toContain('84.000 CHF')
    expect((await row('ngre-qst-a')).textContent).toContain('3.780 CHF')
    expect((await row('ngre-ahv-a')).textContent).toContain('5.000 CHF')
    expect((await row('ngre-brutto-b')).textContent).toContain('70.000 CHF')
    expect((await row('ngre-qst-b')).textContent).toContain('2.800 CHF')
  })

  it('lists provident, insurance, donations and Riester', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('vorsorge-sv-a')).textContent).toMatch(/11\.200\s*€/)
    expect((await row('vorsorge-sv-b')).textContent).toMatch(/8\.000\s*€/)
    expect((await row('vorsorge-kv-a')).textContent).toMatch(/1\.500\s*€/)
    expect((await row('sonderausgaben-spenden')).textContent).toMatch(/350\s*€/)
    expect((await row('anlageAV-riester')).textContent).toMatch(/2\.100\s*€/)
  })

  it('lists every child with its Kindergeld and childcare, and falls back for a child without a name', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('kind-k1-stamm')).textContent).toContain('Lina Brenner (*2016-05-12)')
    expect((await row('kind-k1-betreuung')).textContent).toMatch(/700\s*€/)
    const second = await row('kind-k2-stamm')
    expect(second.textContent).toContain('Kind 2')
    expect(second.textContent).toMatch(/Kindergeld: 0\s*€/)
    expect(screen.queryByTestId('glass-row-kind-k2-betreuung')).toBeNull()
  })

  it('lists capital income, rental properties and pensions', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('kap-ertraege')).textContent).toMatch(/900\s*€/)
    expect((await row('kap-pauschbetrag')).textContent).toMatch(/1\.000\s*€/)
    expect((await row('kap-kest')).textContent).toMatch(/200\s*€/)
    expect((await row('v-o1-miete')).textContent).toContain('Hauptstraße 12 Köln')
    expect((await row('v-o1-wk')).textContent).toMatch(/1\.500\s*€/)
    expect((await row('v-o1-anteil')).textContent).toContain('60 % / 40 %')
    expect(screen.queryByTestId('glass-row-v-o2-miete')).toBeNull()
    expect((await row('rente-a')).textContent).toMatch(/12\.000\s*€/)
    expect((await row('rente-b')).textContent).toContain('Jahresbetrag Rente (Markus)')
  })

  it('lists the household services and the medical costs', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('haushalt-handwerker')).textContent).toMatch(/1\.200\s*€/)
    expect((await row('haushalt-dienstleistung')).textContent).toMatch(/400\s*€/)
    expect((await row('haushalt-minijob')).textContent).toMatch(/300\s*€/)
    expect((await row('agb-krankheit')).textContent).toMatch(/800\s*€/)
  })

  it('says where each value comes from', async () => {
    serveFullReturn()
    renderPreview()
    expect((await row('est1a-adresse')).textContent).toContain('Übernahme aus 2024')
    expect((await row('anlageN-weg-a')).textContent).toContain('📎')
    expect((await row('anlageN-lst-a')).textContent).toContain('📎 Aus Beleg')
    expect((await row('sonderausgaben-spenden')).textContent).toContain('🦉')
    expect((await row('anlageN-brutto-a')).textContent).toContain('Selbst eingetragen')
    expect((await row('kap-ertraege')).textContent).toContain('Selbst eingetragen')
  })

  it('names the person a value belongs to and shows no jump hint without a handler', async () => {
    serveFullReturn()
    renderPreview()
    const rowB = await row('anlageN-brutto-b')
    expect(within(rowB).getByText('Markus')).toBeTruthy()
    expect(rowB.getAttribute('aria-disabled') ?? rowB.getAttribute('disabled')).not.toBeNull()
    expect(screen.queryByText('Zur Eingabemaske springen →')).toBeNull()
  })

  it('jumps to the mask of the person the row belongs to', async () => {
    serveFullReturn()
    const onInspectField = vi.fn()
    renderPreview({ onInspectField })
    fireEvent.click(await row('anlageN-brutto-b'))
    expect(onInspectField).toHaveBeenCalledWith('lstb', 'bruttoarbeitslohn', 'B')
    fireEvent.click(await row('rente-a'))
    expect(onInspectField).toHaveBeenCalledWith('rente', 'jahresbetrag', 'A')
    expect((await screen.findAllByText('Zur Eingabemaske springen →')).length).toBeGreaterThan(10)
  })

  it('counts the sections and rows, filters by Vordruck and shows everything again with "Alle"', async () => {
    serveFullReturn()
    renderPreview()
    await row('rente-b')
    expect(screen.getByText(/\d+ Vordrucke · \d+ befüllte Formularzeilen/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('glass-filter-anlageR'))
    expect(screen.getByTestId('glass-section-anlageR')).toBeTruthy()
    expect(screen.queryByTestId('glass-section-anlageV')).toBeNull()
    fireEvent.click(screen.getByTestId('glass-filter-alle'))
    expect(screen.getByTestId('glass-section-anlageV')).toBeTruthy()
  })
})

describe('Glas-Erklärung — states', () => {
  it('says that nothing is filled in yet', async () => {
    renderPreview()
    expect(await screen.findByText(/Noch keine Formularzeilen befüllt/)).toBeTruthy()
    expect(screen.queryByTestId('glass-form-filter-row')).toBeNull()
  })

  it('names a single Vordruck without the filter row, and a single person without joint rows', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ geburtsdatum: null, strasse: null, hausnummer: null, hausnummerZusatz: null, plz: null, wohnort: 'Bonn', beruf: null, religion: null, familienstand: 'ledig', familienstandSeit: null, iban: null, kontoinhaber: null, finanzamt: null, telefon: null, missing: [] })),
    )
    renderPreview()
    expect((await row('est1a-adresse')).textContent).toContain('Bonn')
    expect((await row('est1a-familienstand')).textContent).toContain('ledig')
    expect(screen.queryByTestId('est1a-veranlagung')).toBeNull()
    expect(screen.queryByTestId('glass-form-filter-row')).toBeNull()
  })

  it('can be collapsed again when it was opened by the user, and not when it starts open as a screen of its own', async () => {
    renderPreview({ defaultOpen: false })
    fireEvent.click(screen.getByTestId('glass-form-preview-toggle'))
    fireEvent.click(await screen.findByTestId('glass-form-preview-collapse'))
    expect(screen.getByTestId('glass-form-preview-collapsed')).toBeTruthy()
  })

  it('has no collapse button when it is open from the start', async () => {
    renderPreview({ defaultOpen: true })
    await screen.findByTestId('glass-form-preview')
    expect(screen.queryByTestId('glass-form-preview-collapse')).toBeNull()
  })

  it('leaves out its heading on a screen with its own title, and switches between the two views', async () => {
    server.use(http.get(`${BASE}/ausdruck/werte`, () => HttpResponse.json({ forms: [] })))
    const loader = { loadTemplate: vi.fn().mockRejectedValue(new Error('kein Vordruck')) }
    renderPreview({ hideHeading: true, acroFormLoader: loader })
    await screen.findByTestId('glass-form-preview')
    expect(screen.queryByText('🔍 Glas-Erklärung: Amtliche Formular-Vorschau')).toBeNull()
    fireEvent.click(screen.getByText('📄 Original-Vordruck'))
    expect(await screen.findByText('kein Vordruck')).toBeTruthy()
    await waitFor(() => expect(loader.loadTemplate).toHaveBeenCalled())
    fireEvent.click(screen.getByText('📋 Strukturierte Zeilen'))
    expect(screen.queryByText('kein Vordruck')).toBeNull()
  })
})
