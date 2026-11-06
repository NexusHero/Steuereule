// ADR-0050 — Erklärungs-Stammdaten against an in-memory repository (ADR-0004). The
// ciphertext-at-rest and HTTP proofs are in test/acceptance/stammdaten.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import type { MasterDataRecord, MasterDataRepository } from '../src/master-data/master-data.repository.js'
import { MasterDataService } from '../src/master-data/master-data.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

class FakeMasterDataRepository implements MasterDataRepository {
  rows = new Map<string, MasterDataRecord>()
  async findByUserId(userId: string) {
    return this.rows.get(userId) ?? null
  }
  async save(userId: string, record: MasterDataRecord) {
    this.rows.set(userId, record)
    return record
  }
}

const COMPLETE = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  plz: '01067',
  wohnort: 'Dresden',
  religion: 'VD',
  religionConsent: true,
  familienstand: 'ledig',
  iban: 'de89 3704 0044 0532 0130 00',
  finanzamt: 'Dresden-Nord',
}

describe('StammdatenService', () => {
  let repository: FakeMasterDataRepository
  let audit: FakeAuditRepository
  let service: MasterDataService

  beforeEach(() => {
    repository = new FakeMasterDataRepository()
    audit = new FakeAuditRepository()
    service = new MasterDataService(repository, new AuditService(audit))
  })

  it('nothing saved: all null, every required field listed as fehlend, no READ audit entry', async () => {
    const status = await service.read('u1')
    expect(status.iban).toBeNull()
    expect(status.missing).toEqual([
      'geburtsdatum',
      'strasse',
      'hausnummer',
      'plz',
      'wohnort',
      'religion',
      'familienstand',
      'iban',
      'finanzamt',
    ])
    expect(audit.all()).toEqual([])
  })

  it('a complete record has nothing fehlend, and the IBAN is stored normalised', async () => {
    const status = await service.save('u1', COMPLETE)
    expect(status.missing).toEqual([])
    expect(status.iban).toBe('DE89370400440532013000')
  })

  it('Art. 9 DSGVO: a religion without explicit consent is refused and nothing is written', async () => {
    await expect(service.save('u1', { ...COMPLETE, religionConsent: false })).rejects.toMatchObject({
      code: 'RELIGION_CONSENT_REQUIRED',
    })
    expect(repository.rows.size).toBe(0)
  })

  it('records when consent was given, keeps it while the religion is unchanged, renews it on change', async () => {
    await service.save('u1', COMPLETE, new Date('2026-01-01'))
    await service.save('u1', COMPLETE, new Date('2026-02-01'))
    expect(repository.rows.get('u1')!.religionEinwilligungAm).toEqual(new Date('2026-01-01'))

    await service.save('u1', { ...COMPLETE, religion: 'EV' }, new Date('2026-03-01'))
    expect(repository.rows.get('u1')!.religionEinwilligungAm).toEqual(new Date('2026-03-01'))
  })

  it('removing the religion also drops the consent timestamp', async () => {
    await service.save('u1', COMPLETE)
    await service.save('u1', { ...COMPLETE, religion: null })
    expect(repository.rows.get('u1')!.religionEinwilligungAm).toBeNull()
  })

  it('PUT replaces: an omitted field is null afterwards, never a stale value; ledig carries no "seit" date', async () => {
    await service.save('u1', { ...COMPLETE, telefon: '0351 1', familienstandSeit: '2020-01-01' })
    const status = await service.save('u1', COMPLETE)
    expect(status.telefon).toBeNull()
    expect(status.familienstandSeit).toBeNull()
  })

  it('a read of saved data is audited (REQ-004)', async () => {
    await service.save('u1', COMPLETE)
    await service.read('u1')
    expect(audit.all()).toEqual([expect.objectContaining({ action: 'READ', resource: 'stammdaten' })])
  })
})
