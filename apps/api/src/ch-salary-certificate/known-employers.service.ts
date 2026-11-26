import { Inject, Injectable, Optional } from '@nestjs/common'
import { LinkService } from '../link/link.service.js'
import { AuditService } from '../audit/audit.service.js'
import { appendReadAudit } from '../common/read-audit.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from './ch-salary-certificate.repository.js'

export interface KnownEmployer {
  readonly name: string
  readonly strasse: string
  readonly plzOrt: string
}

/**
 * The employers the household has recorded (Echtdatentest 18.11.2026): the N-Gre employer of every Swiss
 * salary certificate of the user and of a Person B recorded in this account, in all years. Suggestions
 * for the next certificate — nothing is stored on its own, and a fresh account knows none.
 */
@Injectable()
export class KnownEmployersService {
  constructor(
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly repository: CrossBorderSalaryStatementRepository,
    @Inject(LinkService) private readonly link: LinkService,
    @Optional() @Inject(AuditService) private readonly audit?: AuditService,
  ) {}

  async list(userId: string): Promise<readonly KnownEmployer[]> {
    const partners = await this.link.recordedPartnerUserIds(userId)
    const records = await this.repository.listForUsers([userId, ...partners])
    // Person B's certificates are read too: the row is the caller's, B's own account (if any) gets one as well.
    if (records.length > 0) await appendReadAudit(this.audit, userId, 'arbeitgeber', [...new Set(records.map((record) => record.userId))])
    const byName = new Map<string, KnownEmployer>()
    // The latest year comes first, so its address is the one kept.
    for (const record of records) {
      const name = record.nGre.arbeitgeberName?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (byName.has(key)) continue
      byName.set(key, { name, strasse: record.nGre.arbeitgeberStrasse?.trim() ?? '', plzOrt: record.nGre.arbeitgeberPlzOrt?.trim() ?? '' })
    }
    return [...byName.values()]
  }
}
