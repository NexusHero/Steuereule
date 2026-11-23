import { Inject, Injectable } from '@nestjs/common'
import type { DraftRecordSource } from '../common/draft-record-source.js'
import { CHILD_REPOSITORY, type ChildRepository } from './child.repository.js'

/** A child the owl drafts from its first name and birth date (ADR-0091); undo removes it again. */
@Injectable()
export class ChildDraftRecords implements DraftRecordSource {
  readonly screen = 'kind'

  constructor(@Inject(CHILD_REPOSITORY) private readonly childRepo: ChildRepository) {}

  async create(dataUserId: string, taxYear: number, values: Readonly<Record<string, string>>): Promise<string> {
    const child = await this.childRepo.create(dataUserId, taxYear, {
      firstName: values.firstName ?? '',
      lastName: values.lastName ?? '',
      geburtsdatum: values.geburtsdatum ?? '',
    })
    return child.id
  }

  async remove(dataUserId: string, taxYear: number, id: string): Promise<void> {
    await this.childRepo.delete(dataUserId, taxYear, id)
  }
}
