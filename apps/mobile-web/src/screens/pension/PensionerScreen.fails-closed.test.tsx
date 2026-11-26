// The Rente mask after WEB-28: a failed load writes nothing; typing after „Kann ich nicht lesen“ shows and saves
// the typed amount (WEB-13, UnclearableNumberField); an amount typed with thousands is read as such (WEB-46).
import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { PensionResponseDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { PensionerScreen } from './PensionerScreen'
import { renderWithQuery } from '../../../test/test-render'

const UNCLEAR: PensionResponseDto = {
  kind: 'GesetzlicheRente',
  jahresbetrag: { kind: 'unklar' },
  rentenbeginnJahr: { kind: 'offen' },
  alterBeiRentenbeginn: { kind: 'offen' },
  items: [],
  status: { kind: 'bestimmt', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0 },
} as PensionResponseDto

function renderPension(partnerName?: string) {
  return renderWithQuery(<PensionerScreen taxYear={2026} {...(partnerName ? { partnerName } : {})} />)
}

describe('Rente fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderPension()
    await expectFailsClosed(failing)
  })

  it('the same for the partner’s pension', async () => {
    const failing = failEveryRequest()
    renderPension('Büsra')
    await expectFailsClosed(failing)
  })
})

describe('typing after „Kann ich nicht lesen“ (WEB-13)', () => {
  it('shows the typed amount and saves it, thousands included', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get('*/v1/steuerjahre/2026/rente', () => HttpResponse.json(UNCLEAR)),
      http.put('*/v1/steuerjahre/2026/rente/jahresbetrag', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(UNCLEAR)
      }),
    )
    renderPension()
    const amount = (await screen.findByLabelText(/Jahresbetrag/)) as HTMLInputElement
    expect(amount.value).toBe('')
    fireEvent.change(amount, { target: { value: '18.240' } })
    expect(amount.value).toBe('18.240')
    fireEvent.blur(amount)
    await waitFor(() => expect(bodies).toEqual([{ kind: 'erfasst', value: 18240 }]))
  })
})
