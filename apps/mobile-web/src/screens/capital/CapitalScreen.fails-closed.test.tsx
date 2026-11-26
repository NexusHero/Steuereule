// The Kapital mask after WEB-28: a failed load writes nothing; a failed link load says why the owner question is
// missing instead of filing the depot under Person A silently (NM-15).
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { KapitalResponseDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { CapitalScreen } from './CapitalScreen'
import { renderWithQuery } from '../../../test/test-render'

const BASE: KapitalResponseDto = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
  requiredFields: ['kapitalertraege'],
  depot: { kind: 'deutscher-broker' },
  items: [],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0 },
  inhaber: null,
} as KapitalResponseDto

function renderCapital() {
  return renderWithQuery(<CapitalScreen taxYear={2026} />)
}

describe('Kapital fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderCapital()
    await expectFailsClosed(failing)
  })

  it('says the owner question is missing when the link does not load (NM-15)', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/kapital', () => HttpResponse.json(BASE)),
      http.get('*/v1/steuerjahre/2026/kopplung', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderCapital()
    expect(await screen.findByTestId('kapital-inhaber-ladefehler')).toBeTruthy()
  })
})
