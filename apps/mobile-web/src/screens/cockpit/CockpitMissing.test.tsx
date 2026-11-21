import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server, EMPTY_CH_SALARY_CERTIFICATE_RESPONSE } from '../../test-msw-server'
import { CockpitScreen, type CockpitScreenProps } from './CockpitScreen'
import { missingItems } from './estimateMissing'

const TAX_YEAR = 2025

function renderCockpit(props: Partial<CockpitScreenProps> = {}) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CockpitScreen taxYear={TAX_YEAR} isSignedIn={true} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

/** A Swiss certificate the tile reads as done: folded and with a rate, but without the pension fund contribution. */
const FOLDED_CERTIFICATE = {
  ...EMPTY_CH_SALARY_CERTIFICATE_RESPONSE,
  status: 'echter-grenzgaenger',
  exchangeRate: { month: `${TAX_YEAR}-12`, rate: 1.05, mode: 'amtlich' },
  foldStatus: { kind: 'bestimmt', einnahmen: 61000, vorsorgeaufwand: 4000, anrechnung: 2700 },
}

function crossBorderCouple(missing: readonly string[]) {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/cockpit`, () => HttpResponse.json({ openItems: 0, status: { kind: 'bestimmt', value: 61000 } })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`, () => HttpResponse.json({ kind: 'offen', missing })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
      HttpResponse.json({
        answers: { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz' },
        nextStep: { kind: 'done' },
        openItems: 0,
      }),
    ),
    http.get('*/v1/stammdaten', () => HttpResponse.json({ familienstand: 'verheiratet', missing: [] })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
      HttpResponse.json({
        filingType: 'zusammen',
        personBUserId: null,
        invitationCode: null,
        personBHasOwnAccount: false,
        personB: { firstName: 'Mira', lastName: 'Tanner', steuerId: null, geburtsdatum: null, religion: null, religionConsent: false, beruf: null },
      }),
    ),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis`, () => HttpResponse.json(FOLDED_CERTIFICATE)),
  )
}

describe('what the estimate still lacks', () => {
  it('names every missing id with the mask that holds it, for Person B too', () => {
    expect(missingItems(['pk-obligatorium', 'personB.pk-obligatorium', 'lohnsteuer', 'personB.rente', 'lohnersatz-betrag'])).toEqual([
      { id: 'pk-obligatorium', raw: 'pk-obligatorium', person: 'A', known: true, target: { kind: 'tile', tile: 'ch' } },
      { id: 'pk-obligatorium', raw: 'personB.pk-obligatorium', person: 'B', known: true, target: { kind: 'partner', area: 'schweiz' } },
      { id: 'lohnsteuer', raw: 'lohnsteuer', person: 'A', known: true, target: { kind: 'tile', tile: 'lstb' } },
      { id: 'rente', raw: 'personB.rente', person: 'B', known: true, target: { kind: 'partner', area: 'rente' } },
      { id: 'lohnersatz-betrag', raw: 'lohnersatz-betrag', person: 'A', known: true, target: { kind: 'tile', tile: 'lebenslagen' } },
    ])
  })

  it('keeps an id it does not know as an item without a way, and folds duplicates', () => {
    expect(missingItems(['etwas-neues', 'etwas-neues'])).toEqual([{ id: 'etwas-neues', raw: 'etwas-neues', person: 'A', known: false, target: null }])
  })

  it('says which details are missing instead of only how many, and leads to their masks', async () => {
    crossBorderCouple(['pk-obligatorium', 'personB.pk-obligatorium'])
    const onOpenTile = vi.fn()
    const onOpenPartner = vi.fn()
    renderCockpit({ onOpenTile, onOpenPartner })

    const own = await screen.findByTestId('cockpit-fehlt-pk-obligatorium')
    expect(own.textContent).toContain('Pensionskasse')
    expect(own.textContent).toContain('Schweizer Lohnausweis')
    const partners = screen.getByTestId('cockpit-fehlt-personB.pk-obligatorium')
    expect(partners.textContent).toContain('Mira')
    expect(partners.textContent).toContain('Pensionskasse')

    fireEvent.click(own)
    expect(onOpenTile).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch' }), false)
    fireEvent.click(partners)
    expect(onOpenPartner).toHaveBeenCalledWith('schweiz', 'Mira')
  })

  it('does not call a tile done while the estimate misses something it holds', async () => {
    crossBorderCouple(['pk-obligatorium', 'personB.pk-obligatorium'])
    renderCockpit({ onOpenTile: vi.fn(), onOpenPartner: vi.fn() })

    await screen.findByTestId('cockpit-fehlt-pk-obligatorium')
    expect(screen.getByTestId('cockpit-kachel-ch-status').textContent).toBe('Offen')
    expect(screen.getByTestId('partner-schweiz-status').textContent).toBe('Offen')
    expect(screen.getByTestId('cockpit-kachel-ch-fehlt').textContent).toContain('Pensionskasse')
  })

  it('leaves the tile done once the estimate has what it needs', async () => {
    crossBorderCouple([])
    server.use(http.get(`*/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`, () => HttpResponse.json({ kind: 'spanne', result: { from: 900, to: 1100 }, churchTaxOpen: false })))
    renderCockpit({ onOpenTile: vi.fn(), onOpenPartner: vi.fn() })

    expect((await screen.findByTestId('cockpit-kachel-ch-status')).textContent).toBe('Erledigt')
    expect((await screen.findByTestId('partner-schweiz-status')).textContent).toBe('Erledigt')
    expect(screen.queryByTestId('cockpit-fehlt-pk-obligatorium')).toBeNull()
  })
})

describe('a topic the user did not pick', () => {
  it('reads „Trifft nicht zu“, not „Erledigt“ (Echtdatenlauf 4)', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/cockpit`, () => HttpResponse.json({ openItems: 0, status: { kind: 'bestimmt', value: 48000 } })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`, () => HttpResponse.json({ kind: 'spanne', result: { from: 300, to: 400 }, churchTaxOpen: false })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig', 'haushalt-gate': 'Nein' }, nextStep: { kind: 'done' }, openItems: 0 }),
      ),
    )
    renderCockpit({ onOpenTile: vi.fn() })
    expect((await screen.findByTestId('cockpit-kachel-haushalt-status')).textContent).toBe('Trifft nicht zu')
  })
})
