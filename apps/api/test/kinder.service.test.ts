import { describe, expect, it } from 'vitest'
import { ChildrenService } from '../src/kinder/kinder.service.js'
import { FakeChildRepository } from './fakes/fake-kind.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-lohnausweis.repository.js'

class FakeAuditService {
  readonly logs: unknown[] = []
  append(data: unknown): Promise<void> {
    this.logs.push(data)
    return Promise.resolve()
  }
}

describe('KinderService', () => {
  it('creates and lists children, computing the Freibetrag and Kindergeld sum', async () => {
    const repo = new FakeChildRepository()
    const audit = new FakeAuditService()
    const service = new ChildrenService(repo, audit as any)

    const userId = 'user-1'
    const year = 2025

    const res1 = await service.create(userId, year, {
      vorname: 'Lina',
      nachname: 'Mustermann',
      geburtsdatum: '2016-05-10',
      idnr: '12345678901',
      kindergeldAnspruchEur: '3000',
    })
    expect(res1.count).toBe(1)
    expect(res1.childBenefitSum).toBe(3000)
    expect(res1.totalAllowance).toBe(9600)
    expect(res1.kinder[0]!.vorname).toBe('Lina')

    const res2 = await service.create(userId, year, {
      vorname: 'Noah',
      nachname: 'Mustermann',
      geburtsdatum: '2019-09-15',
    })
    expect(res2.count).toBe(2)
    expect(res2.childBenefitSum).toBe(3000 + 255 * 12)
    expect(res2.totalAllowance).toBe(2 * 9600)

    const updated = await service.update(userId, year, res2.kinder[1]!.id, {
      vorname: 'Noah-Elias',
    })
    expect(updated.kinder[1]!.vorname).toBe('Noah-Elias')

    const afterDelete = await service.delete(userId, year, res1.kinder[0]!.id)
    expect(afterDelete.count).toBe(1)
    expect(afterDelete.kinder[0]!.vorname).toBe('Noah-Elias')
  })

  it('rejects a birth date in the future of the tax year', async () => {
    const repo = new FakeChildRepository()
    const audit = new FakeAuditService()
    const service = new ChildrenService(repo, audit as any)

    await expect(
      service.create('user-1', 2025, {
        vorname: 'Baby',
        nachname: 'Zukunft',
        geburtsdatum: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'GEBURTSDATUM_INVALID' })
  })

  it('stores the Anlage-Kind facts (Kindschaftsverhältnis, Familienkasse, Wohnsitz) and returns them', async () => {
    const service = new ChildrenService(new FakeChildRepository(), new FakeAuditService() as never)
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
    const repo = new FakeChildRepository()
    const audit = new FakeAuditService()
    const chRepo = new FakeChSalaryCertificateRepository()

    // Markus Brenner: 5.160 CHF Familienzulagen, rate 1.065
    await chRepo.setNGre('user-mb', 2025, {
      arbeitgeberName: 'Rheinpharma AG',
      familienzulagenChf: '5160',
    } as any)
    await chRepo.setExchangeRate('user-mb', 2025, {
      month: '2025-12',
      rate: 1.065,
      mode: 'amtlich',
    })

    const service = new ChildrenService(repo, audit as any, chRepo)

    // Add Mia and Noah (2 children)
    await service.create('user-mb', 2025, { vorname: 'Mia', nachname: 'Brenner', geburtsdatum: '2016-03-14' })
    const res = await service.create('user-mb', 2025, { vorname: 'Noah', nachname: 'Brenner', geburtsdatum: '2019-09-02' })

    expect(res.count).toBe(2)
    // 5.160 CHF / 2 = 2.580 CHF; 2.580 * 1.065 = 2.748 € per child
    // Statutory claim: 255 * 12 = 3.060 €
    // Difference: 3.060 - 2.748 = 312 €
    expect(res.kinder[0]).toMatchObject({
      vorname: 'Mia',
      schweizerKinderzulageEur: '2748',
      differentialChildBenefitEur: '312',
      totalClaimEur: '3060',
    })
    expect(res.kinder[1]).toMatchObject({
      vorname: 'Noah',
      schweizerKinderzulageEur: '2748',
      differentialChildBenefitEur: '312',
      totalClaimEur: '3060',
    })
    expect(res.swissFamilyAllowanceSum).toBe(5496)
    expect(res.differentialChildBenefitSum).toBe(624)
    expect(res.childBenefitSum).toBe(6120)
    expect(res.totalAllowance).toBe(19200)
  })
})
