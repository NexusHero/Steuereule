import type { ProfileResponseDto, PutProfileDto } from '@steuereule/api-client'
import { formatSteuerId, formatStoredTaxNumber } from './format'

export interface OnboardingProfil {
  readonly vorname: string
  readonly nachname: string
  readonly steuerId: string
  readonly steuerNr: string
}

export const EMPTY_ONBOARDING_PROFIL: OnboardingProfil = {
  vorname: '',
  nachname: '',
  steuerId: '',
  steuerNr: '',
}

export function toOnboardingProfil(dto: ProfileResponseDto): OnboardingProfil {
  return {
    vorname: dto.firstName ?? '',
    nachname: dto.lastName ?? '',
    steuerId: formatSteuerId(dto.steuerId ?? ''),
    steuerNr: formatStoredTaxNumber(dto.steuernummer ?? ''),
  }
}

export function toPutProfileDto(profil: OnboardingProfil): PutProfileDto {
  const steuernummer = profil.steuerNr.replace(/\D/g, '')
  const steuerId = profil.steuerId.replace(/\D/g, '')
  return {
    firstName: profil.vorname.trim(),
    lastName: profil.nachname.trim(),
    ...(steuerId ? { steuerId } : {}),
    ...(steuernummer ? { steuernummer } : {}),
  }
}
