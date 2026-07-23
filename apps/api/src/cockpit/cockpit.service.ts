// Application logic: userId+steuerjahr-scoped read, then the derived-range mapping.
// Trusts that `userId` was produced by UserContextGuard (never accepts it from a
// param/body) — mirrors ProfileService's shape.
import { Inject, Injectable } from '@nestjs/common'
import { cockpitRange } from '@steuereule/core'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from './tax-year.repository.js'
import type { CockpitSummaryDto } from './dto/cockpit-summary.dto.js'

@Injectable()
export class CockpitService {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(TAX_YEAR_REPOSITORY) private readonly repository: TaxYearRepository) {}

  async getSummary(userId: string, steuerjahr: number): Promise<CockpitSummaryDto | null> {
    const record = await this.repository.findByUserAndYear(userId, steuerjahr)
    // Null propagates as-is — "no tax year yet" is the honest empty state (REQ-001),
    // never a synthesized zero-estimate row.
    if (!record) return null

    // The one and only place the range is computed — @steuereule/core's cockpitRange,
    // never re-derived here (determinism boundary, ADR-014/048/015).
    const estimate = cockpitRange({
      estimate: record.baseEstimate,
      openItems: record.openItems,
      openConflicts: record.openConflicts,
    })

    return { taxYear: record.steuerjahr, estimate, openItems: record.openItems }
  }
}
