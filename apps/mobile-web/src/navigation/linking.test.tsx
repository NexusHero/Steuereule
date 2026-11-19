import { describe, expect, it } from 'vitest'
import { getPathFromState, getStateFromPath } from '@react-navigation/native'
import { formatDocumentTitle, linking } from './linking'

describe('navigation linking config (#443 slice 1)', () => {
  const cases: readonly { readonly path: string; readonly expectedPath?: string }[] = [
    { path: '/app' },
    { path: '/app/steuerjahr/2025/interview' },
    { path: '/app/konto-wand' },
    { path: '/app/steuerjahr/2025/lstb' },
    { path: '/app/steuerjahr/2025/rente' },
    { path: '/app/steuerjahr/2025/schweiz' },
    { path: '/app/steuerjahr/2025/katalog/lebenslagen' },
    { path: '/app/steuerjahr/2025/katalog/einkuenfte' },
    { path: '/app/steuerjahr/2025/katalog/sonderausgaben' },
    { path: '/app/steuerjahr/2025/katalog/lebenslagen?revisit=1' },
    { path: '/app/steuerjahr/2025/arbeitstage' },
    { path: '/app/steuerjahr/2025/abgabe' },
    { path: '/app/steuerjahr/2025/plausibilitaet' },
    { path: '/app/steuerjahr/2025/veranlagungsvergleich' },
    { path: '/app/steuerjahr/2025/bescheid' },
    { path: '/app/steuerjahr/2025/kapital' },
    { path: '/app/steuerjahr/2025/vermietung' },
    { path: '/app/steuerjahr/2025/kinder' },
    { path: '/app/steuerjahr/2025/stammdaten' },
    { path: '/app/steuerjahr/2025/partner/lstb' },
    { path: '/app/steuerjahr/2025/partner/arbeitsweg' },
    { path: '/app/eule' },
    { path: '/app/belege' },
    { path: '/app/verlauf' },
    { path: '/app/steuerjahre', expectedPath: '/app/verlauf' },
    { path: '/app/jahre', expectedPath: '/app/verlauf' },
    { path: '/app/erklaerungen', expectedPath: '/app/verlauf' },
    { path: '/app/verlauf/2024' },
    { path: '/app/verlauf/entwicklung' },
    { path: '/app/verlauf/unterlagen' },
    { path: '/app/profil' },
    { path: '/app/profil/datenschutz' },
    { path: '/app/profil/sicherheit' },
    { path: '/app/profil/stammdaten' },
    { path: '/app/steuerjahr/2025/ausdruck' },
    { path: '/app/steuerjahr/2025/bestaetigung' },
  ]

  it.each(cases)('round-trips $path cleanly', ({ path, expectedPath }) => {
    const state = getStateFromPath(path, linking.config)
    expect(state).toBeDefined()
    const roundTripped = getPathFromState(state!, linking.config)
    expect(roundTripped).toBe(expectedPath ?? path)
  })

  it('parses year as a number on CockpitStack routes and omits ?revisit= on Catalog when revisit is omitted', () => {
    const lstbState = getStateFromPath('/app/steuerjahr/2025/lstb', linking.config)
    const appRoute = lstbState?.routes[0]
    const tabRoute = appRoute?.state?.routes[0]
    const lstbRoute = tabRoute?.state?.routes[1]
    expect(lstbRoute?.name).toBe('Lstb')
    expect(lstbRoute?.params).toEqual({ year: 2025 })

    const path = getPathFromState(
      {
        routes: [
          {
            name: 'App',
            state: {
              routes: [
                {
                  name: 'Cockpit',
                  state: {
                    index: 1,
                    routes: [
                      { name: 'CockpitHome' },
                      { name: 'Catalog', params: { year: 2025, entry: 'einkuenfte' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      linking.config,
    )
    expect(path).toBe('/app/steuerjahr/2025/katalog/einkuenfte')
  })

  it('maps /app/steuerjahr/2025/ausdruck and /app/steuerjahr/2025/bestaetigung to root screens', () => {
    const printout = getStateFromPath('/app/steuerjahr/2025/ausdruck', linking.config)
    expect(printout?.routes[0]?.name).toBe('Printout')

    const confirmation = getStateFromPath('/app/steuerjahr/2025/bestaetigung', linking.config)
    expect(confirmation?.routes[0]?.name).toBe('Confirmation')
  })

  it('formats human-readable browser tab titles instead of raw route keys like CockpitHome', () => {
    expect(formatDocumentTitle('CockpitHome')).toBe('SteuerEule — Cockpit')
    expect(formatDocumentTitle('CrossBorder')).toBe('SteuerEule — Grenzgänger Schweiz')
    expect(formatDocumentTitle('Owl')).toBe('SteuerEule — Eulen-Modus')
    expect(formatDocumentTitle('Receipts')).toBe('SteuerEule — Belege')
    expect(formatDocumentTitle(undefined)).toBe('SteuerEule')
  })

  it('opens a year of the Verlauf with the year as a number above the timeline, and the development by its own name', () => {
    const tabOf = (path: string) => getStateFromPath(path, linking.config)?.routes[0]?.state?.routes.find((r) => r.name === 'History')
    const year = tabOf('/app/verlauf/2024')
    expect(year?.name).toBe('History')
    expect(year?.state?.routes.map((r) => r.name)).toEqual(['HistoryHome', 'HistoryYear'])
    expect(year?.state?.routes[1]?.params).toEqual({ year: 2024 })
    expect(tabOf('/app/verlauf/entwicklung')?.state?.routes.map((r) => r.name)).toEqual(['HistoryHome', 'HistoryDevelopment'])
    expect(formatDocumentTitle('HistoryYear')).toBe('SteuerEule — Verlauf eines Jahres')
    // ADR-0099 §9: the Unterlagen by their own name, not read as a year.
    expect(tabOf('/app/verlauf/unterlagen')?.state?.routes.map((r) => r.name)).toEqual(['HistoryHome', 'HistoryDocuments'])
    expect(formatDocumentTitle('HistoryDocuments')).toBe('SteuerEule — Unterlagen')
  })
})
