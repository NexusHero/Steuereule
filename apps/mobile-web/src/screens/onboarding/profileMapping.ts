import type { ProfileResponseDto, PutProfileDto } from '@steuereule/api-client'
import { formatTaxId, formatStoredTaxNumber } from './format'

export interface OnboardingProfile {
  readonly firstName: string
  readonly lastName: string
  readonly steuerId: string
  readonly taxNumber: string
}

export const EMPTY_ONBOARDING_PROFILE: OnboardingProfile = {
  firstName: '',
  lastName: '',
  steuerId: '',
  taxNumber: '',
}

export function toOnboardingProfile(dto: ProfileResponseDto): OnboardingProfile {
  return {
    firstName: dto.firstName ?? '',
    lastName: dto.lastName ?? '',
    steuerId: formatTaxId(dto.steuerId ?? ''),
    taxNumber: formatStoredTaxNumber(dto.steuernummer ?? ''),
  }
}

export function toPutProfileDto(profile: OnboardingProfile): PutProfileDto {
  const steuernummer = profile.taxNumber.replace(/\D/g, '')
  const steuerId = profile.steuerId.replace(/\D/g, '')
  return {
    firstName: profile.firstName.trim(),
    lastName: profile.lastName.trim(),
    ...(steuerId ? { steuerId } : {}),
    ...(steuernummer ? { steuernummer } : {}),
  }
}
