// ADR-0091: the one-time consent that personal data may go to the owl's language model.
import { OWL_PERSONAL_DATA_CONSENT_VERSION } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { PersonalDataConsentService } from '../src/owl-mode/personal-data-consent.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakePersonalDataConsentRepository } from './fakes/fake-personal-data-consent.repository.js'

function setup() {
  const repo = new FakePersonalDataConsentRepository()
  const audit = new FakeAuditRepository()
  return { repo, audit, service: new PersonalDataConsentService(repo, new AuditService(audit)) }
}

describe('consent to personal data for the owl (ADR-0091)', () => {
  it('is not given until the user gives it', async () => {
    const { service } = setup()
    expect(await service.hasConsent('u1')).toBe(false)
    expect(await service.state('u1')).toEqual({ granted: false, version: OWL_PERSONAL_DATA_CONSENT_VERSION, grantedAt: null })
  })

  it('records the version and the time, and writes an audit row', async () => {
    const { service, audit } = setup()
    const now = new Date('2026-11-14T10:00:00Z')
    const state = await service.set('u1', true, now)
    expect(state).toEqual({ granted: true, version: OWL_PERSONAL_DATA_CONSENT_VERSION, grantedAt: now.toISOString() })
    expect(await service.hasConsent('u1')).toBe(true)
    expect(audit.all()).toContainEqual(expect.objectContaining({ userId: 'u1', action: 'WRITE', resource: 'eulen_personendaten_einwilligung' }))
  })

  it('is revoked with immediate effect, audited too', async () => {
    const { service, audit } = setup()
    await service.set('u1', true)
    const state = await service.set('u1', false)
    expect(state.granted).toBe(false)
    expect(await service.hasConsent('u1')).toBe(false)
    expect(audit.all().filter((row) => row.resource === 'eulen_personendaten_einwilligung_widerruf')).toHaveLength(1)
  })

  it('does not count a consent to an older text', async () => {
    const { service, repo } = setup()
    await repo.grant('u1', '2020-01-01', new Date())
    expect(await service.hasConsent('u1')).toBe(false)
  })

  it('is per user', async () => {
    const { service } = setup()
    await service.set('u1', true)
    expect(await service.hasConsent('u2')).toBe(false)
  })
})
