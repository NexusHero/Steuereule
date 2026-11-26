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

/**
 * The PUT body for an edited profile (WEB-28, NR-01). The server keeps an absent `steuerId`/`steuernummer`
 * and clears a `null` one, so the body carries an identifier only when the user changed it against what was
 * loaded, and `null` only when they cleared a stored value. Built only from a profile that loaded: a failed
 * load never reaches here, so blanks of data that did not arrive cannot overwrite stored values.
 */
export function toPutProfileDto(profile: OnboardingProfile, loaded: OnboardingProfile): PutProfileDto {
  return {
    firstName: profile.firstName.trim(),
    lastName: profile.lastName.trim(),
    ...changedIdentifier('steuerId', profile.steuerId, loaded.steuerId),
    ...changedIdentifier('steuernummer', profile.taxNumber, loaded.taxNumber),
  }
}

function changedIdentifier(
  key: 'steuerId' | 'steuernummer',
  edited: string,
  loaded: string,
): Partial<Pick<PutProfileDto, 'steuerId' | 'steuernummer'>> {
  const digits = edited.replace(/\D/g, '')
  if (digits === loaded.replace(/\D/g, '')) return {}
  return { [key]: digits === '' ? null : digits }
}
