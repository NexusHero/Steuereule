// Glas-Erklärung — the rows that come from what the printout fills (`ausdruck/werte`): the Anlage N-Gre of
// each person with its provision lines, the ways to work under the form they are printed on, the further
// Werbungskosten (account fees) and the Anlage Vorsorgeaufwand. A couple of two Grenzgänger; Person A
// also had a German employer for part of the year (first way 0 km, second way to Switzerland).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { GlassFormPreview, type GlassFormPreviewProps } from './GlassFormPreview'

const YEAR = 2024
const BASE = `*/v1/steuerjahre/${YEAR}`

type Values = Record<string, string | true>

/** The Zeile of each field as the API names it for the year; the numbers here are those of the 2024 forms. */
const LINES_2024: Record<string, string> = {
  'anlN.kz110': '5', 'anlN.kz110Tage': '32', 'anlN.kz111': '33', 'anlN.kz112': '34', 'anlN.z54Eur': '57', 'anlN.z62Eur': '65', 'anlN.kz330': '63',
  'anlNGre.z6Chf': '5', 'anlNGre.z8Chf': '7', 'anlNGre.z9Chf': '8', 'anlNGre.z18Chf': '17', 'anlNGre.z23Chf': '22', 'anlNGre.z25Chf': '24',
  'anlNGre.kz110Tage': '34', 'anlNGre.kz111': '35', 'anlNGre.kz112': '36', 'anlNGre.z49Eur': '49', 'anlNGre.z57Eur': '57', 'anlNGre.z58Eur': '58',
  'anlNGre.z78Chf': '78', 'anlNGre.z79Chf': '79', 'anlNGre.z80Chf': '80', 'anlNGre.z81Chf': '81', 'anlNGre.z82Chf': '82', 'anlNGre.z83Chf': '83',
  'anlNGre.z84Chf': '84', 'anlNGre.z85Chf': '85', 'anlNGre.z87Chf': '87', 'anlNGre.z88Chf': '88',
  'anlVor.kz333': '28', 'anlVor.kz334': '29', 'anlVor.kz433': '28',
}
const copy = (person: 'A' | 'B' | null, values: Values) => ({
  person,
  entityId: null,
  values,
  lines: Object.fromEntries(Object.keys(values).filter((id) => id in LINES_2024).map((id) => [id, LINES_2024[id]])),
})

const pair = (row: string, chf: number, eur: number): Values => ({ [`anlNGre.${row}Chf`]: String(chf), [`anlNGre.${row}Eur`]: String(eur) })

const N_GRE_A: Values = {
  'anlNGre.personA': true,
  ...pair('z6', 60000, 63000),
  ...pair('z8', 2400, 2520),
  ...pair('z15', 57600, 60480),
  ...pair('z23', 57600, 60480),
  ...pair('z25', 2700, 2835),
  ...pair('z78', 144, 151),
  ...pair('z79', 634, 666),
  ...pair('z80', 300, 315),
  ...pair('z81', 200, 210),
  ...pair('z82', 1278, 1342),
  ...pair('z83', 2909, 3054),
  ...pair('z84', 3000, 3150),
  ...pair('z85', 5909, 6204),
  ...pair('z87', 3500, 3675),
  ...pair('z88', 6409, 6729),
  // The way after the change of job: the second way of the year, printed as the N-Gre's first.
  'anlNGre.wegOrt': '4051 Basel',
  'anlNGre.kz110Tage': '40',
  'anlNGre.kz111': '60',
  'anlNGre.kz112': '60',
  'anlNGre.z57Text': '50 % der Beiträge zur Nichtberufsunfallversicherung',
  'anlNGre.z57Eur': '210',
  'anlNGre.kz380': '210',
}
const N_GRE_B: Values = {
  'anlNGre.personB': true,
  ...pair('z6', 50000, 52500),
  ...pair('z9', 1000, 1050),
  ...pair('z10', 2000, 2100),
  ...pair('z23', 49000, 51450),
  ...pair('z25', 2250, 2363),
  ...pair('z83', 2475, 2599),
  ...pair('z84', 2500, 2625),
  ...pair('z85', 4975, 5224),
  'anlNGre.wegOrt': '8200 Schaffhausen',
  'anlNGre.kz110Tage': '200',
  'anlNGre.kz111': '25',
  'anlNGre.kz112': '25',
  'anlNGre.z49Text': 'Arbeitsmittel',
  'anlNGre.z49Eur': '110',
  'anlNGre.kz320': '110',
  'anlNGre.z57Text': 'Kontoführungsgebühren',
  'anlNGre.z57Eur': '16',
  'anlNGre.kz380': '16',
}
const ANLAGE_N_A: Values = {
  'anlN.personA': true,
  'anlN.kz110': '30000',
  // The way while employed in Germany: 0 km, it produces no Entfernungspauschale.
  'anlN.wegOrt': '79098 Freiburg',
  'anlN.kz110Tage': '90',
  'anlN.kz111': '0',
  'anlN.z54Text': 'Arbeitsmittel',
  'anlN.z54Eur': '110',
  'anlN.kz320': '110',
  'anlN.z62Text': 'Kontoführungsgebühren',
  'anlN.z62Eur': '16',
  'anlN.kz380': '16',
}

