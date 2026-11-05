import { describe, expect, it } from 'vitest'
import { KinderService } from '../src/kinder/kinder.service.js'
import { FakeKindRepository } from './fakes/fake-kind.repository.js'
import { FakeChLohnausweisRepository } from './fakes/fake-ch-lohnausweis.repository.js'

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
    expect(res1.freibetragGesamt).toBe(9600)
    expect(res1.kinder[0]!.vorname).toBe('Lina')

    const res2 = await service.create(userId, jahr, {
      vorname: 'Noah',
      nachname: 'Mustermann',
      geburtsdatum: '2019-09-15',
    })
    expect(res2.anzahl).toBe(2)
    expect(res2.kindergeldSumme).toBe(3000 + 255 * 12)
    expect(res2.freibetragGesamt).toBe(2 * 9600)

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
    ).rejects.toMatchObject({ code: 'GEBURTSDATUM_INVALID' })
  })

  it('stores the Anlage-Kind facts (Kindschaftsverhältnis, Familienkasse, Wohnsitz) and returns them', async () => {
    const service = new KinderService(new FakeKindRepository(), new FakeAuditService() as never)
    const { kinder } = await service.create('user-1', 2025, { vorname: 'Lina', nachname: 'M', geburtsdatum: '2016-05-10' })
    expect(kinder[0]).toMatchObject({ kindschaftsverhaeltnis: null, familienkasse: null, wohnsitzInlandGanzjaehrig: null })

    const res = await service.update('user-1', 2025, kinder[0]!.id, {
      kindschaftsverhaeltnis: '1',
      kindschaftsverhaeltnisB: '1',
      familienkasse: 'Familienkasse Sachsen',
      wohnsitzInlandGanzjaehrig: true,
    })
    expect(res.kinder[0]).toMatchObject({
      vorname: 'Lina',
      kindschaftsverhaeltnis: '1',
      kindschaftsverhaeltnisB: '1',
      familienkasse: 'Familienkasse Sachsen',
      wohnsitzInlandGanzjaehrig: true,
    })
  })

  it('adopts Swiss family allowance from Lohnausweis and calculates Differenzkindergeld (ADR-0054, #414)', async () => {
    const repo = new FakeKindRepository()
    const audit = new FakeAuditService()
    const chRepo = new FakeChLohnausweisRepository()

    // Markus Brenner: 5.160 CHF Familienzulagen, rate 1.065
    await chRepo.setNGre('user-mb', 2025, {
      arbeitgeberName: 'Rheinpharma AG',
      familienzulagenChf: '5160',
    } as any)
    await chRepo.setWechselkurs('user-mb', 2025, {
      monat: '2025-12',
      kurs: 1.065,
      modus: 'amtlich',
    })

    const service = new KinderService(repo, audit as any, chRepo)

    // Add Mia and Noah (2 children)
    await service.create('user-mb', 2025, { vorname: 'Mia', nachname: 'Brenner', geburtsdatum: '2016-03-14' })
    const res = await service.create('user-mb', 2025, { vorname: 'Noah', nachname: 'Brenner', geburtsdatum: '2019-09-02' })

    expect(res.anzahl).toBe(2)
    // 5.160 CHF / 2 = 2.580 CHF; 2.580 * 1.065 = 2.748 € per child
    // Statutory claim: 255 * 12 = 3.060 €
    // Difference: 3.060 - 2.748 = 312 €
    expect(res.kinder[0]).toMatchObject({
      vorname: 'Mia',
      schweizerKinderzulageEur: '2748',
      differenzkindergeldEur: '312',
      gesamtanspruchEur: '3060',
    })
    expect(res.kinder[1]).toMatchObject({
      vorname: 'Noah',
      schweizerKinderzulageEur: '2748',
      differenzkindergeldEur: '312',
      gesamtanspruchEur: '3060',
    })
    expect(res.schweizerKinderzulageSumme).toBe(5496)
    expect(res.differenzkindergeldSumme).toBe(624)
    expect(res.kindergeldSumme).toBe(6120)
    expect(res.freibetragGesamt).toBe(19200)
  })
})
