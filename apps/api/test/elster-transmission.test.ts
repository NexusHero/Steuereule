// ADR-0101 §17, §22: the E-Bilanz goes to ELSTER through the operator's ERiC sidecar, or the app says what is missing.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { elsterTransmissionConfig, missingForTransmission, transmitEBilanz } from '../src/business/elster-transmission.js'

const CLI = fileURLToPath(new URL('./fixtures/fake-eric-cli.mjs', import.meta.url))
const READY = { ELSTER_TRANSMISSION_ENABLED: 'true', ELSTER_ERIC_CLI: CLI, ELSTER_CERT_PATH: '/run/secrets/elster.pfx', ELSTER_CERT_PIN: '123456', ELSTER_HERSTELLER_ID: '74931' }
const XBRL = '<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"/>'

describe('E-Bilanz transmission', () => {
  it('is off by default and names every missing piece', () => {
    expect(missingForTransmission(elsterTransmissionConfig({}))).toEqual(['ELSTER_TRANSMISSION_ENABLED', 'ELSTER_ERIC_CLI', 'ELSTER_CERT_PATH', 'ELSTER_CERT_PIN', 'ELSTER_HERSTELLER_ID'])
  })

  it('says nicht_eingerichtet without the setup, and never runs anything', async () => {
    await expect(transmitEBilanz(XBRL, 'senden', elsterTransmissionConfig({}))).resolves.toMatchObject({ status: 'nicht_eingerichtet' })
  })

  it('validates and sends through the sidecar: XBRL on stdin, the PIN only in its environment', async () => {
    const config = elsterTransmissionConfig(READY)
    await expect(transmitEBilanz(XBRL, 'validieren', config)).resolves.toEqual({ status: 'ok', mode: 'validieren', ticket: null, protocol: 'plausibel' })
    await expect(transmitEBilanz(XBRL, 'senden', config)).resolves.toEqual({ status: 'ok', mode: 'senden', ticket: 'TK-1', protocol: 'übermittelt' })
  })

  it('passes the refusal through', async () => {
    await expect(transmitEBilanz(XBRL, 'senden', elsterTransmissionConfig({ ...READY, ELSTER_HERSTELLER_ID: '1' }))).resolves.toEqual({ status: 'abgelehnt', messages: ['Vertrag verletzt'] })
  })
})
