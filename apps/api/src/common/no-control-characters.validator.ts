import { registerDecorator, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator'

/**
 * Rejects C0/C1 control characters (incl. the null byte), DEL, and unpaired UTF-16 surrogates in a string
 * field (ADR-0104 L4). Type/emptiness is left to the sibling `@IsString()`/`@IsNotBlank()` validators, so a
 * non-string passes here. Keeps control bytes and broken Unicode out of stored free-text that is later
 * rendered, exported to PDF, or placed in headers.
 */
export function containsControlOrBrokenUnicode(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F]/.test(value)) return true
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true // high surrogate without a low one
      i += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true // lone low surrogate
    }
  }
  return false
}

@ValidatorConstraint({ name: 'noControlCharacters', async: false })
class NoControlCharactersConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value !== 'string' || !containsControlOrBrokenUnicode(value)
  }
  defaultMessage(): string {
    return 'must not contain control characters'
  }
}

export function NoControlCharacters() {
  return function (object: object, propertyName: string): void {
    registerDecorator({ name: 'noControlCharacters', target: object.constructor, propertyName, validator: NoControlCharactersConstraint })
  }
}
