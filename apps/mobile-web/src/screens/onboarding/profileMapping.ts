import type { ProfileResponseDto, PutProfileDto } from '@steuereule/api-client'
import { formatTaxId, formatStoredTaxNumber } from './format'

export interface OnboardingProfile {
  readonly vorname: string
  readonly nachname: string
  readonly steuerId: string
  readonly taxNumber: string
}

export const EMPTY_ONBOARDING_PROFILE: OnboardingProfile = {
  vorname: '',
  nachname: '',
  steuerId: '',
  taxNumber: '',
}

export function toOnboardingProfile(dto: ProfileResponseDto): OnboardingProfile {
  return {
    vorname: dto.firstName ?? '',
    nachname: dto.lastName ?? '',
    steuerId: formatTaxId(dto.steuerId ?? ''),
    taxNumber: formatStoredTaxNumber(dto.steuernummer ?? ''),
  }
}

export function toPutProfileDto(profile: OnboardingProfile): PutProfileDto {
  const steuernummer = profile.taxNumber.replace(/\D/g, '')
  const steuerId = profile.steuerId.replace(/\D/g, '')
  return {
    firstName: profile.vorname.trim(),
    lastName: profile.nachname.trim(),
    ...(steuerId ? { steuerId } : {}),
    ...(steuernummer ? { steuernummer } : {}),
  }
}
