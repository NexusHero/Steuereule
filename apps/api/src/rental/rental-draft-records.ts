import { Inject, Injectable } from '@nestjs/common'
import type { DraftRecordSource } from '../common/draft-record-source.js'
import { RENTAL_REPOSITORY, type RentalRepository } from './rental.repository.js'

/** A rental object the owl drafts (ADR-0091). It stays when the draft is undone. */
@Injectable()
export class RentalDraftRecords implements DraftRecordSource {
  readonly screen = 'vermietung'

  constructor(@Inject(RENTAL_REPOSITORY) private readonly rentalRepo: RentalRepository) {}

  async create(dataUserId: string, taxYear: number): Promise<string> {
    return (await this.rentalRepo.create(dataUserId, taxYear)).id
  }
}