function serveCouple(forms: { formular: string; instances: ReturnType<typeof copy>[] }[] | 'fehler') {
  const person = (request: Request) => new URL(request.url).searchParams.get('person')
  server.use(
    http.get(`${BASE}/kopplung`, () => HttpResponse.json({ filingType: 'zusammen', personBUserId: 'spouse_u1_2024', invitationCode: null, personB: { firstName: 'Mara', lastName: 'Beispiel', steuerId: null, geburtsdatum: null, beruf: null, religion: null } })),
    http.get(`${BASE}/lstb`, ({ request }) =>
      HttpResponse.json(
        person(request) === 'B'
          ? { bruttoarbeitslohn: { kind: 'offen' }, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' }, state: { kind: 'unvollstaendig' } }
          : { bruttoarbeitslohn: { kind: 'erfasst', value: 30000 }, lohnsteuer: { kind: 'erfasst', value: 5000 }, sozialversicherung: { kind: 'erfasst', value: 6000 }, state: { kind: 'vollstaendig' } },
      ),
    ),
    // As the commute mask answers: the first way (0 km) leads, the allowance is the sum over both ways.
    http.get(`${BASE}/arbeitsweg`, ({ request }) =>
      HttpResponse.json(
        person(request) === 'B'
          ? { inputs: { workdays: [1, 2, 3, 4, 5], vacationDays: 25, sickDays: 0, homeOfficeDays: 0, oneWayKm: 25, transport: 'pkw', workplace: '8200 Schaffhausen', accountFeesEur: 16, workEquipmentEur: 110 }, workdays: { weekdays: 250, workdays: 225, commuteDays: 200 }, commuterAllowance: 1580 }
          : { inputs: { workdays: [1, 2, 3, 4, 5], vacationDays: 25, sickDays: 0, homeOfficeDays: 0, oneWayKm: 0, transport: 'pkw', workplace: '79098 Freiburg', secondOneWayKm: 60, secondTransport: 'pkw', secondWorkplace: '4051 Basel', accountFeesEur: 16, workEquipmentEur: 110 }, workdays: { weekdays: 250, workdays: 225, commuteDays: 40 }, commuterAllowance: 848 },
      ),
    ),
    http.get(`${BASE}/ch-lohnausweis`, ({ request }) =>
      HttpResponse.json({
        fields: [
          { id: 'bruttolohn-total', digit: '8', kind: 'erfasst', value: person(request) === 'B' ? 50000 : 60000 },
          { id: 'ahv-beitraege', digit: '9', kind: 'erfasst', value: person(request) === 'B' ? 3200 : 3900 },
          { id: 'quellensteuer', digit: '12', kind: 'erfasst', value: person(request) === 'B' ? 2250 : 2700 },
        ],
        bemerkungen: null,
        exchangeRate: { month: '2024', rate: 1.05, mode: 'jahresdurchschnitt' },
        status: 'echter-grenzgaenger',
        items: [],
        foldStatus: null,
        nGre: {},
      }),
    ),
    http.get(`${BASE}/ausdruck/werte`, () => (forms === 'fehler' ? HttpResponse.json({ message: 'no Vordrucke' }, { status: 404 }) : HttpResponse.json({ forms }))),
  )
}

const FULL = [
  { formular: 'anlage-n', instances: [copy('A', ANLAGE_N_A)] },
  { formular: 'anlage-n-gre', instances: [copy('A', N_GRE_A), copy('B', N_GRE_B)] },
  { formular: 'anlage-vorsorgeaufwand', instances: [copy(null, { 'anlVor.kz333': '3400', 'anlVor.kz334': '3400', 'anlVor.kz433': '2900' })] },
]

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

describe('Glas-Erklärung — the Anlage N-Gre as the printout fills it', () => {
  it('lists the Swiss wage lines of each person in CHF and EUR, at the Zeile of that year', async () => {
    serveCouple(FULL)
    renderPreview()
    const grossA = await row('ngre-z6-a')
    expect(grossA.textContent).toContain('Zeile 5')
    expect(grossA.textContent).toContain('60.000 CHF')
    expect(grossA.textContent).toMatch(/63\.000\s*€/)
    expect((await row('ngre-z8-a')).textContent).toContain('2.400 CHF')
    expect((await row('ngre-z23-a')).textContent).toContain('Zeile 22')
    expect((await row('ngre-z25-a')).textContent).toContain('2.700 CHF')
    const grossB = await row('ngre-z6-b')
    expect(grossB.textContent).toContain('50.000 CHF')
    expect(grossB.textContent).toContain('Mara')
    expect((await row('ngre-z9-b')).textContent).toContain('1.000 CHF')
    // A line the form leaves empty is no row.
    expect(screen.queryByTestId('glass-row-ngre-z9-a')).toBeNull()
    // The „SUVA – Geld“ line is its own row, right after the sickness benefit.
    const accident = await row('ngre-z10-b')
    expect(accident.textContent).toContain('2.000 CHF')
    expect(accident.textContent).toContain('SUVA-Geld')
    expect(screen.queryByTestId('glass-row-ngre-z10-a')).toBeNull()
    expect(screen.queryByTestId('glass-row-ngre-z8-b')).toBeNull()
  })

  it('lists the provision lines of the Anlage N-Gre for each person', async () => {
    serveCouple(FULL)
    renderPreview()
    expect((await row('ngre-z83-a')).textContent).toContain('2.909 CHF')
    expect((await row('ngre-z84-a')).textContent).toContain('3.000 CHF')
    expect((await row('ngre-z85-a')).textContent).toMatch(/6\.204\s*€/)
    expect((await row('ngre-z82-a')).textContent).toContain('Zeile 82')
    expect((await row('ngre-z87-a')).textContent).toContain('3.500 CHF')
    expect((await row('ngre-z84-b')).textContent).toContain('2.500 CHF')
    expect(screen.getByTestId('glass-section-anlageNGre')).toBeTruthy()
  })

  it('shows the way to Switzerland under the Anlage N-Gre with its own distance and days, not under Anlage N', async () => {
    serveCouple(FULL)
    renderPreview()
    const wayA = await row('ngre-weg1-a')
    expect(wayA.textContent).toContain('4051 Basel')
    expect(wayA.textContent).toContain('60 km · 40 Tage')
    // 40 days × (20 km × 0,30 € + 40 km × 0,38 €)
    expect(wayA.textContent).toMatch(/848\s*€/)
    expect(wayA.textContent).toContain('Zeilen 34–36')
    expect((await row('ngre-weg1-b')).textContent).toContain('25 km · 200 Tage')
    // The 0 km way of the German job produced nothing: no „0 km“ line, and none carrying the other way's amount.
    const anlageN = screen.getByTestId('glass-section-anlageN')
    expect(anlageN.textContent).not.toContain('Entfernungspauschale')
    expect(screen.queryByTestId('glass-row-anlageN-weg-a')).toBeNull()
    expect(screen.queryByTestId('glass-row-anlageN-weg-b')).toBeNull()
  })

  it('lists the account fees and the other further Werbungskosten under the form that carries them', async () => {
    serveCouple(FULL)
    renderPreview()
    const feesA = await row('anlageN-sonstiges1-a')
    expect(feesA.textContent).toContain('Kontoführungsgebühren')
    expect(feesA.textContent).toMatch(/16\s*€/)
    expect(feesA.textContent).toContain('Zeile 65')
    expect((await row('anlageN-arbeitsmittel-a')).textContent).toMatch(/110\s*€/)
    expect((await row('ngre-sonstiges1-a')).textContent).toContain('Nichtberufsunfallversicherung')
    const feesB = await row('ngre-sonstiges1-b')
    expect(feesB.textContent).toContain('Kontoführungsgebühren')
    expect(feesB.textContent).toContain('Zeile 57')
    expect((await row('ngre-arbeitsmittel-b')).textContent).toMatch(/110\s*€/)
  })

  it('lists the self-paid insurance of the Anlage Vorsorgeaufwand for each person', async () => {
    serveCouple(FULL)
    renderPreview()
    const a = await row('vorsorge-kz333')
    expect(a.textContent).toMatch(/3\.400\s*€/)
    expect(a.textContent).toContain('Zeile 28')
    const b = await row('vorsorge-kz433')
    expect(b.textContent).toMatch(/2\.900\s*€/)
    expect(b.textContent).toContain('Mara')
  })

  it('leads from a row to the mask of the person it belongs to', async () => {
    serveCouple(FULL)
    const onInspectField = vi.fn()
    renderPreview({ onInspectField })
    fireEvent.click(await row('ngre-z6-b'))
    expect(onInspectField).toHaveBeenCalledWith('chLohnausweis', 'grossWageChf', 'B')
    fireEvent.click(await row('ngre-weg1-a'))
    expect(onInspectField).toHaveBeenCalledWith('commute', 'oneWayKm', 'A')
  })
})

describe('Glas-Erklärung — while the printout has no Anlage N-Gre yet', () => {
  it('still names the recorded Lohnausweis figures of both persons', async () => {
    // An incomplete Lohnausweis: the printout fills no Anlage N-Gre, the recorded figures are all there is.
    serveCouple([{ formular: 'anlage-n', instances: [copy('A', { 'anlN.personA': true, 'anlN.kz110': '30000' })] }])
    renderPreview()
    expect((await row('ngre-brutto-a')).textContent).toContain('60.000 CHF')
    expect((await row('ngre-qst-a')).textContent).toContain('2.700 CHF')
    expect((await row('ngre-ahv-a')).textContent).toContain('3.900 CHF')
    expect((await row('ngre-brutto-b')).textContent).toContain('50.000 CHF')
    expect(screen.queryByTestId('glass-row-ngre-z6-a')).toBeNull()
  })

  it('names every way behind the allowance when the year has no Vordrucke to read the ways from', async () => {
    serveCouple('fehler')
    renderPreview()
    const way = await row('anlageN-weg-a')
    await waitFor(() => expect(way.textContent).toContain('0 km + 60 km'))
    expect(way.textContent).toMatch(/848\s*€/)
  })
})
