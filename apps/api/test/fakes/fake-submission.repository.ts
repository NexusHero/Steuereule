// In-memory fake of the Abgabe write seam (ADR-0098 §8). It writes into the same FakeFilingVersionRepository
// the Verlauf and the Bescheidprüfung read, so a test sees a submission the way the app does.
import type { TaxYearStatus } from '@steuereule/core'
import type { NewFilingVersion, SubmissionRepository } from '../../src/submission/submission.repository.js'
import type { FakeAuditRepository } from './fake-audit.repository.js'
import type { FakeFilingVersionRepository } from './fake-filing-version.repository.js'

const key = (userId: string, taxYear: number) => `${userId}::${taxYear}`

export class FakeSubmissionRepository implements SubmissionRepository {
  private readonly statuses = new Map<string, TaxYearStatus>()

  constructor(
    readonly versions: FakeFilingVersionRepository,
    private readonly audit?: FakeAuditRepository,
  ) {}

  seedYear(userId: string, taxYear: number, status: TaxYearStatus = 'entwurf'): void {
    this.statuses.set(key(userId, taxYear), status)
  }

  yearStatus(userId: string, taxYear: number): Promise<TaxYearStatus | null> {
    return Promise.resolve(this.statuses.get(key(userId, taxYear)) ?? null)
  }

  async record(version: NewFilingVersion): Promise<{ replacedPrevious: boolean }> {
    const previous = await this.versions.findLatest(version.userId, version.taxYear)
    this.versions.removeYear(version.userId, version.taxYear)
    this.versions.seed({ ...version, number: (previous?.number ?? 0) + 1 })
    this.statuses.set(key(version.userId, version.taxYear), 'eingereicht')
    await this.audit?.append({ userId: version.userId, action: 'WRITE', resource: 'abgabe' })
    return { replacedPrevious: previous !== null }
  }

  async withdraw(userId: string, taxYear: number): Promise<void> {
    this.versions.removeYear(userId, taxYear)
    this.statuses.set(key(userId, taxYear), 'entwurf')
    await this.audit?.append({ userId, action: 'WRITE', resource: 'abgabe' })
  }
}
