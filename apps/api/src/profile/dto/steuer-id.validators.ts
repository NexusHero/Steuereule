import { isValidTaxId, isValidTaxNumber } from '@steuereule/core'
import { registerDecorator, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator'

@ValidatorConstraint({ name: 'isSteuerId', async: false })
class IsTaxIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTaxId(value)
  }
  defaultMessage(): string {
    return 'steuerId must be exactly 11 digits'
  }
}

export function IsTaxId() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSteuerId',
      target: object.constructor,
      propertyName,
      validator: IsTaxIdConstraint,
    })
  }
}

@ValidatorConstraint({ name: 'isSteuernummer', async: false })
class IsTaxNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTaxNumber(value)
  }
  defaultMessage(): string {
    return 'steuernummer must be 1-13 digits if present'
  }
}

export function IsTaxNumber() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSteuernummer',
      target: object.constructor,
      propertyName,
      validator: IsTaxNumberConstraint,
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
