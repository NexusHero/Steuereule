import { Inject, Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRecord, type ProfileRepository } from './profile.repository.js'
import type { ProfileResponseDto } from './dto/profile-response.dto.js'
import type { PutProfileDto } from './dto/put-profile.dto.js'

/** Pure-ish application logic: userId-scoped read/upsert plus the DTO -> response mapping. */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const record = await this.repository.findByUserId(userId)
    if (record) {
      await this.auditService.append({ userId, action: 'READ', resource: 'profile' })
    }
    return toResponseDto(record)
  }

  async saveProfile(userId: string, dto: PutProfileDto): Promise<ProfileResponseDto> {
    const record = await this.repository.upsert(userId, {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      steuerId: dto.steuerId ?? null,
      steuernummer: dto.steuernummer ?? null,
    })
    return toResponseDto(record)
  }
}

function toResponseDto(record: ProfileRecord | null): ProfileResponseDto {
  return {
    firstName: record?.firstName ?? null,
    lastName: record?.lastName ?? null,
    steuerId: record?.steuerId ?? null,
    steuernummer: record?.steuernummer ?? null,
  }
}
