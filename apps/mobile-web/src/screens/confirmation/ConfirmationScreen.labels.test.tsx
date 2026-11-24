// The lock for MCP-5, MCP-25, WEB-18 and H2-2: every field of every mask in the core's field catalogue is shown
// on „Prüfen & bestätigen“ by a name, never its id; values read as their field type; the record a value belongs
// to is named; and „Einzeln ändern“ opens the mask of every screen.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { FIELD_CATALOG, SCREENS, annexOf, provenanceKey } from '@steuereule/core'
import type { ConfirmationResponseDto, FieldProvenanceDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { APP_NS } from '../../i18n/resources'
import { server } from '../../test-msw-server'
import { ConfirmationScreen } from './ConfirmationScreen'
import { fieldLabelText, instanceText, valueText } from './confirmationText'

const i18n = createAppI18n('de')
const t = i18n.getFixedT('de', APP_NS)
const NBSP = ' '

const value = (over: Partial<FieldProvenanceDto>): FieldProvenanceDto => ({
  key: 'k',
  screen: 'lstb',
  instance: null,
  instanceLabel: null,
  version: 'v1',
  field: 'lohnsteuer',
  value: '1',
  provenance: { kind: 'assistent', name: 'Claude' },
  confirmed: false,
  proposal: null,
  ...over,
})

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onOpenScreen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <ConfirmationScreen year={2025} onBack={vi.fn()} onOpenScreen={onOpenScreen} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return onOpenScreen
}

afterEach(() => server.resetHandlers())

describe('field names on „Prüfen & bestätigen“ (MCP-5, MCP-25)', () => {
  it('names every field of every screen in the field catalogue, never by its id', () => {
    const unnamed = FIELD_CATALOG.filter((spec) => {
      const label = fieldLabelText(t, spec)
      return label === '' || label === spec.field || label === t('bestaetigung.unbenanntesFeld')
    }).map((spec) => `${spec.screen}.${spec.field}`)
    expect(unnamed).toEqual([])
    expect(new Set(FIELD_CATALOG.map((spec) => spec.screen))).toEqual(new Set(SCREENS))
  })
})

describe('values read as their field type (MCP-5)', () => {
  it.each([
    ['commute', 'oneWayKm', '25', '25'],
    ['interview', 'weg', '25', '25'],
    ['interview', 'spenden-betrag', '200', `200${NBSP}€`],
    ['lstb', 'lohnsteuer', '7000', `7.000${NBSP}€`],
    ['chLohnausweis', 'lohn', '85000', `85.000${NBSP}CHF`],
    ['stammdaten', 'geburtsdatum', '1990-05-01', '01.05.1990'],
    ['kind', 'domesticResidenceAllYear', 'true', 'Ja'],
    ['commute', 'workdays', '1,2,3,4,5', 'Mo, Di, Mi, Do, Fr'],
    ['kopplung', 'filingType', 'zusammen', 'Zusammenveranlagung'],
    ['kapital', 'inhaber', 'A', 'Mir'],
    ['vermietung', 'livingArea', '80', '80'],
    ['assessment', 'erstattung', '-300', `-300${NBSP}€`],
  ])('%s.%s „%s“ reads „%s“', (screenId, field, raw, expected) => {
    expect(valueText(t, { screen: screenId as FieldProvenanceDto['screen'], field }, raw).replace(/\s/g, NBSP)).toBe(expected.replace(/\s/g, NBSP))
  })

  it('names the record: the child, the rental object, with a fallback when it has no name', () => {
    expect(instanceText(t, { screen: 'kind', instance: 'c1', instanceLabel: 'Mia' })).toBe('Kind: Mia')
    expect(instanceText(t, { screen: 'vermietung', instance: 'o1', instanceLabel: null })).toBe('Mietobjekt (ohne Adresse)')
    expect(instanceText(t, { screen: 'lstb', instance: null, instanceLabel: null })).toBeNull()
  })

  it('shows two children apart on the screen', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () =>
        HttpResponse.json({
          annexes: [
            {
              annex: 'anlageKind',
              unconfirmed: 2,
              values: [
                value({ key: 'kind:c1.childcareEur', screen: 'kind', instance: 'c1', instanceLabel: 'Mia', field: 'childcareEur', value: '2400' }),
                value({ key: 'kind:c2.childcareEur', screen: 'kind', instance: 'c2', instanceLabel: 'Ben', field: 'childcareEur', value: '1800' }),
              ],
            },
          ],
          tasks: [],
        } satisfies ConfirmationResponseDto),
      ),
    )
    renderScreen()
    expect(await screen.findByText('Kind: Mia')).toBeTruthy()
    expect(screen.getByText('Kind: Ben')).toBeTruthy()
    expect(screen.getAllByText('Kinderbetreuungskosten')).toHaveLength(2)
  })
})

describe('„Einzeln ändern“ opens a real mask for every screen (WEB-18, H2-2)', () => {
  it('offers one way per mask of the Anlage and opens each with its field', async () => {
    const screens = SCREENS.filter((s) => s !== 'buchung')
    const first = screens.map((s) => FIELD_CATALOG.find((spec) => spec.screen === s)!)
    const byAnnex = new Map<string, FieldProvenanceDto[]>()
    for (const spec of first) {
      const instance = spec.perInstance ? 'i1' : undefined
      const key = provenanceKey(spec.screen, spec.field, instance)
      const annex = annexOf(key)
      byAnnex.set(annex, [...(byAnnex.get(annex) ?? []), value({ key, screen: spec.screen, instance: instance ?? null, field: spec.field })])
    }
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () =>
        HttpResponse.json({ annexes: [...byAnnex].map(([annex, values]) => ({ annex, unconfirmed: values.length, values })), tasks: [] }),
      ),
    )
    const onOpenScreen = renderScreen()
    await screen.findByText('Bescheid')

    for (const spec of first) {
      const annex = annexOf(provenanceKey(spec.screen, spec.field, spec.perInstance ? 'i1' : undefined))
      fireEvent.click(screen.getByTestId(`aendern-${annex}-${spec.screen}`))
      expect(onOpenScreen).toHaveBeenLastCalledWith(spec.screen, spec.field)
    }
    expect(onOpenScreen).toHaveBeenCalledTimes(screens.length)
    // The Hauptvordruck holds several masks: each is named on its button.
    expect(screen.getByText('Ändern: Stammdaten')).toBeTruthy()
  })
})
