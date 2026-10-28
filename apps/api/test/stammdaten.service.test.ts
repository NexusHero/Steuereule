// ADR-0050 — Erklärungs-Stammdaten against an in-memory repository (ADR-0004). The
// ciphertext-at-rest and HTTP proofs are in test/acceptance/stammdaten.test.ts.
import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import type { StammdatenRecord, StammdatenRepository } from '../src/stammdaten/stammdaten.repository.js'
import { StammdatenService } from '../src/stammdaten/stammdaten.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

class FakeStammdatenRepository implements StammdatenRepository {
  rows = new Map<string, StammdatenRecord>()
  async findByUserId(userId: string) {
    return this.rows.get(userId) ?? null
  }
  async speichere(userId: string, record: StammdatenRecord) {
    this.rows.set(userId, record)
    return record
  }
}

const VOLLSTAENDIG = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  plz: '01067',
  wohnort: 'Dresden',
  religion: 'VD',
  religionEinwilligung: true,
  familienstand: 'ledig',
  iban: 'de89 3704 0044 0532 0130 00',
  finanzamt: 'Dresden-Nord',
}

describe('StammdatenService', () => {
  let repository: FakeStammdatenRepository
  let audit: FakeAuditRepository
  let service: StammdatenService

  beforeEach(() => {
    repository = new FakeStammdatenRepository()
    audit = new FakeAuditRepository()
    service = new StammdatenService(repository, new AuditService(audit))
  })

  it('nothing saved: all null, every required field listed as fehlend, no READ audit entry', async () => {
    const stand = await service.lese('u1')
    expect(stand.iban).toBeNull()
    expect(stand.fehlend).toEqual([
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
    const stand = await service.speichere('u1', VOLLSTAENDIG)
    expect(stand.fehlend).toEqual([])
    expect(stand.iban).toBe('DE89370400440532013000')
  })

  it('Art. 9 DSGVO: a religion without explicit consent is refused and nothing is written', async () => {
    await expect(service.speichere('u1', { ...VOLLSTAENDIG, religionEinwilligung: false })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(repository.rows.size).toBe(0)
  })

  it('records when consent was given, keeps it while the religion is unchanged, renews it on change', async () => {
    await service.speichere('u1', VOLLSTAENDIG, new Date('2026-01-01'))
    await service.speichere('u1', VOLLSTAENDIG, new Date('2026-02-01'))
    expect(repository.rows.get('u1')!.religionEinwilligungAm).toEqual(new Date('2026-01-01'))

    await service.speichere('u1', { ...VOLLSTAENDIG, religion: 'EV' }, new Date('2026-03-01'))
    expect(repository.rows.get('u1')!.religionEinwilligungAm).toEqual(new Date('2026-03-01'))
  })

  it('removing the religion also drops the consent timestamp', async () => {
    await service.speichere('u1', VOLLSTAENDIG)
    await service.speichere('u1', { ...VOLLSTAENDIG, religion: null })
    expect(repository.rows.get('u1')!.religionEinwilligungAm).toBeNull()
  })

  it('PUT replaces: an omitted field is null afterwards, never a stale value; ledig carries no "seit" date', async () => {
    await service.speichere('u1', { ...VOLLSTAENDIG, telefon: '0351 1', familienstandSeit: '2020-01-01' })
    const stand = await service.speichere('u1', VOLLSTAENDIG)
    expect(stand.telefon).toBeNull()
    expect(stand.familienstandSeit).toBeNull()
  })

  it('a read of saved data is audited (REQ-004)', async () => {
    await service.speichere('u1', VOLLSTAENDIG)
    await service.lese('u1')
    expect(audit.all()).toEqual([expect.objectContaining({ action: 'READ', resource: 'stammdaten' })])
  })
})
