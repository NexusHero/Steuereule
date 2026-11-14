import { describe, expect, it } from 'vitest'
import { ChildrenService } from '../src/children/children.service.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'

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
      firstName: 'Lina',
      lastName: 'Mustermann',
      geburtsdatum: '2016-05-10',
      taxId: '12345678901',
      childBenefitClaimEur: '3000',
    })
    expect(res1.count).toBe(1)
    expect(res1.childBenefitSum).toBe(3000)
    expect(res1.totalAllowance).toBe(9600)
    expect(res1.kinder[0]!.firstName).toBe('Lina')

    const res2 = await service.create(userId, year, {
      firstName: 'Noah',
      lastName: 'Mustermann',
      geburtsdatum: '2019-09-15',
    })
    expect(res2.count).toBe(2)
    expect(res2.childBenefitSum).toBe(3000 + 255 * 12)
    expect(res2.totalAllowance).toBe(2 * 9600)

    const updated = await service.update(userId, year, res2.kinder[1]!.id, {
      firstName: 'Noah-Elias',
    })
    expect(updated.kinder[1]!.firstName).toBe('Noah-Elias')

    const afterDelete = await service.delete(userId, year, res1.kinder[0]!.id)
    expect(afterDelete.count).toBe(1)
    expect(afterDelete.kinder[0]!.firstName).toBe('Noah-Elias')
  })

  it('rejects a birth date in the future of the tax year', async () => {
    const repo = new FakeChildRepository()
    const audit = new FakeAuditService()
    const service = new ChildrenService(repo, audit as any)

    await expect(
      service.create('user-1', 2025, {
        firstName: 'Baby',
        lastName: 'Zukunft',
        geburtsdatum: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'GEBURTSDATUM_INVALID' })
  })

  it('stores the Anlage-Kind facts (Kindschaftsverhältnis, Familienkasse, Wohnsitz) and returns them', async () => {
    const service = new ChildrenService(new FakeChildRepository(), new FakeAuditService() as never)
    const { kinder } = await service.create('user-1', 2025, { firstName: 'Lina', lastName: 'M', geburtsdatum: '2016-05-10' })
    expect(kinder[0]).toMatchObject({ kinship: null, familyBenefitsOffice: null, domesticResidenceAllYear: null })

    const res = await service.update('user-1', 2025, kinder[0]!.id, {
      kinship: '1',
      kinshipB: '1',
      familyBenefitsOffice: 'Familienkasse Sachsen',
      domesticResidenceAllYear: true,
    })
    expect(res.kinder[0]).toMatchObject({
      firstName: 'Lina',
      kinship: '1',
      kinshipB: '1',
      familyBenefitsOffice: 'Familienkasse Sachsen',
      domesticResidenceAllYear: true,
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
    await service.create('user-mb', 2025, { firstName: 'Mia', lastName: 'Brenner', geburtsdatum: '2016-03-14' })
    const res = await service.create('user-mb', 2025, { firstName: 'Noah', lastName: 'Brenner', geburtsdatum: '2019-09-02' })

    expect(res.count).toBe(2)
    // 5.160 CHF / 2 = 2.580 CHF; 2.580 * 1.065 = 2.748 € per child
    // Statutory claim: 255 * 12 = 3.060 €
    // Difference: 3.060 - 2.748 = 312 €
    expect(res.kinder[0]).toMatchObject({
      firstName: 'Mia',
      swissFamilyAllowanceEur: '2748',
      differentialChildBenefitEur: '312',
      totalClaimEur: '3060',
    })
    expect(res.kinder[1]).toMatchObject({
      firstName: 'Noah',
      swissFamilyAllowanceEur: '2748',
      differentialChildBenefitEur: '312',
      totalClaimEur: '3060',
    })
    expect(res.swissFamilyAllowanceSum).toBe(5496)
    expect(res.differentialChildBenefitSum).toBe(624)
    expect(res.childBenefitSum).toBe(6120)
    expect(res.totalAllowance).toBe(19200)
  })

  it('leaves Swiss family allowance open when exchange rate is missing (ADR-032, no 1.0 fallback)', async () => {
    const repo = new FakeChildRepository()
    const audit = new FakeAuditService()
    const chRepo = new FakeChSalaryCertificateRepository()

    // Swiss salary statement has family allowance, but NO exchange rate is set
    await chRepo.setNGre('user-mb', 2025, {
      arbeitgeberName: 'Rheinpharma AG',
      familienzulagenChf: '5160',
    } as any)

    const service = new ChildrenService(repo, audit as any, chRepo)

    await service.create('user-mb', 2025, { firstName: 'Mia', lastName: 'Brenner', geburtsdatum: '2016-03-14' })
    const res = await service.create('user-mb', 2025, { firstName: 'Noah', lastName: 'Brenner', geburtsdatum: '2019-09-02' })

    expect(res.count).toBe(2)
    // Without an exchange rate, CHF is never converted to EUR with a guessed 1.0 rate
    expect(res.kinder[0]!.swissFamilyAllowanceEur).toBeNull()
    expect(res.kinder[0]!.differentialChildBenefitEur).toBeNull()
    expect(res.kinder[1]!.swissFamilyAllowanceEur).toBeNull()
    expect(res.kinder[1]!.differentialChildBenefitEur).toBeNull()
    expect(res.swissFamilyAllowanceSum).toBe(0)
    expect(res.differentialChildBenefitSum).toBe(0)
  })
})

describe('ChildrenService — the Swiss Kinderzulage when both parents are Grenzgänger (ADR-0088)', () => {
  const swiss = (userId: string, allowancesChf: string) =>
    ({
      userId, taxYear: 2025, fields: {} as never, bemerkungen: null, saeule3aChf: null, krankenkasseChf: null,
      exchangeRateMonth: '2025', exchangeRateValue: 1.065, exchangeRateMode: 'jahresdurchschnitt', exchangeRateReceiptId: null,
      nGre: { familienzulagenChf: allowancesChf } as never,
    }) as never
  async function setup(aChf: string, bChf: string) {
    const repo = new FakeChildRepository()
    const ch = new FakeChSalaryCertificateRepository()
    ch.seed(swiss('a', aChf))
    ch.seed(swiss('b', bChf))
    const link = new FakeLinkRepository()
    await link.upsert('a', 2025, { personBUserId: 'b', filingType: 'zusammen' })
    const service = new ChildrenService(repo, new FakeAuditService() as never, ch, link)
    return { repo, service }
  }

  it('takes B’s allowances when the user’s Lohnausweis holds 0, and shows the Differenzkindergeld', async () => {
    const { repo, service } = await setup('0', '5160')
    await repo.create('a', 2025, { firstName: 'Lio', lastName: 'S', geburtsdatum: '2019-04-03' })
    await repo.create('a', 2025, { firstName: 'Ida', lastName: 'S', geburtsdatum: '2021-08-21' })
    const res = await service.list('a', 2025)
    // 5.160 CHF at 1,065 = 5.495 €, half each; 3.060 € Kindergeld a child less 2.748 € = 312 €.
    expect(res.kinder.map((k) => k.swissFamilyAllowanceEur)).toEqual(['2748', '2748'])
    expect(res.kinder.map((k) => k.differentialChildBenefitEur)).toEqual(['312', '312'])
    // A share of B's allowances, not entered for the child: the mask offers it but does not store it.
    expect(res.kinder.map((k) => k.swissFamilyAllowanceDerived)).toEqual([true, true])
  })

  it('keeps each parent’s allowances to the child they are paid for', async () => {
    const { repo, service } = await setup('2580', '2580')
    await repo.create('a', 2025, { firstName: 'Lio', lastName: 'S', geburtsdatum: '2019-04-03', swissFamilyAllowancePayer: 'A' } as never)
    await repo.create('a', 2025, { firstName: 'Ida', lastName: 'S', geburtsdatum: '2021-08-21', swissFamilyAllowancePayer: 'B' } as never)
    const res = await service.list('a', 2025)
    expect(res.kinder.map((k) => [k.swissFamilyAllowancePayer, k.swissFamilyAllowanceEur])).toEqual([['A', '2748'], ['B', '2748']])
  })
})
