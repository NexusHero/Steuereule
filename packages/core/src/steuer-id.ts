// Shape validators for the German tax identifiers collected during Onboarding
// (steuereule#29). Pure, dependency-free predicates — the single source both the
// NestJS API's DTO validation and the Onboarding frontend formatter (steuereule#27)
// consume, so the "11 digits" / "up to 13 digits" rules cannot drift between the two
// (ADR-014/048 determinism boundary: one rule, not two copies of a regex).

/** Steuerliche Identifikationsnummer: exactly 11 digits, digit-only, no separators/whitespace. */
export function isValidSteuerId(value: string): boolean {
  return /^\d{11}$/.test(value)
}

/**
 * Steuernummer: optional. Absent (`undefined`/`null`) is valid — the field is not
 * required. If present, it must be 1–13 digits, digit-only, no separators/whitespace;
 * an empty string is "present" and therefore invalid.
 */
export function isValidSteuernummer(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true
  return /^\d{1,13}$/.test(value)
}
