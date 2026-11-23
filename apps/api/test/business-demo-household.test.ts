// The demo seed's household (ADR-0101) runs through the real service: every booking passes the core,
// the chains stay intact, 2024 is a loss year of the Gewerbe and 2025 a profit above the Freibetrag.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { composeBusinessService } from '../src/business/business.composition.js'
import { DEMO_ANSWERS, seedDemoHousehold } from '../src/business/demo-household.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

const A1 = { person: 'A', business: 1 } as const
const B1 = { person: 'B', business: 1 } as const

describe('demo household of seed:selbststaendig', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  beforeEach(() => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('books both years, keeps every chain intact and is safe to run twice', async () => {
    const repository = new FakeBusinessRepository()
    const interview = new FakeInterviewAnswerRepository()
    for (const year of [2024, 2025]) interview.seed('u', year, { ...DEMO_ANSWERS })
    const business = composeBusinessService(repository, interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory())

    const { loss2024Eur } = await seedDemoHousehold(business, repository, 'u')
    expect(loss2024Eur).toBeGreaterThan(0)
    for (const [year, person] of [[2024, 'A'], [2025, 'A'], [2024, 'B'], [2025, 'B']] as const) {
      expect((await business.getBook('u', year, { person, business: 1 })).integrity.ok, `${year} ${person}`).toBe(true)
    }
    const freelancer = await business.closing('u', 2025, A1)
    expect(freelancer.euer?.profit.profitEur).toBeGreaterThan(40_000)
    const trade = await business.tradeTax('u', 2025, B1)
    expect(trade).toMatchObject({ status: 'berechnet', multiplier: { percent: 460 } })
    expect(trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0).toBeGreaterThan(0)
    const vat = await business.vatReturn('u', 2025, A1)
    expect(vat.result.prepaymentsEur).toBe(8_400)

    const before = (await business.getBook('u', 2025, B1)).entries.length
    await seedDemoHousehold(business, repository, 'u')
    expect((await business.getBook('u', 2025, B1)).entries.length).toBe(before)
  })
})
