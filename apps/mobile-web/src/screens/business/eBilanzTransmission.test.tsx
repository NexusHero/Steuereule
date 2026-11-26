// ADR-0101 §17, §22: the E-Bilanz is sent only where the operator set up ERiC; a refusal shows ERiC's messages.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { BASE_URL, renderBusiness, useBusinessDefaults } from './businessTestKit'
import { confirmAction } from '../../../test/test-confirm'

function setUp(ready: boolean, answer: Record<string, unknown> = { status: 'ok', mode: 'senden', ticket: 'TK-9', protocol: null }) {
  useBusinessDefaults()
  server.use(
    http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: [] })),
    http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '<x/>', transmitted: false, transmissionReady: ready, note: 'Vorschau' })),
    http.post(`${BASE_URL}/e-bilanz/uebermittlung`, () => HttpResponse.json(answer)),
  )
}

describe('E-Bilanz to ELSTER', () => {
  it('offers no sending while the server is not set up', async () => {
    setUp(false)
    renderBusiness('export')
    await screen.findByTestId('ebilanz-datei')
    expect(screen.queryByTestId('ebilanz-senden')).toBeNull()
  })

  it('sends and shows the transfer ticket', async () => {
    setUp(true)
    renderBusiness('export')
    fireEvent.click(await screen.findByTestId('ebilanz-senden'))
    confirmAction('eBilanzSend')
    expect((await screen.findByTestId('ebilanz-ok')).textContent).toContain('TK-9')
  })

  it('shows ERiC’s messages on a refusal', async () => {
    setUp(true, { status: 'abgelehnt', messages: ['Pflichtfeld fehlt'] })
    renderBusiness('export')
    fireEvent.click(await screen.findByTestId('ebilanz-pruefen'))
    expect((await screen.findByTestId('ebilanz-abgelehnt')).textContent).toContain('Pflichtfeld fehlt')
  })
})
