// class-validator adapters over @steuereule/core's pure shape predicates. This is the
// ONE place the digit-count rules are enforced server-side — they are never
// re-implemented as a hand-rolled regex here (that would be the exact drift #29
// forbids between this DTO and the #27 frontend formatter).
import { isValidSteuerId, isValidSteuernummer } from '@steuereule/core'
import { registerDecorator, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator'

@ValidatorConstraint({ name: 'isSteuerId', async: false })
class IsSteuerIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidSteuerId(value)
  }
  defaultMessage(): string {
    return 'steuerId must be exactly 11 digits'
  }
}

export function IsSteuerId() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSteuerId',
      target: object.constructor,
      propertyName,
      validator: IsSteuerIdConstraint,
    })
  }
}

@ValidatorConstraint({ name: 'isSteuernummer', async: false })
class IsSteuernummerConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // @IsOptional() already lets undefined/null through without reaching here; an
    // empty string is "present" and must still be rejected by isValidSteuernummer.
    return typeof value === 'string' && isValidSteuernummer(value)
  }
  defaultMessage(): string {
    return 'steuernummer must be 1-13 digits if present'
  }
}

export function IsSteuernummer() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSteuernummer',
      target: object.constructor,
      propertyName,
      validator: IsSteuernummerConstraint,
    })
  }
}

@ValidatorConstraint({ name: 'isNotBlank', async: false })
class IsNotBlankConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0
  }
  defaultMessage(): string {
    return '$property must not be empty or whitespace-only'
  }
}

/** Non-empty after trimming — "" and "   " are both rejected, unlike bare @IsNotEmpty(). */
export function IsNotBlank() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotBlank',
      target: object.constructor,
      propertyName,
      validator: IsNotBlankConstraint,
    })
  }
}
