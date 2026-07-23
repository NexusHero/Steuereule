// Pure-ish application logic: userId-scoped read/upsert plus the DTO -> response
// mapping. Trusts that `userId` was produced by UserContextGuard (never accepts it
// from a DTO) and that `dto` already passed the DTO-level validators — this service
// does not re-validate shape, it only ever persists what the ValidationPipe already
// let through, scoped strictly to the given userId.
import { Inject, Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRecord, type ProfileRepository } from './profile.repository.js'
import type { ProfileResponseDto } from './dto/profile-response.dto.js'
import type { PutProfileDto } from './dto/put-profile.dto.js'

@Injectable()
export class ProfileService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const record = await this.repository.findByUserId(userId)
    // Only log an access when there's actually something to access (REQ-004.2): an
    // empty GET on a never-saved profile appends no READ entry. The WRITE entry for
    // saveProfile is appended atomically with the row itself — see
    // PrismaProfileRepository.upsert — never here.
    if (record) {
      await this.auditService.append({ userId, action: 'READ', resource: 'profile' })
    }
    return toResponseDto(record)
  }

  async saveProfile(userId: string, dto: PutProfileDto): Promise<ProfileResponseDto> {
    const record = await this.repository.upsert(userId, {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      steuerId: dto.steuerId,
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
