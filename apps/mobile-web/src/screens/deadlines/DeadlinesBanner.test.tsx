// Fristen-Banner (REQ-027, ticket 10.7; H5 of the 2026-11 UX review) — the Warnmodus renders a
// SOBER banner (Produkt-ADR-023: what happened, what to do, no punchline, never blaming the user),
// NEVER a tax status (ADR-0039: the missed frist stays `entwurf` + banner; `stufe: 'keine'` renders
// nothing). The dates come from the server (GET .../fristen) — the client clock plays no role. Whether
// the deadline binds at all comes from the interview answers (Pflicht- vs. Antragsveranlagung).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { Answers } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { DeadlinesBanner, Banner } from './DeadlinesBanner'
import { server } from '../../test-msw-server'
import type { DeadlinesResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2025
const DEADLINES_URL = `*/v1/steuerjahre/${TAX_YEAR}/fristen`

const MANDATORY: Answers = { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Ledig' }
const VOLUNTARY: Answers = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

function renderBanner(answers: Answers | null) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <DeadlinesBanner taxYear={TAX_YEAR} answers={answers} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function renderPure(dto: DeadlinesResponseDto, answers: Answers) {
  const i18n = createAppI18n('de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <Banner dto={dto} taxYear={TAX_YEAR} answers={answers} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

const SURCHARGE = { minimumRateEur: 25, percentPerMonth: 0.25 }

const WARNING: DeadlinesResponseDto = {
  filingDeadline: '2026-07-31',
  today: '2026-06-01',
  level: 'warnung',
  remainingDays: 60,
  lateFilingSurcharge: SURCHARGE,
}

// 14.11.2026: past the deadline, still within the 14 months of § 152 Abs. 2 Nr. 1 AO.
const EXPIRED: DeadlinesResponseDto = {
  filingDeadline: '2026-07-31',
  today: '2026-11-14',
  level: 'abgelaufen',
  remainingDays: -106,
  lateFilingSurcharge: SURCHARGE,
}

// 01.03.2027: the 14 months are over, the surcharge is mandatory.
const EXPIRED_MANDATORY: DeadlinesResponseDto = { ...EXPIRED, today: '2027-03-01', remainingDays: -213 }

describe('DeadlinesBanner (wired)', () => {
  it('renders nothing at stufe keine — the honest absence, not a permanent banner', async () => {
    server.use(
      http.get(DEADLINES_URL, () =>
        HttpResponse.json({ ...WARNING, level: 'keine', remainingDays: 279, today: '2025-10-25' }, { status: 200 }),
      ),
    )
    const { container } = renderBanner(MANDATORY)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('[data-testid^="fristen-banner"]')).toBeNull()
  })

  it('renders nothing while the answers are not known yet', async () => {
    server.use(http.get(DEADLINES_URL, () => HttpResponse.json(EXPIRED, { status: 200 })))
    const { container } = renderBanner(null)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(container.querySelector('[data-testid^="fristen-banner"]')).toBeNull()
  })

  it('before any answer: neutral, never the surcharge alarm', async () => {
    server.use(http.get(DEADLINES_URL, () => HttpResponse.json(EXPIRED, { status: 200 })))
    renderBanner({})

    expect(await screen.findByTestId('fristen-banner-unklar')).toBeTruthy()
    expect(screen.getByText('Ob du abgeben musst, klären wir mit deinen Antworten. Pflicht-Frist wäre der 31.07.2026.')).toBeTruthy()
    expect(screen.queryByText(/Verspätungszuschlag/)).toBeNull()
  })
})

describe('Banner (pure presentational)', () => {
  it('pflicht before the deadline: the existing sober reminder', () => {
    renderPure(WARNING, MANDATORY)
    expect(screen.getByTestId('fristen-banner-warnung')).toBeTruthy()
    expect(screen.getByText(/Abgabefrist: 31\.07\.2026 \(noch 60 Tage\)/)).toBeTruthy()
  })

  it('pflicht, deadline passed but within 14 months: the surcharge is at the tax office’s discretion', () => {
    renderPure(EXPIRED, MANDATORY)
    expect(screen.getByTestId('fristen-banner-abgelaufen')).toBeTruthy()
    expect(
      screen.getByText(
        'Die Frist 31.07.2026 ist vorbei. Das Finanzamt kann einen Verspätungszuschlag festsetzen — ab dem 01.03.2027 muss es das (mindestens 25 € je angefangenem Monat).',
      ),
    ).toBeTruthy()
  })

  it('pflicht after the 14-month mark: the mandatory wording', () => {
    renderPure(EXPIRED_MANDATORY, MANDATORY)
    expect(screen.getByTestId('fristen-banner-zuschlag')).toBeTruthy()
    expect(screen.getByText(/um 213 Tage überschritten/)).toBeTruthy()
    expect(screen.getByText(/Seit dem 01\.03\.2027 muss das Finanzamt/)).toBeTruthy()
  })

  it('freiwillig: calm, four years, no surcharge', () => {
    renderPure(EXPIRED, VOLUNTARY)
    expect(screen.getByTestId('fristen-banner-freiwillig')).toBeTruthy()
    expect(
      screen.getByText(
        'Freiwillige Erklärung: Du hast Zeit bis 31.12.2029 (31.12. des vierten Folgejahres). Je früher, desto früher kommt die Erstattung.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Verspätungszuschlag/)).toBeNull()
  })

  it('unklar (e.g. married): neutral with the would-be deadline', () => {
    renderPure(EXPIRED, { ...VOLUNTARY, familienstand: 'Verheiratet' })
    expect(screen.getByTestId('fristen-banner-unklar')).toBeTruthy()
    expect(screen.queryByText(/Verspätungszuschlag/)).toBeNull()
  })
})
