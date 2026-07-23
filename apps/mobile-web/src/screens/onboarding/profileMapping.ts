// Maps between the Onboarding screen's local field names (vorname/nachname/steuerId/
// steuerNr — the shape the three-step flow has always used) and the Profile API's DTOs
// (firstName/lastName/steuerId/steuernummer). Pure and dependency-free so it is testable
// without rendering the screen or hitting the network (steuereule#27 vertical join).
import type { ProfileResponseDto, PutProfileDto } from '@steuereule/api-client'
import { formatSteuerId, formatSteuerNr } from './format'

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

/**
 * GET response -> screen state. A `null` field (nothing saved yet) becomes ''. The Steuer-ID/
 * Steuernummer are run through the same formatSteuerId/formatSteuerNr grouping the typing path
 * applies, so a prefilled value renders identically to a freshly typed one (steuereule#60) —
 * the raw digits round-trip unchanged, only the on-screen grouping is added.
 */
export function toOnboardingProfil(dto: ProfileResponseDto): OnboardingProfil {
  return {
    vorname: dto.firstName ?? '',
    nachname: dto.lastName ?? '',
    steuerId: formatSteuerId(dto.steuerId ?? ''),
    steuerNr: formatSteuerNr(dto.steuernummer ?? ''),
  }
}

/**
 * Screen state -> PUT payload. Strips the display-only grouping spaces/slashes the
 * onboarding masks add (formatSteuerId/formatSteuerNr) back down to the bare digits the
 * API's shared validators (@steuereule/core) expect; an empty Steuernummer is omitted
 * entirely rather than sent as `''` (the field is optional, not "present but blank").
 */
export function toPutProfileDto(profil: OnboardingProfil): PutProfileDto {
  const steuernummer = profil.steuerNr.replace(/\D/g, '')
  return {
    firstName: profil.vorname.trim(),
    lastName: profil.nachname.trim(),
    steuerId: profil.steuerId.replace(/\D/g, ''),
    ...(steuernummer ? { steuernummer } : {}),
  }
}
