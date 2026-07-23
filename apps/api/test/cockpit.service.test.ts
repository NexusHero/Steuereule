// REQ-001 — pure service logic: userId+steuerjahr scoping and the derived-range
// mapping, against the fake repository (no HTTP, no DB). Mirrors profile.service.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { cockpitRange } from '@steuereule/core'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'

describe('CockpitService', () => {
  let repository: FakeTaxYearRepository
  let service: CockpitService

  beforeEach(() => {
    repository = new FakeTaxYearRepository()
    service = new CockpitService(repository)
  })

  it('REQ-001 returns null for a userId/steuerjahr with nothing seeded — the honest empty state', async () => {
    await expect(service.getSummary('user-a', 2026)).resolves.toBeNull()
  })

  it('REQ-001 computes the estimate range via @steuereule/core’s cockpitRange, never re-deriving it', async () => {
    repository.seed('user-a', { steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary).toEqual({
      taxYear: 2026,
      estimate: cockpitRange({ estimate: 1407, openItems: 3, openConflicts: 0 }),
      openItems: 3,
    })
    expect(summary!.estimate).toEqual({ from: 1227, to: 1587 })
  })

  it('REQ-001 collapses to a point value once nothing is open (ADR-015)', async () => {
    repository.seed('user-a', { steuerjahr: 2026, baseEstimate: 1444, openItems: 0, openConflicts: 0 })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary!.estimate).toEqual({ from: 1444, to: 1444 })
  })

  it('REQ-001 factors open conflicts into the range, not just open items', async () => {
    repository.seed('user-a', { steuerjahr: 2026, baseEstimate: 1000, openItems: 1, openConflicts: 2 })

    const summary = await service.getSummary('user-a', 2026)

    // 1 item * 60 + 2 conflicts * 100 = 260
    expect(summary!.estimate).toEqual({ from: 740, to: 1260 })
  })

  it('REQ-001 strictly scopes per userId: user-b never sees user-a’s tax year', async () => {
    repository.seed('user-a', { steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 })

    await expect(service.getSummary('user-b', 2026)).resolves.toBeNull()
  })

  it('REQ-001 strictly scopes per steuerjahr: the same userId with only 2026 seeded returns null for 2025', async () => {
    repository.seed('user-a', { steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 })

    await expect(service.getSummary('user-a', 2025)).resolves.toBeNull()
  })
})
