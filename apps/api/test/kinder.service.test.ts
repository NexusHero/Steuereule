import { describe, expect, it } from 'vitest'
import { KinderService } from '../src/kinder/kinder.service.js'
import { FakeKindRepository } from './fakes/fake-kind.repository.js'

class FakeAuditService {
  readonly logs: unknown[] = []
  append(data: unknown): Promise<void> {
    this.logs.push(data)
    return Promise.resolve()
  }
}

describe('KinderService', () => {
  it('creates and lists children, computing the Freibetrag and Kindergeld sum', async () => {
    const repo = new FakeKindRepository()
    const audit = new FakeAuditService()
    const service = new KinderService(repo, audit as any)

    const userId = 'user-1'
    const jahr = 2025

    const res1 = await service.create(userId, jahr, {
      vorname: 'Lina',
      nachname: 'Mustermann',
      geburtsdatum: '2016-05-10',
      idnr: '12345678901',
      kindergeldAnspruchEur: '3000',
    })
    expect(res1.anzahl).toBe(1)
    expect(res1.kindergeldSumme).toBe(3000)
    expect(res1.freibetragGesamt).toBe(9540)
    expect(res1.kinder[0]!.vorname).toBe('Lina')

    const res2 = await service.create(userId, jahr, {
      vorname: 'Noah',
      nachname: 'Mustermann',
      geburtsdatum: '2019-09-15',
    })
    expect(res2.anzahl).toBe(2)
    // 3000 + 250*12 (3000) = 6000
    expect(res2.kindergeldSumme).toBe(6000)
    expect(res2.freibetragGesamt).toBe(19080)

    const updated = await service.update(userId, jahr, res2.kinder[1]!.id, {
      vorname: 'Noah-Elias',
    })
    expect(updated.kinder[1]!.vorname).toBe('Noah-Elias')

    const afterDelete = await service.delete(userId, jahr, res1.kinder[0]!.id)
    expect(afterDelete.anzahl).toBe(1)
    expect(afterDelete.kinder[0]!.vorname).toBe('Noah-Elias')
  })

  it('rejects a birth date in the future of the tax year', async () => {
    const repo = new FakeKindRepository()
    const audit = new FakeAuditService()
    const service = new KinderService(repo, audit as any)

    await expect(
      service.create('user-1', 2025, {
        vorname: 'Baby',
        nachname: 'Zukunft',
        geburtsdatum: '2026-01-01',
      }),
    ).rejects.toThrow(/Ungültiges Geburtsdatum/)
  })
})
