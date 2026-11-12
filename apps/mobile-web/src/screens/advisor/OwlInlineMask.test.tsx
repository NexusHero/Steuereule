// #488: "Maske ansehen" on a draft of the interview opens the page the field belongs to.
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { useTheme } from '@steuereule/ui'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { InlineMaskView } from './OwlInlineMask'
import { makeStyles } from './OwlModeScreen.styles'

const YEAR = 2025

function Mask({ field }: { readonly field: string }) {
  const styles = makeStyles(useTheme())
  return <InlineMaskView screen="interview" field={field} taxYear={YEAR} onBack={vi.fn()} styles={styles} />
}

function open(field: string, answers: Record<string, string>) {
  server.use(
    http.get(`*/v1/steuerjahre/${YEAR}/interview`, () => HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
    http.get(`*/v1/steuerjahre/${YEAR - 1}/interview`, () => HttpResponse.json({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
  )
  return renderInApp(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Mask field={field} />
    </QueryClientProvider>,
  )
}

describe('the owl workbench opens the page of the field (#488)', () => {
  it('a draft for the amount of a move opens the page of life events, at the move', async () => {
    open('umzug-kosten', { dhf: 'Nein', umzug: 'Ja', 'umzug-kosten': '1800', abfindung: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein' })
    expect(await screen.findByTestId('katalog-option-umzug-Ja')).toBeTruthy()
    expect(screen.queryByTestId('katalog-option-spenden-Ja')).toBeNull()
  })

  it('a draft for a donation still opens the donations step', async () => {
    open('spenden-betrag', { spenden: 'Ja', 'spenden-betrag': '300', 'kv-pv': 'Nein', riester: 'Nein' })
    expect(await screen.findByTestId('katalog-option-spenden-Ja')).toBeTruthy()
  })

  it('a field no page asks says where it lives instead of showing a wrong page', async () => {
    open('gibt-es-nicht', {})
    expect((await screen.findByTestId('eule-inline-mask-unplaced')).textContent).toContain('Interview')
  })
})
