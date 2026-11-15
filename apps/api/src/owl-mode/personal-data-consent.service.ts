import { Inject, Injectable } from '@nestjs/common'
import { OWL_PERSONAL_DATA_CONSENT_VERSION } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PERSONAL_DATA_CONSENT_REPOSITORY, type PersonalDataConsentRecord, type PersonalDataConsentRepository } from './personal-data-consent.repository.js'

export interface PersonalDataConsentState {
  readonly granted: boolean
  /** The consent text the app shows now; a consent to another version does not count. */
  readonly version: string
  readonly grantedAt: string | null
}

const counts = (record: PersonalDataConsentRecord | null): record is PersonalDataConsentRecord =>
  record !== null && record.revokedAt === null && record.version === OWL_PERSONAL_DATA_CONSENT_VERSION

/**
 * ADR-0091: without this consent the owl works as before — personal data is masked before the
 * model and the identifying fields stay closed. With it, the owl may read and draft them.
 * Revoking takes effect with the next request; nothing is cached.
 */
@Injectable()
export class PersonalDataConsentService {
  constructor(
    @Inject(PERSONAL_DATA_CONSENT_REPOSITORY) private readonly repository: PersonalDataConsentRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async hasConsent(userId: string): Promise<boolean> {
    return counts(await this.repository.findByUserId(userId))
  }

  async state(userId: string): Promise<PersonalDataConsentState> {
    const record = await this.repository.findByUserId(userId)
    return {
      granted: counts(record),
      version: OWL_PERSONAL_DATA_CONSENT_VERSION,
      grantedAt: counts(record) ? record.grantedAt.toISOString() : null,
    }
  }

  async set(userId: string, granted: boolean, now = new Date()): Promise<PersonalDataConsentState> {
    if (granted) {
      await this.repository.grant(userId, OWL_PERSONAL_DATA_CONSENT_VERSION, now)
      await this.auditService.append({ userId, action: 'WRITE', resource: 'eulen_personendaten_einwilligung' })
    } else {
      await this.repository.revoke(userId, now)
      await this.auditService.append({ userId, action: 'WRITE', resource: 'eulen_personendaten_einwilligung_widerruf' })
    }
    return this.state(userId)
  }
}
