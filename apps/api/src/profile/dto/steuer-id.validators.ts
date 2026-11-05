import { isValidTaxId, isValidTaxNumber } from '@steuereule/core'
import { registerDecorator, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator'

@ValidatorConstraint({ name: 'isSteuerId', async: false })
class IsSteuerIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTaxId(value)
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
    return typeof value === 'string' && isValidTaxNumber(value)
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
